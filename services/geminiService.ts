import { GoogleGenAI, Type } from "@google/genai";
import { Match, MatchAnalysis, SportType, DetailedInjury, SimulationInputs } from "../types";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { runMonteCarlo } from "./simulationService";

// --- CONFIG ---
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
      console.error("API KEY MANQUANTE ! Vérifiez votre fichier .env");
      throw new Error("API Key missing");
  }
  return new GoogleGenAI({ apiKey });
};

// --- UTILS TIMEZONE ---
const getParisDBDate = () => {
    return new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }); 
};

const getParisDateParts = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const short = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });
    const full = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
    return { short, full };
};

const getCurrentParisTime = () => {
    return new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
};

// --- HELPERS ---
const isMatchExpired = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr || !timeStr) return false;
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const [day, month] = dateStr.split('/').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    const matchDate = new Date(now.getFullYear(), month - 1, day, hour, minute);
    if (month === 12 && now.getMonth() === 0) matchDate.setFullYear(now.getFullYear() - 1);
    if (month === 1 && now.getMonth() === 11) matchDate.setFullYear(now.getFullYear() + 1);
    
    // On considère expiré si fini depuis 4h
    const expiryTime = new Date(matchDate.getTime() + (4 * 60 * 60 * 1000));
    return now > expiryTime;
};

const isLive = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr || !timeStr) return false;
    const nowParis = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const [h, m] = timeStr.split(':').map(Number);
    const matchTime = h * 60 + m;
    const nowTime = nowParis.getHours() * 60 + nowParis.getMinutes();
    const { short: todayShort } = getParisDateParts(0);
    const { short: tomorrowShort } = getParisDateParts(1);
    if (dateStr === todayShort) return nowTime >= matchTime && nowTime < matchTime + 150;
    if (dateStr === tomorrowShort && nowTime < 600) return nowTime >= matchTime && nowTime < matchTime + 150;
    return false;
};

const isValidMatchDate = (matchDate: string, matchTime: string, sport: string) => {
    if (!matchTime || !matchDate) return false;
    const { short: today } = getParisDateParts(0);
    const { short: tomorrow } = getParisDateParts(1);
    if (matchDate === today) return true;
    if (matchDate === tomorrow) {
         const hour = parseInt(matchTime.split(':')[0] || "0");
         return hour < 10; 
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
    } catch (e) {
        console.error("JSON Parse Error", text);
        return [];
    }
};

// --- CORE FETCHING ---

