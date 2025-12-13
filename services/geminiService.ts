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

const getClient = () => {
  const apiKey = getEnv('API_KEY');
  if (!apiKey) throw new Error("API Key missing");
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

// GÉNÉRATEUR D'ID UNIVERSEL (ID ROBUSTE)
// Transforme "L.A. Lakers " en "lalakers" et "Paris SG" en "parissg"
// Cela garantit que l'ID est identique quel que soit le format de la source ou le fuseau horaire
const generateMatchId = (home: string, away: string) => {
    const normalize = (str: string) => str.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Enlève les accents
        .replace(/[^a-z0-9]/g, ""); // Enlève tout sauf lettres et chiffres
    return `${normalize(home)}-${normalize(away)}`;
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

const sanitizeData = (data: any) => {
    if (!data) return {};
    
    if (Array.isArray(data.scenarios)) {
        data.scenarios = data.scenarios.map((s: any) => {
            if (typeof s === 'string') {
                const parts = s.split(/,|alors|:|implies/i);
                return { condition: parts[0] || s, outcome: parts[1] || "Probable", likelihood: "Moyenne" };
            }
            return typeof s === 'object' ? s : null;
        }).filter(Boolean);
    } else data.scenarios = [];

    if (Array.isArray(data.playerProps)) {
        data.playerProps = data.playerProps.map((p: any) => ({
            player: p.player || "Joueur", market: p.market || "Stats", line: p.line || "-",
            odds: Number(p.odds) || 0, confidence: Number(p.confidence) || 50
        }));
    } else data.playerProps = [];

    if (Array.isArray(data.advancedStats)) {
        data.advancedStats = data.advancedStats.map((s: any) => (typeof s === 'string' ? { label: s, homeValue: "-", awayValue: "-", advantage: "equal" } : s)).filter(Boolean);
    }
    if (Array.isArray(data.predictions)) {
        data.predictions = data.predictions.map((p: any) => ({
            betType: p?.betType || "Avis", selection: p?.selection || "-",
            odds: Number(p?.odds) || 0, confidence: Number(p?.confidence) || 50,
            units: Number(p?.units) || 1, reasoning: p?.reasoning || "", edge: Number(p?.edge) || 0
        }));
    }
    
    if (!data.sentiment) data.sentiment = { score: 50, label: "Neutre", summary: "RAS" };
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
        } catch (e) { console.error("API Error", e); }
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
        id: generateMatchId(m.teams.home.name, m.teams.away.name),
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
        id: generateMatchId(m.teams.home.name, m.teams.away.name),
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
    const { displayDate: tomorrowShort } = getParisDateParts(1);
    const currentTime = getCurrentParisTime();
    
    let promptContext = category.includes('Basket') ? `FOCUS: NBA.` : `FOCUS: Top Matchs.`
    let searchQuery = category.includes('Basket') 
        ? `"NBA schedule ${todayShort}" "NBA schedule ${tomorrowShort}"` 
        : `"Matchs ce soir ${todayShort}"`;

    const prompt = `
      RÔLE: SCRAPER CALENDRIER SPORTIF. DATE: ${todayFull} (${currentTime}).
      MISSION: Liste les matchs A VENIR. RECHERCHE: ${searchQuery}.
      ${promptContext}
      FORMAT JSON: [ { "homeTeam": "Lakers", "awayTeam": "Suns", "league": "NBA", "time": "04:00", "date": "${tomorrowShort}", "sport": "Basketball", "quickOdds": 1.90 } ]
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
            id: generateMatchId(m.homeTeam, m.awayTeam),
            homeTeam: m.homeTeam, awayTeam: m.awayTeam, league: m.league || "Ligue",
            time: m.time || "00:00", date: m.date || todayShort,
            sport: (m.league?.includes('NBA') || m.sport === 'Basketball') ? SportType.BASKETBALL : SportType.FOOTBALL,
            status: 'scheduled',
            quickPrediction: "IA", quickConfidence: 0, quickOdds: Number(m.quickOdds) || 0,
            isTrending: false
        }));
    });
}

// --- ANALYSE DEEP (NIVEAU CIA / INSIDER) ---
export const analyzeMatchDeeply = async (match: Match): Promise<MatchAnalysis> => {
    
    // 1. CACHE CHECK
    if (isSupabaseConfigured()) {
        try {
            const { data } = await supabase!
                .from('match_analyses')
                .select('analysis')
                .eq('match_id', match.id)
                .single();
            if (data?.analysis) return data.analysis as MatchAnalysis;
        } catch (e) { /* Ignore */ }
    }

    // 2. GÉNÉRATION
    const ai = getClient();
    const isLiveMatch = match.status === 'live';
    const { full: currentDate } = getParisDateParts(0);

    // --- CONSTRUCTION DU SPECTRE DE RECHERCHE (INSIDER SOURCES) ---
    const base = `${match.homeTeam} vs ${match.awayTeam}`;
    
    // SOURCES EXPERTES SELON LE SPORT
    let qInsider = "";
    if (match.sport === SportType.BASKETBALL) {
        // NBA : On vise les stats avancées qui filtrent le "garbage time" et le tracking des joueurs
        qInsider = `"${base}" Cleaning the Glass stats "garbage time" lineup data Second Spectrum tracking official injury report ${currentDate}`;
    } else {
        // FOOT : On vise les Expected Goals (xG) détaillés et les notes tactiques
        qInsider = `"${base}" Understat xG fbref advanced stats Whoscored match preview ${currentDate} conférence de presse coach`;
    }

    // Bloc Marché : On cherche l'argent "intelligent" (Sharp Money)
    const qMarket = `"${base}" odds movement pinnacle sharp money trends public betting percentage`;

    // Bloc Social : On scanne les beat writers locaux
    const qSocial = `"${match.homeTeam}" twitter beat writers rumors locker room atmosphere`;

    // Assemblage de la "Mega Requête CIA"
    const searchQueries = `${qInsider} ${qMarket} ${qSocial} ${isLiveMatch ? "live stats score" : ""}`;

    const sportContext = match.sport === SportType.BASKETBALL 
        ? "Basket NBA (Règles: Pace, Efficiency, Matchups défensifs)" 
        : "Football (Règles: xG, Possession zones dangereuses, Pressing)";

    const judgePrompt = `
        RÔLE: Analyste Sportif de Niveau Élite (Ex-Bettor Pro & Data Scientist).
        SPORT: ${sportContext}. MATCH: ${base}.
        STATUT: ${isLiveMatch ? "LIVE" : "PRÉ-MATCH"}.
        
        MISSION: Analyse INSIDER. Ne me donne pas de généralités. Je veux des faits introuvables par le grand public.
        RECHERCHE CIBLÉE: ${searchQueries}

        INSTRUCTIONS DE RIGUEUR (TOLÉRANCE ZÉRO):
        1. **SOURCES OFFICIELLES**: Si tu parles de blessure, c'est que tu as lu le rapport officiel. Interdiction de dire "Incertain" si le joueur est confirmé OUT.
        2. **STATS AVANCÉES**: Utilise "Offensive Rating", "Effective FG%", "xG", "PPDA". Bannis les termes vagues comme "bonne forme".
        3. **ARBITRAGE**: Si l'arbitre a une tendance (ex: siffle beaucoup de fautes), intègre-le dans l'analyse (Impact sur Over/Under).
        4. **VALUE BET**: Cherche l'erreur du bookmaker. Où est la value mathématique ?

        FORMAT JSON STRICT:
        {
            "matchId": "${match.id}",
            "summary": "Synthèse brutale et directe. (ex: 'Le marché surestime les Lakers sans Davis').",
            "predictions": [
                { "betType": "Principal", "selection": "...", "odds": 0, "confidence": 0, "units": 0, "reasoning": "Preuve chiffrée (ex: Net Rtg +15 à domicile)." },
                { "betType": "Value / Contrarian", "selection": "...", "odds": 0, "confidence": 0, "units": 0, "reasoning": "Le public est sur l'inverse à 80%..." },
                { "betType": "Statistique", "selection": "...", "odds": 0, "confidence": 0, "units": 0, "reasoning": "Basé sur le Pace (98 possessions/match)." }
            ],
            "playerProps": [
                { "player": "...", "market": "...", "line": "...", "odds": 0, "confidence": 0 },
                { "player": "...", "market": "...", "line": "...", "odds": 0, "confidence": 0 },
                { "player": "...", "market": "...", "line": "...", "odds": 0, "confidence": 0 }
            ],
            "injuries": [ { "player": "...", "status": "...", "impact": "High/Critical" } ],
            "keyDuel": { "player1": "...", "player2": "...", "statLabel": "...", "value1": 0, "value2": 0, "winner": "player1" },
            "scenarios": ["Si le rythme dépasse 100 poss...", "Si l'arbitre siffle vite..."],
            "advancedStats": [{ "label": "OffRtg / xG", "homeValue": 0, "awayValue": 0, "advantage": "home" }],
            "simulationInputs": { "homeAttack": 50, "homeDefense": 50, "awayAttack": 50, "awayDefense": 50, "tempo": 50 },
            "liveStrategy": { "triggerTime": "...", "condition": "...", "action": "...", "targetOdds": 0, "rationale": "..." },
            "sentiment": { "score": 50, "label": "Neutre", "summary": "..." }
        }
    `;

    return withRetry(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview", 
            contents: judgePrompt,
            config: { 
                tools: [{ googleSearch: {} }],
                // STABILITÉ MAXIMALE : On tue la créativité pour la logique pure.
                generationConfig: { 
                    temperature: 0.1,
                    topK: 40,
                    topP: 0.95 
                } 
            }
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