import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { Match, MatchAnalysis, SportType } from "../types";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { runMonteCarlo } from "./simulationService";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");
  return new GoogleGenAI({ apiKey });
};

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        if (retries === 0) throw e;
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1, delay * 2);
    }
}

// --- SCHEMAS ZOD ---
const AnalysisSchema = z.object({
  matchId: z.string().optional(),
  reasoning_trace: z.string().describe("Trace de réflexion"),
  summary: z.string(),
  predictions: z.array(z.object({
    betType: z.string(),
    selection: z.string(),
    odds: z.coerce.number(),
    confidence: z.coerce.number().min(0).max(100),
    units: z.coerce.number(),
    reasoning: z.string(),
    edge: z.coerce.number().optional()
  })).min(3),
  keyDuel: z.object({
    player1: z.string(),
    player2: z.string(),
    statLabel: z.string(),
    value1: z.union([z.string(), z.number()]),
    value2: z.union([z.string(), z.number()]),
    winner: z.enum(['player1', 'player2', 'equal'])
  }).optional(),
  injuries: z.array(z.union([z.string(), z.object({ player: z.string(), status: z.string(), impact: z.string().optional() })])),
  keyFactors: z.array(z.string()),
  scenarios: z.array(z.object({
    condition: z.string(),
    outcome: z.string(),
    likelihood: z.string(),
    reasoning: z.string().optional()
  })),
  advancedStats: z.array(z.object({
    label: z.string(),
    homeValue: z.union([z.string(), z.number()]),
    awayValue: z.union([z.string(), z.number()]),
    advantage: z.enum(['home', 'away', 'equal'])
  })),
  simulationInputs: z.object({
    homeAttack: z.coerce.number(), homeDefense: z.coerce.number(), awayAttack: z.coerce.number(), awayDefense: z.coerce.number(), tempo: z.coerce.number().optional()
  }),
  liveStrategy: z.object({
    triggerTime: z.string(), condition: z.string(), action: z.string(), targetOdds: z.coerce.number(), rationale: z.string()
  }),
  liveScore: z.string().optional(),
  matchMinute: z.string().optional(),
  weather: z.string().optional(),
  referee: z.string().optional()
});

// --- UTILS ---
const getParisDateParts = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const short = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });
    const full = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
    return { short, full };
};

const getCurrentParisTime = () => new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

const isMatchExpired = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr || !timeStr) return true;
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const [day, month] = dateStr.split('/').map(Number);
    const cleanTime = timeStr.replace('h', ':');
    const [hour, minute] = cleanTime.split(':').map(Number);
    const matchDate = new Date(now.getFullYear(), month - 1, day, hour, minute);
    if (month === 1 && now.getMonth() === 11) matchDate.setFullYear(now.getFullYear() + 1);
    if (month === 12 && now.getMonth() === 0) matchDate.setFullYear(now.getFullYear() - 1);
    const bufferMinutes = 135; 
    return now > new Date(matchDate.getTime() + (bufferMinutes * 60 * 1000));
};

const isLive = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr || !timeStr) return false;
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const cleanTime = timeStr.replace('h', ':');
    const [h, m] = cleanTime.split(':').map(Number);
    const matchTime = h * 60 + m;
    const nowTime = now.getHours() * 60 + now.getMinutes();
    const { short: todayShort } = getParisDateParts(0);
    const { short: tomorrowShort } = getParisDateParts(1);

    if (dateStr === todayShort) return nowTime >= matchTime && nowTime < matchTime + 135;
    if (dateStr === tomorrowShort && nowTime < 600) return nowTime >= matchTime && nowTime < matchTime + 150;
    return false;
};

const isValidMatchDate = (matchDate: string, matchTime: string, sport: string) => {
    if (!matchTime || !matchDate) return false;
    const { short: today } = getParisDateParts(0);
    const { short: tomorrow } = getParisDateParts(1);
    if (matchDate === today) return true;
    if (matchDate === tomorrow) {
         const cleanTime = matchTime.replace('h', ':');
         return parseInt(cleanTime.split(':')[0] || "0") < 10; 
    }
    return false;
};

