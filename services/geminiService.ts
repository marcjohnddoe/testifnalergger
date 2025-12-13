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

// --- UTILS ---
const getParisDateParts = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return { apiDate: `${year}-${month}-${day}`, displayDate: `${day}/${month}`, full: d.toLocaleDateString('fr-FR') };
};

const getCurrentParisTime = () => new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

const isMatchExpired = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr || !timeStr) return false; // Par défaut, on garde si info manquante
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const [day, month] = dateStr.split('/').map(Number);
    const cleanTime = timeStr.replace('h', ':');
    const [hour, minute] = cleanTime.split(':').map(Number);
    
    // Si date invalide, on n'expire pas
    if (!day || !month || isNaN(hour)) return false;

    const matchDate = new Date(now.getFullYear(), month - 1, day, hour, minute);
    if (month === 1 && now.getMonth() === 11) matchDate.setFullYear(now.getFullYear() + 1);
    if (month === 12 && now.getMonth() === 0) matchDate.setFullYear(now.getFullYear() - 1);
    
    // Buffer très large (5h) pour garder les matchs du jour affichés
    const expiryTime = new Date(matchDate.getTime() + (300 * 60 * 1000));
    return now > expiryTime;
};

const isLive = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr || !timeStr) return false;
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const cleanTime = timeStr.replace('h', ':');
    const [h, m] = cleanTime.split(':').map(Number);
    if (isNaN(h)) return false;
    
    const matchTime = h * 60 + m;
    const nowTime = now.getHours() * 60 + now.getMinutes();
    const { displayDate: todayShort } = getParisDateParts(0);
    
    // Simple : Si c'est aujourd'hui et que l'heure est passée (mais < 4h après)
    if (dateStr === todayShort && nowTime >= matchTime && nowTime < matchTime + 240) return true;
    return false;
};

const cleanAndParseJSON = (text: string) => {
    try {
        let cleanText = text.replace(/```json\n/g, "").replace(/```/g, "").trim();
        const firstBrace = cleanText.indexOf('{');
        const firstBracket = cleanText.indexOf('[');
        const start = (firstBrace === -1) ? firstBracket : (firstBracket === -1) ? firstBrace : Math.min(firstBrace, firstBracket);
        const lastBrace = cleanText.lastIndexOf('}');
        const lastBracket = cleanText.lastIndexOf(']');
        const end = Math.max(lastBrace, lastBracket);
        
        if (start !== -1 && end !== -1) cleanText = cleanText.substring(start, end + 1);
        return JSON.parse(cleanText);
    } catch (e) { return {}; }
};

