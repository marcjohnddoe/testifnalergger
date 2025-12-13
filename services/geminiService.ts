import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { Match, MatchAnalysis, SportType } from "../types";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { runMonteCarlo } from "./simulationService";

// --- UTILITAIRE ENV ---
const getEnv = (key: string) => {
  if (typeof window !== 'undefined' && (window as any).__ENV__ && (window as any).__ENV__[key]) return (window as any).__ENV__[key];
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) return (import.meta as any).env[key];
  if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
  return '';
};

// --- CONFIG ---
const getClient = () => {
  const apiKey = getEnv('API_KEY');
  if (!apiKey) {
      console.error("API KEY MANQUANTE !");
      throw new Error("API Key missing");
  }
  return new GoogleGenAI({ apiKey });
};

const RAPID_API_KEY = getEnv('RAPID_API_KEY');

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (e) {
        if (retries === 0) throw e;
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1, delay * 2);
    }
}

// --- SCHEMAS ZOD (ULTRA PERMISSIF) ---
// On utilise z.any() pour les tableaux complexes pour éviter que Zod ne bloque tout.
// Le nettoyage se fera manuellement dans le code via sanitizeData.
const AnalysisSchema = z.object({
  matchId: z.string().optional(),
  reasoning_trace: z.string().optional(),
  summary: z.string().optional().default("Analyse disponible."),
  predictions: z.array(z.any()).optional().default([]),
  keyDuel: z.any().optional().nullable(),
  injuries: z.array(z.any()).optional().default([]),
  keyFactors: z.array(z.string()).optional().default([]),
  scenarios: z.array(z.any()).optional().default([]),
  advancedStats: z.array(z.any()).optional().default([]),
  simulationInputs: z.object({
    homeAttack: z.coerce.number(), homeDefense: z.coerce.number(), awayAttack: z.coerce.number(), awayDefense: z.coerce.number(), tempo: z.coerce.number().optional()
  }).optional(),
  liveStrategy: z.any().optional(),
  liveScore: z.string().optional(),
  matchMinute: z.string().optional(),
  weather: z.string().optional(),
  referee: z.string().optional(),
  tvChannel: z.string().optional()
});

// --- UTILS ---
const getParisDateParts = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    // apiDate: format YYYY-MM-DD pour API Sports
    // displayDate: format DD/MM pour l'affichage et l'IA
    return { apiDate: `${year}-${month}-${day}`, displayDate: `${day}/${month}`, full: d.toLocaleDateString('fr-FR') };
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
    const bufferMinutes = 240; // Buffer large de 4h pour éviter de cacher les lives
    return now > new Date(matchDate.getTime() + (bufferMinutes * 60 * 1000));
};

const isLive = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr || !timeStr) return false;
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const cleanTime = timeStr.replace('h', ':');
    const [h, m] = cleanTime.split(':').map(Number);
    const matchTime = h * 60 + m;
    const nowTime = now.getHours() * 60 + now.getMinutes();
    const { displayDate: todayShort } = getParisDateParts(0);
    const { displayDate: tomorrowShort } = getParisDateParts(1);
    
    if (dateStr === todayShort) return nowTime >= matchTime && nowTime < matchTime + 210;
    if (dateStr === tomorrowShort && nowTime < 600) return nowTime >= matchTime && nowTime < matchTime + 210;
    return false;
};

const isValidMatchDate = (matchDate: string, matchTime: string, sport: string) => {
    if (!matchTime || !matchDate) return false;
    const { displayDate: today } = getParisDateParts(0);
    const { displayDate: tomorrow } = getParisDateParts(1);
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
        const lastBrace = cleanText.lastIndexOf('}');
        // On essaye de récupérer l'objet JSON même s'il y a du texte autour
        if (firstBrace !== -1 && lastBrace !== -1) cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        return JSON.parse(cleanText);
    } catch (e) { return {}; }
};