const cleanAndParseJSON = (text: string) => {
    try {
        let cleanText = text.replace(/```json\n/g, "").replace(/```/g, "").trim();
        const firstBrace = cleanText.indexOf('{');
        const firstBracket = cleanText.indexOf('[');
        let start = -1;
        if (firstBrace !== -1 && firstBracket !== -1) start = Math.min(firstBrace, firstBracket);
        else if (firstBrace !== -1) start = firstBrace;
        else if (firstBracket !== -1) start = firstBracket;
        const lastBrace = cleanText.lastIndexOf('}');
        const lastBracket = cleanText.lastIndexOf(']');
        const end = Math.max(lastBrace, lastBracket);
        if (start !== -1 && end !== -1) cleanText = cleanText.substring(start, end + 1);
        return JSON.parse(cleanText);
    } catch (e) { return []; }
};

// --- FETCHING (MARKET RADAR INCLUS) ---
export const fetchDailyMatches = async (category: string = 'All'): Promise<Match[]> => {
    const ai = getClient();
    const { full: todayFull, short: todayShort } = getParisDateParts(0);
    const { full: tomorrowFull, short: tomorrowShort } = getParisDateParts(1);
    const currentTime = getCurrentParisTime();
    
    let promptContext = "";
    let searchQuery = "";
    
    if (category === 'Basketball' || category === 'NBA') {
        promptContext = `FOCUS EXCLUSIF: Matchs NBA Nuit.`;
        searchQuery = `"Programme NBA ${todayShort}" "NBA dropping odds today"`;
    } else if (category === 'Football') {
        promptContext = `FOCUS EXCLUSIF: Foot Top 5 Europe.`;
        searchQuery = `"Programme foot ${todayShort}" "Football market movers dropping odds"`;
    } else {
        promptContext = `FOCUS: Top Matchs Foot & NBA.`;
        searchQuery = `"Matchs du jour cotes" "Dropping odds football nba today"`;
    }

    const prompt = `
      RÔLE: API MARKET RADAR & FIXTURES.
      DATE: ${todayFull}. HEURE: ${currentTime}.
      
      MISSION:
      1. Lister les matchs A VENIR/EN COURS.
      2. Trouver les COTES RÉELLES.
      3. DÉTECTER LES MOUVEMENTS DE MARCHÉ (Dropping Odds).
      
      RECHERCHE GOOGLE: ${searchQuery}
      
      ${promptContext}

      RÈGLES DOUANIÈRES:
      1. IGNORER matchs de DEMAIN (${tomorrowShort}) SAUF NBA NUIT.
      2. IGNORER matchs finis.
      3. MARKET RADAR: Si tu vois une cote qui chute (ex: ouverte à 2.10, maintenant 1.80), indique-le dans "marketMove".
      
      FORMAT JSON:
      [
        { 
          "homeTeam": "Lille", "awayTeam": "Rennes", "league": "L1", "time": "21:00", "date": "${todayShort}", "sport": "Football", 
          "quickOdds": 2.15,
          "marketMove": "-15% Drop" (Optionnel, si détecté),
          "marketAlert": "dropping" (Optionnel: 'dropping' ou 'heavy')
        }
      ]
    `;

    return withRetry(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        const rawData = cleanAndParseJSON(response.text || "[]");
        if (!Array.isArray(rawData)) throw new Error("Format invalide");
        
        return rawData.map((m: any) => ({
            id: `${m.homeTeam}-${m.awayTeam}-${m.date}`.replace(/\s+/g, '-').toLowerCase(),
            homeTeam: m.homeTeam, awayTeam: m.awayTeam, league: m.league,
            time: m.time || "00:00", date: m.date,
            sport: (m.league?.includes('NBA') || m.sport === 'Basketball') ? SportType.BASKETBALL : SportType.FOOTBALL,
            status: (isLive(m.date, m.time) ? 'live' : 'scheduled') as Match['status'],
            quickPrediction: "Analyse IA", quickConfidence: 0, 
            quickOdds: Number(m.quickOdds) || 0,
            isTrending: (Number(m.quickOdds) > 0) && (Number(m.quickOdds) < 2.5),
            // Mapping des nouveaux champs Radar
            marketMove: m.marketMove || undefined,
            marketAlert: (['dropping', 'heavy', 'stable'].includes(m.marketAlert) ? m.marketAlert : undefined) as Match['marketAlert']
        })).filter((m: any) => m.date && isValidMatchDate(m.date, m.time, m.sport) && !isMatchExpired(m.date, m.time));
    });
};