// --- NETTOYAGE INTELLIGENT (LE FIX) ---
// Transforme les phrases simples de l'IA en objets structurés pour l'UI
const sanitizeData = (data: any) => {
    if (!data) return {};

    // SCENARIOS
    if (Array.isArray(data.scenarios)) {
        data.scenarios = data.scenarios.map((s: any) => {
            if (typeof s === 'string') {
                const parts = s.split(/,|alors|:|implies/i);
                return { 
                    condition: parts[0] || s, 
                    outcome: parts[1] || "Impact probable", 
                    likelihood: "Moyenne" 
                };
            }
            return typeof s === 'object' ? s : null;
        }).filter(Boolean);
    } else {
        data.scenarios = [];
    }

    // PLAYER PROPS (PROP HUNTER)
    if (Array.isArray(data.playerProps)) {
        data.playerProps = data.playerProps.map((p: any) => ({
            player: p.player || "Joueur Inconnu",
            market: p.market || "Performance",
            line: p.line || "Over/Under",
            odds: Number(p.odds) || 0,
            confidence: Number(p.confidence) || 50
        }));
    } else {
        data.playerProps = [];
    }

    // SENTIMENT (PANIC INDEX)
    if (!data.sentiment) {
        data.sentiment = { score: 50, label: "Neutre", summary: "Pas de signal clair du public." };
    } else {
        data.sentiment.score = Number(data.sentiment.score) || 50;
        data.sentiment.label = data.sentiment.label || "Neutre";
    }

    // STATS
    if (Array.isArray(data.advancedStats)) {
        data.advancedStats = data.advancedStats.map((s: any) => {
            if (typeof s === 'string') {
                return { label: s, homeValue: "-", awayValue: "-", advantage: "equal" };
            }
            if (typeof s === 'object' && s !== null) {
                return {
                    label: s.label || "Stat",
                    homeValue: s.homeValue ?? "-",
                    awayValue: s.awayValue ?? "-",
                    advantage: s.advantage || "equal"
                };
            }
            return null;
        }).filter(Boolean);
    } else {
        data.advancedStats = [];
    }

    // PREDICTIONS
    if (Array.isArray(data.predictions)) {
        data.predictions = data.predictions.map((p: any) => ({
            betType: p?.betType || "Avis",
            selection: p?.selection || "Analyse",
            odds: Number(p?.odds) || 0,
            confidence: Number(p?.confidence) || 50,
            units: Number(p?.units) || 1,
            reasoning: p?.reasoning || "Pas de détails.",
            edge: Number(p?.edge) || 0
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
    if (RAPID_API_KEY && RAPID_API_KEY.length > 5) {
        try { 
            const matches = await fetchFromRealAPI(category);
            if (matches.length > 0) return matches;
        } catch (e) { 
            console.error("API Error, fallback to AI", e); 
        }
    }
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

async function fetchFromGeminiScraper(category: string): Promise<Match[]> {
    const ai = getClient();
    const { full: todayFull, displayDate: todayShort } = getParisDateParts(0);
    const currentTime = getCurrentParisTime();
    
    let promptContext = "";
    let searchQuery = "";
    
    if (category === 'Basketball' || category === 'NBA') {
        promptContext = `FOCUS: NBA & Basket.`;
        searchQuery = `"NBA schedule today" "Euroleague games today"`;
    } else if (category === 'Football') {
        promptContext = `FOCUS: Football.`;
        searchQuery = `"Matchs foot aujourd'hui" "Live scores football"`;
    } else {
        promptContext = `FOCUS: Top Matchs Foot & NBA.`;
        searchQuery = `"Matchs ce soir foot nba"`;
    }

    const prompt = `
      RÔLE: SCRAPER PROGRAMME SPORTIF.
      DATE: ${todayFull}. HEURE: ${currentTime}.
      MISSION: Liste les matchs importants du jour.
      RECHERCHE: ${searchQuery}
      
      FORMAT JSON STRICT:
      [
        { "homeTeam": "Lakers", "awayTeam": "Suns", "league": "NBA", "time": "04:00", "date": "${todayShort}", "sport": "Basketball", "quickOdds": 1.90 }
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
            id: `${m.homeTeam}-${m.awayTeam}`.replace(/\s+/g, '-').toLowerCase(),
            homeTeam: m.homeTeam, awayTeam: m.awayTeam, league: m.league || "Ligue",
            time: m.time || "00:00", date: m.date || todayShort,
            sport: (m.league?.includes('NBA') || m.sport === 'Basketball') ? SportType.BASKETBALL : SportType.FOOTBALL,
            status: 'scheduled',
            quickPrediction: "IA", quickConfidence: 0, quickOdds: Number(m.quickOdds) || 0,
            isTrending: false
        }));
    });
}

// --- ANALYSE DEEP (PROP HUNTER & PANIC INDEX INTEGRATED) ---
export const analyzeMatchDeeply = async (match: Match): Promise<MatchAnalysis> => {
    const ai = getClient();
    const isLiveMatch = match.status === 'live';
    
    const judgePrompt = `
        RÔLE: Analyste Sportif Pro (Hedge Fund).
        MATCH: ${match.homeTeam} vs ${match.awayTeam}.
        STATUT: ${isLiveMatch ? "LIVE" : "PRÉ-MATCH"}.
        
        INSTRUCTION: Analyse ce match en profondeur avec un focus sur les Props Joueurs et la psychologie de foule.
        
        RECHERCHE GOOGLE: "${match.homeTeam} ${match.awayTeam} stats player props injuries twitter sentiment"

        FORMAT JSON ATTENDU (Respecte scrupuleusement):
        {
            "matchId": "${match.id}",
            "summary": "Résumé concis...",
            "predictions": [{ "betType": "Vainqueur", "selection": "${match.homeTeam}", "odds": 1.80, "confidence": 75, "units": 1, "reasoning": "..." }],
            "keyDuel": { "player1": "J1", "player2": "J2", "statLabel": "Pts", "value1": 20, "value2": 25, "winner": "player2" },
            "scenarios": ["Si A marque, alors...", "Si rythme lent..."],
            "advancedStats": ["Possession: 60%", "xG: 1.2 vs 0.8"],
            "simulationInputs": { "homeAttack": 60, "homeDefense": 50, "awayAttack": 55, "awayDefense": 45, "tempo": 50 },
            "liveStrategy": { "triggerTime": "MT", "condition": "Nul", "action": "Miser", "targetOdds": 3.0, "rationale": "Value" },
            
            "playerProps": [
                { "player": "Nom Joueur", "market": "Points/Buts", "line": "Over 19.5", "odds": 1.85, "confidence": 80 },
                { "player": "Autre Joueur", "market": "Passes D.", "line": "Over 5.5", "odds": 2.10, "confidence": 65 },
                { "player": "Joueur 3", "market": "Tirs", "line": "Over 2.5", "odds": 1.70, "confidence": 70 }
            ],
            "sentiment": { 
                "score": 30, 
                "label": "Panique", 
                "summary": "Le public vend ${match.homeTeam} après la blessure récente." 
            }
        }
        
        NOTE:
        - "sentiment.score": 0 (Panique Totale) à 100 (Euphorie Totale). 50 = Neutre.
        - "playerProps": Trouve 3 cotes joueurs intéressantes.
    `;

    return withRetry(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview", 
            contents: judgePrompt,
            config: { tools: [{ googleSearch: {} }] }
        });

        const rawJson = cleanAndParseJSON(response.text || "{}");
        const safeData = sanitizeData(rawJson);

        if (safeData.simulationInputs) safeData.monteCarlo = runMonteCarlo(safeData.simulationInputs, match.sport);
        safeData.matchId = match.id;

        if (isSupabaseConfigured()) {
            supabase!.from('match_analyses').upsert({ match_id: match.id, analysis: safeData, updated_at: new Date().toISOString() }, { onConflict: 'match_id' }).then(() => {});
        }
        return safeData as MatchAnalysis;
    }, 2);
};