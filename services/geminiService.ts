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

// --- HELPERS ---
const isMatchExpired = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr || !timeStr) return false;
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const [day, month] = dateStr.split('/').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    const matchDate = new Date(now.getFullYear(), month - 1, day, hour, minute);
    if (month === 12 && now.getMonth() === 0) matchDate.setFullYear(now.getFullYear() - 1);
    if (month === 1 && now.getMonth() === 11) matchDate.setFullYear(now.getFullYear() + 1);
    const expiryTime = new Date(matchDate.getTime() + (3.5 * 60 * 60 * 1000));
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
    if (!matchTime) return false;
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
    const { short: tomorrowShort } = getParisDateParts(1);
    
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
      RÔLE: API JSON SPORTS TEMPS RÉEL.
      DATE DE RÉFÉRENCE (FRANCE): ${todayFull}.
      
      MISSION: Liste les matchs A VENIR ou EN COURS aujourd'hui (${todayShort}) ou cette nuit (${tomorrowShort}).
      EXCLURE les matchs terminés.
      
      RECHERCHE GOOGLE: "Programme matchs ${TARGET_LEAGUES} ${todayFull} et nuit NBA"
      
      ${promptContext}

      RÈGLES STRICTES:
      1. Si NBA: Matchs de 01h00-05h00 (demain) INCLUS.
      2. Si Ligue 1: Matchs du jour précis.
      3. Format Date: "${todayShort}" ou "${tomorrowShort}".
      4. Output JSON uniquement.
      5. NE PAS utiliser de Markdown ou de code blocks. JSON brut.

      FORMAT JSON ATTENDU (Exemple):
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
                // IMPORTANT: responseMimeType & responseSchema DOIVENT être absents avec googleSearch
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
            date: m.date || todayShort,
            sport: (m.league && (m.league.includes('NBA') || m.league.includes('Basket'))) || m.sport === 'Basketball' ? SportType.BASKETBALL : SportType.FOOTBALL,
            status: isLive(m.date, m.time) ? 'live' : 'scheduled',
            quickPrediction: m.quickPrediction || "Analyse IA",
            quickConfidence: 0,
            quickOdds: Number(m.quickOdds) || 0,
            isTrending: (Number(m.quickOdds) > 0) && (Number(m.quickOdds) < 2.5)
        }));

        // Filter expired & invalid dates
        matches = matches.filter((m: any) => 
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
    
    // 1. SMART DATA INSTRUCTIONS (FRANÇAIS)
    let smartDataInstructions = "";
    if (match.sport === SportType.BASKETBALL) {
        smartDataInstructions = `
        SMART DATA NBA (Recherche Google Obligatoire):
        - FATIGUE: Chercher "NBA Rest Days", "B2B", "3IN4" pour ${match.homeTeam} et ${match.awayTeam}.
        - ADVANCED STATS: Chercher "Net Rating", "Pace", "Offensive Rating" sur Dunk & Three.
        - ABSENCES: Vérifier les dernières injury reports (ESPN, Twitter beat writers).
        - COTES: Chercher "Cote match ${match.homeTeam} ${match.awayTeam} Winamax ParionsSport".
        `;
    } else {
        smartDataInstructions = `
        SMART DATA FOOTBALL (Recherche Google Obligatoire):
        - PREDICTIVE MODELS: Chercher les prédictions "The Analyst Opta Supercomputer".
        - REAL FORM: Chercher "SofaScore rating" sur les 5 derniers matchs.
        - xG: Chercher les stats "Understat" xG (Expected Goals).
        - COTES: Chercher "Cote match ${match.homeTeam} ${match.awayTeam} Winamax ParionsSport".
        `;
    }

    const judgePrompt = `
        RÔLE: Analyste Sportif Quantitatif Senior (Hedge Fund).
        MATCH: ${match.homeTeam} vs ${match.awayTeam} (${match.league}).
        LANGUE: FRANÇAIS.
        
        OBJECTIF: Trouver un avantage mathématique et fournir 3 PRONOSTICS DISTINCTS.
        
        ${smartDataInstructions}
        
        RÈGLES CRITIQUES SUR LES COTES:
        1. Tu DOIS chercher les cotes réelles actuelles sur les bookmakers français (Winamax, ParionsSport, Unibet).
        2. INTERDICTION TOTALE D'INVENTER OU D'ESTIMER UNE COTE. 
        3. Si tu ne trouves pas la cote exacte via Google Search, tu DOIS mettre la valeur 0. L'interface affichera "En attente". Ne mets jamais de fausse cote.

        STRUCTURE DES PRONOSTICS (3 Requis):
        1. "Main": Le pari vainqueur principal (Moneyline/1N2).
        2. "Safety": Un pari plus sûr (Double chance, Handicap, ou Over/Under global).
        3. "Prop": Un pari sur une performance joueur (Buteur, Points joueur, Passes).

        FORMAT DE SORTIE: JSON PUR UNIQUEMENT. NE PAS AJOUTER DE TEXTE AVANT OU APRÈS.

        STRUCTURE JSON ATTENDUE:
        {
            "matchId": "${match.id}",
            "summary": "Analyse détaillée en français, expliquant les forces en présence, la fatigue et les enjeux...",
            "predictions": [
                { "betType": "Vainqueur", "selection": "Lakers", "odds": 1.85, "confidence": 80, "units": 1, "reasoning": "...", "edge": 4.5 },
                { "betType": "Sécurité", "selection": "Over 220.5 Points", "odds": 1.50, "confidence": 90, "units": 2, "reasoning": "...", "edge": 2.1 },
                { "betType": "Buteur/Prop", "selection": "LeBron +25 Points", "odds": 0, "confidence": 60, "units": 0.5, "reasoning": "Cote non trouvée mais stat probable...", "edge": 0 }
            ],
            "injuries": ["Joueur X (Out)", "Joueur Y (Incertain)"],
            "keyFactors": ["Facteur Clé 1", "Facteur Clé 2"],
            "scenarios": [
                 { "condition": "But rapide", "outcome": "Over 2.5", "likelihood": "Haute", "reasoning": "..." },
                 { "condition": "0-0 à la Mi-temps", "outcome": "Match Nul", "likelihood": "Moyenne", "reasoning": "..." }
            ],
            "advancedStats": [
                 { "label": "xG", "homeValue": "1.2", "awayValue": "0.8", "advantage": "home" }
            ],
            "simulationInputs": {
                "homeAttack": 80, "homeDefense": 70, "awayAttack": 75, "awayDefense": 65, "tempo": 50
            },
            "liveStrategy": {
                "triggerTime": "Mi-temps", "condition": "Si mené au score", "action": "Lay", "targetOdds": 2.0, "rationale": "..."
            },
            "liveScore": "0-0",
            "weather": "Clair",
            "referee": "Nom de l'arbitre"
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: judgePrompt,
            config: { 
                tools: [{ googleSearch: {} }],
                // IMPORTANT: responseMimeType & responseSchema DOIVENT être absents avec googleSearch
            }
        });

        // Manual parsing since we cannot use responseSchema with tools
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