// --- ANALYSE DEEP (FIX SCORE LIVE) ---
export const analyzeMatchDeeply = async (match: Match): Promise<MatchAnalysis> => {
    const ai = getClient();
    const isLiveMatch = match.status === 'live';
    
    const oddsContext = match.quickOdds > 0 
        ? `INFO: Cote actuelle ${match.quickOdds}.` 
        : `INFO: Aucune cote trouvée.`;

    // INSTRUCTION ANTI-HALLUCINATION SCORE
    const instructions = isLiveMatch 
        ? `URGENT LIVE: Match EN COURS.
           ACTION: Cherche "Score en direct ${match.homeTeam} ${match.awayTeam}".
           ⚠️ ATTENTION: Ne confonds PAS "Pronostic" (2-1) avec "Score Actuel" (0-0).
           SI TU TROUVES UN PRONOSTIC MAIS PAS DE SCORE LIVE CONFIRMÉ, METS "0-0" ou "N/A" DANS LE SCORE. NE METS JAMAIS UN PRONOSTIC COMME SCORE.` 
        : `PRÉ-MATCH: Cherche infos blessures, stats avancées.`;

    const searchContext = match.sport === SportType.BASKETBALL 
        ? `"NBA score live ${match.homeTeam} ${match.awayTeam}", "Positive Residual"` 
        : `"Live score exact ${match.homeTeam} ${match.awayTeam} maintenant", "Understat xG"`;

    const judgePrompt = `
        RÔLE: Analyste Quantitatif. MATCH: ${match.homeTeam} vs ${match.awayTeam}.
        STATUT: ${isLiveMatch ? "EN DIRECT" : "A VENIR"}.
        LANGUE: FRANÇAIS.
        
        ${instructions}
        ${oddsContext}

        ÉTAPE 1 (SEARCH): ${searchContext}.
        ÉTAPE 2 (THINKING): "reasoning_trace". Vérifie doublement le score si Live.
        ÉTAPE 3 (JSON): Rapport final.

        RÈGLES:
        - DUEL: Trouve un duel de joueurs clé.
        - SCORE LIVE: Si incertain, mets "". Ne jamais inventer.

        FORMAT JSON:
        {
            "reasoning_trace": "...",
            "matchId": "${match.id}",
            "keyDuel": { "player1": "...", "player2": "...", "statLabel": "...", "value1": 0, "value2": 0, "winner": "player1" },
            "summary": "...",
            "predictions": [{ "betType": "Vainqueur", "selection": "...", "odds": 0, "confidence": 80, "units": 1, "reasoning": "...", "edge": 0 }],
            "liveScore": "", "matchMinute": "",
            "injuries": [], "keyFactors": [], "scenarios": [], "advancedStats": [],
            "simulationInputs": { "homeAttack": 50, "homeDefense": 50, "awayAttack": 50, "awayDefense": 50, "tempo": 50 },
            "liveStrategy": { "triggerTime": "", "condition": "", "action": "", "targetOdds": 0, "rationale": "" }
        }
    `;

    return withRetry(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: judgePrompt,
            config: { tools: [{ googleSearch: {} }] }
        });

        const rawJson = cleanAndParseJSON(response.text || "{}");
        // Cast to MatchAnalysis to avoid "Property 'monteCarlo' does not exist" error,
        // as monteCarlo is not in the Zod schema but is present in the MatchAnalysis interface.
        const verifiedData = AnalysisSchema.parse(rawJson) as MatchAnalysis;

        if (verifiedData.simulationInputs) verifiedData.monteCarlo = runMonteCarlo(verifiedData.simulationInputs, match.sport);
        verifiedData.matchId = match.id;

        if (isSupabaseConfigured()) {
            supabase!.from('match_analyses').upsert({ match_id: match.id, analysis: verifiedData, updated_at: new Date().toISOString() }, { onConflict: 'match_id' }).then(() => {});
        }
        return verifiedData as MatchAnalysis;
    }, 2);
};