// --- HELPER DE NETTOYAGE (LE FIX MAGIQUE) ---
const sanitizeData = (data: any) => {
    // 1. Réparer les Scénarios (Transformer les strings en objets)
    if (Array.isArray(data.scenarios)) {
        data.scenarios = data.scenarios.map((s: any) => {
            if (typeof s === 'string') return { condition: s, outcome: "N/A", likelihood: "Low" };
            return s;
        }).filter((s: any) => s && typeof s === 'object');
    }

    // 2. Réparer les Stats Avancées (Remplir les trous)
    if (Array.isArray(data.advancedStats)) {
        data.advancedStats = data.advancedStats.map((s: any) => ({
            label: s?.label || "Statistique",
            homeValue: s?.homeValue ?? 0,
            awayValue: s?.awayValue ?? 0,
            advantage: s?.advantage || "equal"
        }));
    }

    // 3. Réparer les Prédictions
    if (Array.isArray(data.predictions)) {
        data.predictions = data.predictions.map((p: any) => ({
            ...p,
            confidence: Number(p?.confidence) || 50,
            odds: Number(p?.odds) || 0,
            units: Number(p?.units) || 1
        }));
    }

    return data;
};

// --- FETCHING ---
const LEAGUES_ID = {
    LIGUE_1: 61, PREMIER_LEAGUE: 39, LIGA: 140, SERIE_A: 135, BUNDESLIGA: 78, CHAMPIONS_LEAGUE: 2,
    NBA: 12, EURO_LEAGUE: 120
};

export const fetchDailyMatches = async (category: string = 'All'): Promise<Match[]> => {
    // Si une clé API Sports est configurée, on l'utilise pour plus de rapidité/précision
    if (RAPID_API_KEY && RAPID_API_KEY.length > 5) {
        try { return await fetchFromRealAPI(category); } catch (e) { console.error("API Error, fallback to AI", e); }
    }
    // Sinon, on utilise le scraper IA (Gemini)
    return fetchFromGeminiScraper(category);
};

async function fetchFromRealAPI(category: string): Promise<Match[]> {
    const { apiDate, displayDate } = getParisDateParts(0);
    const headers = { 'x-rapidapi-host': 'v3.football.api-sports.io', 'x-rapidapi-key': RAPID_API_KEY };
    let matches: Match[] = [];

    if (category === 'All' || category === 'Football' || category === SportType.FOOTBALL) {
        const res = await fetch(`https://v3.football.api-sports.io/fixtures?date=${apiDate}`, { headers });
        const json = await res.json();
        if (json.response) {
            matches = [...matches, ...json.response.filter((m: any) => Object.values(LEAGUES_ID).includes(m.league.id)).map((m: any) => mapApiFootballToMatch(m, displayDate))];
        }
    }
    if (category === 'All' || category === 'Basketball' || category === 'NBA' || category === SportType.BASKETBALL) {
        const basketHeaders = { ...headers, 'x-rapidapi-host': 'v1.basketball.api-sports.io' };
        const res = await fetch(`https://v1.basketball.api-sports.io/games?date=${apiDate}`, { headers: basketHeaders });
        const json = await res.json();
        if (json.response) {
            matches = [...matches, ...json.response.filter((m: any) => m.league.id === LEAGUES_ID.NBA || m.league.id === LEAGUES_ID.EURO_LEAGUE).map((m: any) => mapApiBasketballToMatch(m, displayDate))];
        }
    }
    return matches;
}

const mapApiFootballToMatch = (m: any, dateShort: string): Match => {
    const statusShort = m.fixture.status.short;
    const isLive = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(statusShort);
    const isFinished = ['FT', 'AET', 'PEN'].includes(statusShort);
    const scoreStr = isLive ? `${m.goals.home}-${m.goals.away}` : null;
    return {
        id: `foot-${m.fixture.id}`,
        homeTeam: m.teams.home.name, awayTeam: m.teams.away.name, league: m.league.name,
        time: new Date(m.fixture.date).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}),
        date: dateShort, sport: SportType.FOOTBALL,
        status: isLive ? 'live' : isFinished ? 'finished' : 'scheduled',
        quickOdds: 0, marketMove: isLive ? `Score: ${scoreStr}` : null, marketAlert: isLive ? 'dropping' : undefined
    };
};

const mapApiBasketballToMatch = (m: any, dateShort: string): Match => {
    const statusShort = m.status.short;
    const isLive = ['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'HT'].includes(statusShort);
    const isFinished = ['FT', 'AOT'].includes(statusShort);
    const scoreStr = isLive ? `${m.scores.home.total}-${m.scores.away.total}` : null;
    return {
        id: `basket-${m.id}`,
        homeTeam: m.teams.home.name, awayTeam: m.teams.away.name, league: "NBA",
        time: new Date(m.date).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}),
        date: dateShort, sport: SportType.BASKETBALL,
        status: isLive ? 'live' : isFinished ? 'finished' : 'scheduled',
        quickOdds: 0, marketMove: isLive ? `Live: ${scoreStr}` : null, marketAlert: isLive ? 'dropping' : undefined
    };
};

