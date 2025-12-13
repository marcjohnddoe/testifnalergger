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
    const { displayDate: tomorrowShort } = getParisDateParts(1); // On récupère la date de demain
    const currentTime = getCurrentParisTime();
    
    let promptContext = "";
    let searchQuery = "";
    
    if (category === 'Basketball' || category === 'NBA') {
        // FIX : On demande spécifiquement la nuit prochaine pour éviter le vide
        promptContext = `FOCUS: NBA. Cherche les matchs de la nuit du ${todayShort} au ${tomorrowShort}.`;
        searchQuery = `"NBA schedule ${todayShort}" "NBA schedule ${tomorrowShort}" "Matchs NBA ce soir heure française"`;
    } else if (category === 'Football') {
        promptContext = `FOCUS: Football.`;
        searchQuery = `"Matchs foot ${todayShort}" "Programme TV foot ce soir"`;
    } else {
        promptContext = `FOCUS: Top Matchs Foot & NBA.`;
        searchQuery = `"Matchs ce soir ${todayShort}"`;
    }

    const prompt = `
      RÔLE: SCRAPER PROGRAMME SPORTIF.
      DATE ACTUELLE: ${todayFull} (Heure: ${currentTime}).
      
      MISSION: Liste les matchs A VENIR (Ce soir et nuit prochaine).
      RECHERCHE: ${searchQuery}
      ${promptContext}
      
      RÈGLES CRITIQUES:
      1. NBA : Les matchs de "ce soir" se jouent souvent demain matin (ex: 02h00). INCLUS-LES.
      2. Dates : Utilise le format JJ/MM (ex: ${todayShort} ou ${tomorrowShort}).
      
      FORMAT JSON STRICT:
      [
        { "homeTeam": "Lakers", "awayTeam": "Suns", "league": "NBA", "time": "04:00", "date": "${tomorrowShort}", "sport": "Basketball", "quickOdds": 1.90 }
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
        
        return rawData.map((m: any) => {
            // ID Normalisé : Suppression accents, espaces, caractères spéciaux pour un ID unique stable
            // Cela empêche que l'ID change si le format de date ou le nom varie légèrement
            const cleanName = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
            const stableId = `${cleanName(m.homeTeam)}-${cleanName(m.awayTeam)}`;
            
            return {
                id: stableId,
                homeTeam: m.homeTeam, awayTeam: m.awayTeam, league: m.league || "Ligue",
                time: m.time || "00:00", date: m.date || todayShort,
                sport: (m.league?.includes('NBA') || m.sport === 'Basketball') ? SportType.BASKETBALL : SportType.FOOTBALL,
                status: 'scheduled',
                quickPrediction: "IA", quickConfidence: 0, quickOdds: Number(m.quickOdds) || 0,
                isTrending: false
            };
        });
    });
}

// --- ANALYSE DEEP (MODE "HEDGE FUND" - ANTI-PARESSE) ---
export const analyzeMatchDeeply = async (match: Match): Promise<MatchAnalysis> => {
    
    // 1. CACHE CHECK (Source de Vérité Unique)
    if (isSupabaseConfigured()) {
        try {
            const { data } = await supabase!
                .from('match_analyses')
                .select('analysis')
                .eq('match_id', match.id)
                .single();
            if (data?.analysis) return data.analysis as MatchAnalysis;
        } catch (e) { /* Ignore cache miss */ }
    }

    // 2. GÉNÉRATION
    const ai = getClient();
    const isLiveMatch = match.status === 'live';
    const { full: currentDate } = getParisDateParts(0); // On donne la date pour forcer des stats récentes

    // CONTEXTE SPORTIF PRÉCIS
    const sportContext = match.sport === SportType.BASKETBALL 
        ? "Basket NBA/Euroleague. Marchés: Moneyline, Spread (Handicap), Total Points, Player Props (Points, Rebonds, Passes)."
        : "Football. Marchés: 1N2, Double Chance, Total Buts, Buteurs, Corners.";

    // RECHERCHES GOOGLE CHIRURGICALES
    // On force l'IA à chercher des termes très spécifiques pour éviter le baratin
    const searchQueries = match.sport === SportType.BASKETBALL 
        ? `"${match.homeTeam} vs ${match.awayTeam} injuries official report ${currentDate}" "${match.homeTeam} ${match.awayTeam} player prop picks" "${match.homeTeam} vs ${match.awayTeam} advanced stats pace defensive rating"`
        : `"${match.homeTeam} ${match.awayTeam} blessures officielles compo" "${match.homeTeam} ${match.awayTeam} stats xG understat" "${match.homeTeam} ${match.awayTeam} pronostic buteur value"`;

    const judgePrompt = `
        RÔLE: Analyste Sportif Senior pour un Hedge Fund (Rigueur Mathématique).
        SPORT: ${sportContext}
        MATCH: ${match.homeTeam} vs ${match.awayTeam}.
        DATE: ${currentDate}.
        STATUT: ${isLiveMatch ? "LIVE" : "PRÉ-MATCH"}.
        
        MISSION: Analyse ce match sans complaisance. Interdiction d'être vague.
        
        RECHERCHE EFFECTUÉE SUR: ${searchQueries}

        RÈGLES D'OR (ANTI-PARESSE):
        1. ARGUMENTATION CHIFFRÉE: Ne dis pas "bonne attaque". Dis "Offensive Rating 118.5 (2ème NBA)".
        2. BLESSURES: Vérifie chaque joueur clé. Si incertain, précise l'impact tactique. Ne mets JAMAIS "RAS" sans avoir vérifié 3 sources.
        3. PROPS INTELLIGENTS: Ne propose pas juste les superstars. Cherche de la "Value" sur les lieutenants (ex: un pivot qui prend plus de rebonds car l'adversaire est petit).
        4. SENTIMENT: Scanne le "bruit" social. Est-ce que les fans sont en colère ? Y a-t-il une "hype" irrationnelle ?

        FORMAT JSON STRICT ATTENDU:
        {
            "matchId": "${match.id}",
            "summary": "Résumé percutant en 2 phrases avec le facteur clé (ex: fatigue, matchup spécifique).",
            "predictions": [
                { "betType": "Principal", "selection": "Sélection Précise", "odds": 1.75, "confidence": 80, "units": 2, "reasoning": "Argumentaire basé sur une stat clé (ex: Domicile 15-2)." },
                { "betType": "Value / Handicap", "selection": "Sélection", "odds": 1.90, "confidence": 65, "units": 1, "reasoning": "Pourquoi le marché se trompe ici ?" },
                { "betType": "Statistique / Total", "selection": "Sélection", "odds": 1.85, "confidence": 70, "units": 1, "reasoning": "Basé sur le Pace/xG récent." }
            ],
            "playerProps": [
                { "player": "Joueur A", "market": "Pts/Reb/Ast", "line": "Over 20.5", "odds": 1.85, "confidence": 75 },
                { "player": "Joueur B (Outsider)", "market": "Stat précise", "line": "Over/Under X", "odds": 2.00, "confidence": 60 },
                { "player": "Joueur C", "market": "Stat précise", "line": "Over/Under Y", "odds": 1.70, "confidence": 70 }
            ],
            "keyDuel": { "player1": "Nom A", "player2": "Nom B", "statLabel": "Moyenne Pts/Buts", "value1": 25.5, "value2": 28.0, "winner": "player2" },
            "scenarios": [
                "Si [Joueur X] prend rapidement des fautes, alors viser [Remplaçant Y].",
                "Si l'écart dépasse 15 pts, viser l'Under (Blowout probable)."
            ],
            "advancedStats": [
                { "label": "Pace / Possession", "homeValue": 98.5, "awayValue": 102.1, "advantage": "away" },
                { "label": "Efficacité Défensive", "homeValue": 110, "awayValue": 115, "advantage": "home" }
            ],
            "simulationInputs": { "homeAttack": 75, "homeDefense": 60, "awayAttack": 70, "awayDefense": 65, "tempo": 95 },
            "liveStrategy": { 
                "triggerTime": "Mi-temps / QT3", 
                "condition": "Si le favori perd de 5-8 points", 
                "action": "Miser Favori en Live", 
                "targetOdds": 2.10, 
                "rationale": "L'équipe adverse craque souvent en fin de match (Net Rating Q4 faible)." 
            },
            "sentiment": { 
                "score": 40, 
                "label": "Doute", 
                "summary": "Les fans craignent l'absence du meneur titulaire." 
            }
        }
    `;

    return withRetry(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview", 
            contents: judgePrompt,
            config: { 
                tools: [{ googleSearch: {} }],
                // Température très basse pour la rigueur, mais pas 0 pour laisser un peu de "réflexion" sur les scénarios
                generationConfig: { temperature: 0.15 } 
            }
        });

        const rawJson = cleanAndParseJSON(response.text || "{}");
        const safeData = sanitizeData(rawJson);

        if (safeData.simulationInputs) safeData.monteCarlo = runMonteCarlo(safeData.simulationInputs, match.sport);
        safeData.matchId = match.id;

        // 3. SAUVEGARDE
        if (isSupabaseConfigured()) {
            supabase!.from('match_analyses').upsert({ match_id: match.id, analysis: safeData, updated_at: new Date().toISOString() }, { onConflict: 'match_id' }).then(() => {});
        }
        return safeData as MatchAnalysis;
    }, 2);
};