export const fetchDailyMatches = async (category: string = 'All'): Promise<Match[]> => {
    const ai = getClient();
    const { full: todayFull, short: todayShort } = getParisDateParts(0);
    const { full: tomorrowFull, short: tomorrowShort } = getParisDateParts(1);
    const currentTime = getCurrentParisTime();
    
    const TARGET_LEAGUES = "Ligue 1 Uber Eats, NBA";
    let promptContext = "";
    
    if (category === 'Basketball' || category === 'NBA') {
        promptContext = `FOCUS EXCLUSIF: Matchs NBA qui se jouent CETTE NUIT (Date française: ${todayShort} soir ou ${tomorrowShort} matin très tôt).`;
    } else if (category === 'Football') {
        promptContext = `FOCUS EXCLUSIF: Matchs de Football (Ligue 1, Champions League) du ${todayFull}.`;
    } else {
        promptContext = `FOCUS: Matchs importants de ${TARGET_LEAGUES}. Foot (Ligue 1) et NBA.`;
    }

    const prompt = `
      RÔLE: API JSON SPORTS TEMPS RÉEL (TOLÉRANCE ZÉRO).
      DATE DE RÉFÉRENCE (FRANCE): ${todayFull} (${todayShort}).
      DATE INTERDITE (DEMAIN): ${tomorrowFull} (${tomorrowShort}) (SAUF NBA NUIT).
      HEURE ACTUELLE (FRANCE): ${currentTime}.
      
      MISSION: Liste les matchs A VENIR ou EN COURS.
      
      RECHERCHE GOOGLE: "Programme matchs ${TARGET_LEAGUES} ${todayFull} et nuit NBA"
      
      ${promptContext}

      RÈGLES STRICTES DE FILTRAGE (TOLÉRANCE ZÉRO):
      1. TU DOIS IGNORER TOUS les matchs de football qui se jouent DEMAIN (${tomorrowShort}). Je ne veux QUE ceux d'aujourd'hui.
      2. POUR LA NBA UNIQUEMENT: Tu peux inclure les matchs de la nuit prochaine (qui sont techniquement demain matin entre 00h00 et 10h00).
      3. PAS DE MATCHS TERMINÉS. Si un match a commencé il y a plus de 2h par rapport à ${currentTime} et qu'il est fini, il doit être EXCLU.
      4. Si tu n'es pas sûr de la date, NE METS PAS LE MATCH.

      RÈGLES DE FORMAT:
      - Si NBA: Matchs de 01h00-05h00 (demain matin) INCLUS.
      - Si Ligue 1: Matchs du jour précis.
      - Format Date OBLIGATOIRE: "${todayShort}" ou "${tomorrowShort}".
      - Output JSON uniquement. JSON Brut.

      FORMAT JSON ATTENDU:
      [
        { "homeTeam": "Marseille", "awayTeam": "Nantes", "league": "Ligue 1", "time": "21:00", "date": "${todayShort}", "sport": "Football", "quickOdds": 1.75 },
        { "homeTeam": "Lakers", "awayTeam": "Warriors", "league": "NBA", "time": "02:30", "date": "${tomorrowShort}", "sport": "Basketball", "quickOdds": 2.10 }
      ]
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }],
            }
        });

        const rawData = cleanAndParseJSON(response.text || "[]");
        
        // Post-processing & Filtering
        let matches = rawData.map((m: any) => ({
            id: `${m.homeTeam}-${m.awayTeam}-${m.date}`.replace(/\s+/g, '-').toLowerCase(),
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            league: m.league || 'Ligue 1',
            time: m.time || "00:00",
            date: m.date, // PLUS DE FALLBACK || todayShort. Si vide, on rejette.
            sport: (m.league && (m.league.includes('NBA') || m.league.includes('Basket'))) || m.sport === 'Basketball' ? SportType.BASKETBALL : SportType.FOOTBALL,
            status: isLive(m.date, m.time) ? 'live' : 'scheduled',
            quickPrediction: m.quickPrediction || "Analyse IA",
            quickConfidence: 0,
            quickOdds: Number(m.quickOdds) || 0,
            isTrending: (Number(m.quickOdds) > 0) && (Number(m.quickOdds) < 2.5)
        }));

        // Double check temporel côté client pour la sécurité
        matches = matches.filter((m: any) => 
            m.date && // Rejette si date undefined
            isValidMatchDate(m.date, m.time, m.sport) && 
            !isMatchExpired(m.date, m.time)
        );

        return matches;
    } catch (e) {
        console.error("Gemini Scraping Failed", e);
        return [];
    }
};

// --- DEEP ANALYSIS WITH STRUCTURED OUTPUT & SMART DATA ---

export const analyzeMatchDeeply = async (match: Match): Promise<MatchAnalysis> => {
    const ai = getClient();
    const isLiveMatch = match.status === 'live';
    
    let smartDataInstructions = "";
    
    // Instructions spécifiques LIVE vs PRÉ-MATCH pour la recherche de données
    if (isLiveMatch) {
        smartDataInstructions = `
        URGENT MODE LIVE (MATCH EN COURS):
        - SCORE: Chercher "Score direct ${match.homeTeam} ${match.awayTeam}" (FlashScore, Google Sports).
        - MINUTE: Trouver la minute de jeu actuelle.
        - DYNAMIQUE: Qui domine les 10 dernières minutes ? (Tirs, Possession).
        - COTES LIVE: Chercher les cotes en direct si possible.
        `;
    } else {
        if (match.sport === SportType.BASKETBALL) {
            smartDataInstructions = `
            SMART DATA NBA (PRÉ-MATCH):
            - FATIGUE: Chercher "NBA Rest Days", "B2B" pour ${match.homeTeam}.
            - ADVANCED STATS: Chercher "Net Rating", "Offensive Rating".
            - ABSENCES: Vérifier injury reports récents.
            - COTES: Chercher "Cote match ${match.homeTeam} ${match.awayTeam}".
            `;
        } else {
            smartDataInstructions = `
            SMART DATA FOOTBALL (PRÉ-MATCH):
            - PREDICTIVE MODELS: Chercher prédictions "Opta Supercomputer".
            - FORME: Chercher "SofaScore rating" récents.
            - xG: Chercher stats "Understat" xG.
            - COTES: Chercher "Cote match ${match.homeTeam} ${match.awayTeam}".
            `;
        }
    }

    // Définition du rôle et du contexte pour le prompt système
    const rolePrompt = isLiveMatch 
        ? "RÔLE: TRADER SPORTIF LIVE & COMMENTATEUR TEMPS RÉEL." 
        : "RÔLE: Analyste Sportif Quantitatif Senior (Hedge Fund).";
        
    const contextPrompt = isLiveMatch
        ? `SITUATION: Le match ${match.homeTeam} vs ${match.awayTeam} est ACTUELLEMENT EN COURS (LIVE).`
        : `SITUATION: Le match ${match.homeTeam} vs ${match.awayTeam} va bientôt commencer.`;

    const judgePrompt = `
        ${rolePrompt}
        ${contextPrompt}
        LANGUE: FRANÇAIS.
        
        PROTOCOLE DE PENSÉE (CHAIN OF THOUGHT) REQUIS.
        
        ${smartDataInstructions}
        INFO DIFFUSION: Trouve la chaîne TV française qui diffuse le match (ex: BeIN, Canal, Amazon, etc).
        
        RÈGLES CRITIQUES:
        1. Cotes: Chercher les vraies cotes (Winamax/ParionsSport). Si introuvable => METTRE 0. INTERDIT D'INVENTER.
        2. Si LIVE: Tu DOIS remplir "liveScore" (ex: "1-1") et "matchMinute" (ex: "54'").
        3. Si LIVE: La stratégie "liveStrategy" doit être une action immédiate basée sur le jeu en cours.

        STRUCTURE DES PRONOSTICS (3 Requis):
        1. "Main": Le pari principal.
        2. "Safety": Pari sécurité.
        3. "Prop": Performance joueur.

        FORMAT DE SORTIE: JSON PUR.
        LE PREMIER CHAMP DOIT ÊTRE "reasoning_trace".

        STRUCTURE JSON ATTENDUE:
        {
            "reasoning_trace": "Etape 1: Check Live Score... Trouvé 1-0 à la 20ème... Etape 2: Analyse dynamique...",
            "matchId": "${match.id}",
            "summary": "Analyse détaillée (Live commentary si match en cours)...",
            "predictions": [
                { "betType": "Vainqueur", "selection": "Lakers", "odds": 1.85, "confidence": 80, "units": 1, "reasoning": "...", "edge": 4.5 }
            ],
            "injuries": ["Joueur X (Out)"],
            "keyFactors": ["Facteur Clé 1"],
            "scenarios": [
                 { "condition": "But rapide", "outcome": "Over 2.5", "likelihood": "Haute", "reasoning": "..." }
            ],
            "advancedStats": [
                 { "label": "xG", "homeValue": "1.2", "awayValue": "0.8", "advantage": "home" }
            ],
            "simulationInputs": {
                "homeAttack": 80, "homeDefense": 70, "awayAttack": 75, "awayDefense": 65, "tempo": 50
            },
            "liveStrategy": {
                "triggerTime": "Immédiat", "condition": "Si score reste 1-0", "action": "Back Home", "targetOdds": 1.5, "rationale": "..."
            },
            "liveScore": "1-0",
            "matchMinute": "23'",
            "weather": "Clair",
            "referee": "Nom",
            "tvChannel": "BeIN Sports 1"
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: judgePrompt,
            config: { 
                tools: [{ googleSearch: {} }],
            }
        });

        // Manual parsing
        const data = cleanAndParseJSON(response.text || "{}");
        
        // 3. ENRICHISSEMENT (Monte Carlo Local)
        if (data.simulationInputs) {
            data.monteCarlo = runMonteCarlo(data.simulationInputs, match.sport);
        }

        // Fill missing ID
        data.matchId = match.id;

        // Persist to Supabase if available
        if (isSupabaseConfigured()) {
            supabase!.from('match_analyses').upsert(
                { match_id: match.id, analysis: data, updated_at: new Date().toISOString() }, 
                { onConflict: 'match_id' }
            ).then(() => {});
        }

        return data as MatchAnalysis;

    } catch (error) {
        console.error("Deep Analysis Failed:", error);
        throw error;
    }
};