// Fallback: Scraper IA si pas de clé API Sports
async function fetchFromGeminiScraper(category: string): Promise<Match[]> {
    const ai = getClient();
    const { full: todayFull, displayDate: todayShort } = getParisDateParts(0);
    const { displayDate: tomorrowShort } = getParisDateParts(1);
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
        if (!Array.isArray(rawData)) return [];
        
        return rawData.map((m: any) => ({
            id: `${m.homeTeam}-${m.awayTeam}-${m.date}`.replace(/\s+/g, '-').toLowerCase(),
            homeTeam: m.homeTeam, awayTeam: m.awayTeam, league: m.league,
            time: m.time || "00:00", date: m.date,
            sport: (m.league?.includes('NBA') || m.sport === 'Basketball') ? SportType.BASKETBALL : SportType.FOOTBALL,
            status: (isLive(m.date, m.time) ? 'live' : 'scheduled') as Match['status'],
            quickPrediction: "Analyse IA", quickConfidence: 0, 
            quickOdds: Number(m.quickOdds) || 0,
            isTrending: (Number(m.quickOdds) > 0) && (Number(m.quickOdds) < 2.5),
            marketMove: m.marketMove || undefined,
            marketAlert: (['dropping', 'heavy', 'stable'].includes(m.marketAlert) ? m.marketAlert : undefined) as Match['marketAlert']
        })).filter((m: any) => m.date && isValidMatchDate(m.date, m.time, m.sport) && !isMatchExpired(m.date, m.time));
    });
}

// --- ANALYSE DEEP (AVEC SANITIZER) ---
export const analyzeMatchDeeply = async (match: Match): Promise<MatchAnalysis> => {
    const ai = getClient();
    const isLiveMatch = match.status === 'live';
    
    let searchQueries = "";
    if (isLiveMatch) {
        searchQueries = `"${match.league} ${match.homeTeam} vs ${match.awayTeam} live score" "${match.homeTeam} vs ${match.awayTeam} stats"`;
    } else {
        if (match.sport === SportType.BASKETBALL) {
            searchQueries = `"NBA stats ${match.homeTeam} ${match.awayTeam}" "Positive Residual"`;
        } else {
            searchQueries = `"Stats ${match.homeTeam} ${match.awayTeam} xG" "Compo probables"`;
        }
    }

    const instructions = isLiveMatch 
        ? `URGENT LIVE: Match EN COURS. Trouve le SCORE EXACT.` 
        : `PRÉ-MATCH: Cherche les blessures, stats avancées et cotes.`;

    const judgePrompt = `
        RÔLE: Analyste Quantitatif Sportif.
        MATCH: ${match.homeTeam} vs ${match.awayTeam}.
        STATUT: ${isLiveMatch ? "EN DIRECT 🔴" : "A VENIR 📅"}.
        LANGUE: FRANÇAIS.
        
        ${instructions}

        ÉTAPE 1 (SEARCH): Recherche Google: ${searchQueries}.
        ÉTAPE 2 (THINKING): Analyse la dynamique.
        ÉTAPE 3 (JSON): Remplis le rapport.

        FORMAT JSON STRICT:
        {
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
            // ON GARDE GEMINI 3 PRO (Modèle Créatif) - Comme demandé
            model: "gemini-3-pro-preview", 
            contents: judgePrompt,
            config: { tools: [{ googleSearch: {} }] }
        });

        const rawJson = cleanAndParseJSON(response.text || "{}");
        
        // 1. ZOD "SOFT" (Validation basique)
        let verifiedData: any = rawJson;
        try {
             verifiedData = AnalysisSchema.parse(rawJson);
        } catch (zodError) {
             console.warn("Zod Error (Ignored due to auto-fix):", zodError);
             verifiedData = rawJson;
        }

        // 2. NETTOYAGE MANUEL (La clé pour ne plus crash)
        verifiedData = sanitizeData(verifiedData);

        if (verifiedData.simulationInputs) verifiedData.monteCarlo = runMonteCarlo(verifiedData.simulationInputs, match.sport);
        verifiedData.matchId = match.id;

        if (isSupabaseConfigured()) {
            supabase!.from('match_analyses').upsert({ match_id: match.id, analysis: verifiedData, updated_at: new Date().toISOString() }, { onConflict: 'match_id' }).then(() => {});
        }
        return verifiedData as MatchAnalysis;
    }, 2);
};