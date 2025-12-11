import { GoogleGenAI } from "@google/genai";
import { Match, MatchAnalysis, SportType } from "../types";
import { supabase, isSupabaseConfigured, markSupabaseOffline } from "../lib/supabase";

// --- CONFIG ---
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");
  return new GoogleGenAI({ apiKey });
};

// --- UTILS ---
const getTodayDateStr = () => {
    return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); // "06/03"
};

const isLive = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr || !timeStr) return false;
    const now = new Date();
    const [h, m] = timeStr.split(':').map(Number);
    const matchTime = h * 60 + m;
    const nowTime = now.getHours() * 60 + now.getMinutes();
    
    const todayShort = getTodayDateStr();
    // Tolérance : considéré live si l'heure est passée et moins de 2h30 après le coup d'envoi
    if (dateStr === todayShort) {
        return nowTime >= matchTime && nowTime < matchTime + 150;
    }
    return false;
};

// Helper pour trier les matchs : Live d'abord, puis par heure
const sortMatchesByTime = (matches: Match[]): Match[] => {
    return matches.sort((a, b) => {
        // 1. LIVE priority
        if (a.status === 'live' && b.status !== 'live') return -1;
        if (a.status !== 'live' && b.status === 'live') return 1;

        // 2. NBA Night logic (00:00 - 09:00 considered "late" relative to 20:00)
        const getAdjustedTime = (time: string) => {
            const [h] = time.split(':').map(Number);
            return h < 10 ? h + 24 : h;
        };

        const timeA = getAdjustedTime(a.time);
        const timeB = getAdjustedTime(b.time);

        if (timeA !== timeB) return timeA - timeB;

        // 3. Minute compare
        return a.time.localeCompare(b.time);
    });
};

// Helper to clean JSON string from Markdown
const cleanAndParseJSON = (text: string) => {
    try {
        let cleanText = text.replace(/```json\n/g, "").replace(/```/g, "").trim();
        const firstBrace = cleanText.indexOf('{');
        const firstBracket = cleanText.indexOf('[');
        
        // Find start
        let start = -1;
        if (firstBrace !== -1 && firstBracket !== -1) start = Math.min(firstBrace, firstBracket);
        else if (firstBrace !== -1) start = firstBrace;
        else if (firstBracket !== -1) start = firstBracket;
        
        // Find end
        const lastBrace = cleanText.lastIndexOf('}');
        const lastBracket = cleanText.lastIndexOf(']');
        const end = Math.max(lastBrace, lastBracket);

        if (start !== -1 && end !== -1) {
            cleanText = cleanText.substring(start, end + 1);
        }
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("JSON Parse Error on text:", text);
        return [];
    }
};

const LOCAL_CACHE_KEY = 'betmind_matches_cache_v5_search';

// --- 1. CORE FETCHING LOGIC (FlashScraper) ---

export const fetchDailyMatches = async (category: string = 'All', forceRefresh: boolean = false): Promise<Match[]> => {
    console.log(`📡 Fetching matches for ${category} (Force Refresh: ${forceRefresh})...`);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const cacheKey = `${LOCAL_CACHE_KEY}_${category}`;

    let matches: Match[] = [];
    let source = 'none';

    // ÉTAPE 1 & 2: Cache Check (Supabase & LocalStorage)
    if (!forceRefresh) {
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const { date, data } = JSON.parse(cached);
                if (date === today && Array.isArray(data) && data.length > 0) {
                    console.log("✅ Matches found in LocalStorage");
                    source = 'local';
                    matches = data;
                }
            }
        } catch (e) { console.warn("LocalStorage error", e); }

        if (matches.length === 0 && isSupabaseConfigured()) {
            try {
                let query = supabase!
                    .from('matches')
                    .select('*')
                    .eq('db_date', today);
                
                if (category === 'Football') query = query.eq('sport', 'Football');
                if (category === 'Basketball') query = query.eq('sport', 'Basketball');

                const { data, error } = await query;

                if (error) {
                    // DÉTECTION INTELLIGENTE D'ERREUR RÉSEAU
                    if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network'))) {
                         console.warn("🔌 Supabase inaccessible (Network). Passage en mode Offline.");
                         markSupabaseOffline();
                    } else {
                         console.warn("Supabase Query Error (SQL):", error.message);
                    }
                } else if (data && data.length > 0) {
                    console.log("✅ Matches found in Supabase");
                    source = 'supabase';
                    matches = data.map((m: any) => ({
                        id: m.id,
                        homeTeam: m.home_team,
                        awayTeam: m.away_team,
                        league: m.league,
                        time: m.time,
                        date: m.date,
                        sport: m.sport === 'Basketball' ? SportType.BASKETBALL : SportType.FOOTBALL,
                        status: isLive(m.date, m.time) ? 'live' : 'scheduled',
                        isTrending: m.quick_odds > 0 && m.quick_odds < 2.5,
                        quickPrediction: m.quick_prediction,
                        quickConfidence: 75,
                        quickOdds: m.quick_odds
                    }));
                }
            } catch (err) { 
                console.warn("Supabase Unreachable (Catch):", err);
                markSupabaseOffline();
            }
        }
    }

    // ÉTAPE 3: SCRAPING GEMINI
    if (matches.length === 0) {
        console.log("⚡ Fetching fresh data via BetMind AI (Google Search)...");
        matches = await scrapeMatchesWithGemini(category);
        source = 'gemini';
    }

    // ÉTAPE 4: Post-Processing
    if (matches.length > 0) {
        matches = sortMatchesByTime(matches);
        if (source === 'gemini') {
            localStorage.setItem(cacheKey, JSON.stringify({ date: today, data: matches }));
            
            if (isSupabaseConfigured()) {
                console.log("💾 Tentative de sauvegarde Supabase (Matches)...");
                const matchesToInsert = matches.map(m => ({
                    id: m.id,
                    home_team: m.homeTeam,
                    away_team: m.awayTeam,
                    league: m.league,
                    time: m.time,
                    date: m.date,
                    sport: m.sport,
                    quick_prediction: m.quickPrediction,
                    quick_odds: m.quickOdds,
                    db_date: today
                }));
                
                supabase!.from('matches').upsert(matchesToInsert, { onConflict: 'id' })
                    .then(({ error }) => { 
                        if (error) {
                            // SI ERREUR RÉSEAU DANS LE RESULTAT
                            if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network'))) {
                                console.warn("🔌 Supabase Save Failed (Network). Marking Offline.");
                                markSupabaseOffline();
                            } else {
                                console.warn("❌ Erreur Supabase Matches (SQL/Perms):", error.message);
                            }
                        } else {
                            console.log("✅ Sauvegarde Matches OK");
                        }
                    }, err => {
                        console.warn("❌ Network Error Supabase Matches (Catch):", err);
                        markSupabaseOffline();
                    });
            }
        }
    }
    return filterMatches(matches, category);
};

const scrapeMatchesWithGemini = async (category: string): Promise<Match[]> => {
    const ai = getClient();
    const now = new Date();
    const dateFull = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const todayShort = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowFull = tomorrow.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const tomorrowShort = tomorrow.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

    let searchTerm = "";
    let promptContext = "";

    if (category === 'Basketball' || category === 'NBA') {
        searchTerm = `Programme NBA et Basket ce soir ${dateFull} et nuit du ${tomorrowFull}`;
        promptContext = `CONTEXTE BASKET: Inclure les matchs de la nuit prochaine (01h-05h du ${tomorrowShort}).`;
    } else if (category === 'Football') {
        searchTerm = `Programme matchs Football Ligue 1 Champions League ce soir ${dateFull} cotes parions sport`;
        promptContext = `CONTEXTE FOOTBALL: Uniquement les matchs du ${dateFull}.`;
    } else {
        searchTerm = `Programme matchs sport importants ce soir ${dateFull} et nuit prochaine`;
    }

    const prompt = `
      RÔLE: ROBOT JSON API. Tu n'écris pas de texte. Tu génères uniquement du JSON.
      DATE ACTUELLE: ${dateFull}.
      TACHE: Trouve la liste des principaux matchs (Foot, NBA, Tennis) qui se jouent CE SOIR et CETTE NUIT via Google Search.
      RECHERCHE: "${searchTerm}"
      
      ${promptContext}

      IMPORTANT:
      - Si cotes introuvables, mets 0.
      - Ne génère AUCUN texte avant ou après le JSON.
      
      FORMAT JSON (Array):
      [
        { "homeTeam": "Lakers", "awayTeam": "Warriors", "league": "NBA", "time": "02:30", "date": "${tomorrowShort}", "sport": "Basketball", "quickOdds": 1.85 }
      ]
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });

        const rawData = cleanAndParseJSON(response.text || "[]");
        if (!Array.isArray(rawData)) return [];

        return rawData.map((m: any) => ({
            id: `${m.homeTeam}-${m.awayTeam}-${m.date}`.replace(/\s+/g, '-').toLowerCase(),
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            league: m.league,
            time: m.time,
            date: m.date || todayShort,
            sport: (m.league && (m.league.includes('NBA') || m.league.includes('Basket'))) || m.sport === 'Basketball' ? SportType.BASKETBALL : SportType.FOOTBALL,
            status: isLive(m.date, m.time) ? 'live' : 'scheduled',
            quickPrediction: "Analyse...",
            quickConfidence: 0,
            quickOdds: Number(m.quickOdds) || 0,
            isTrending: (Number(m.quickOdds) > 0) && (Number(m.quickOdds) < 2.5)
        } as Match));
    } catch (e) {
        console.error("BetMind Scraping Failed", e);
        return [];
    }
};

const filterMatches = (matches: Match[], category: string) => {
    if (category === 'All' || category === 'Trending' || category === 'Safe' || category === 'HighOdds' || category === 'Value') return matches;
    return matches.filter(m => m.sport === category);
};

// --- 3. AGENTIC WORKFLOW "OVERDRIVE HEDGE FUND" ---

// ELITE SOURCES WHITELIST
const ELITE_SOURCES = `
SOURCES PRIORITAIRES (WHITELIST):
- Foot: understat.com (xG), fbref.com, whoscored.com, sportsmole.co.uk
- NBA: cleaningtheglass.com (Filtered stats), statmuse.com, rotoworld.com (Injuries), hashtagbasketball.com (Defense vs Position)
- Market: oddsportal.com, actionnetwork.com (Public splits), pinnacle.com (Sharp lines)
`;

// Helper pour lancer un agent
const runAgent = async (role: string, prompt: string): Promise<string> => {
    const ai = getClient();
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Rapide pour les agents
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        return `[RAPPORT AGENT ${role}]:\n${response.text}`;
    } catch (e) {
        console.error(`Agent ${role} failed`, e);
        return `[RAPPORT AGENT ${role}]: INFORMATION INDISPONIBLE (Échec de l'agent)`;
    }
};

// Cache en mémoire pour fallback rapide
const CACHED_ANALYSES: Record<string, MatchAnalysis> = {};

export const analyzeMatchDeeply = async (match: Match, forceRefresh = false): Promise<MatchAnalysis> => {
    // 1. VÉRIFICATION PERSISTENCE SUPABASE (Cloud Cache)
    if (!forceRefresh) {
        // A. Vérifier cache mémoire
        if (CACHED_ANALYSES[match.id]) return CACHED_ANALYSES[match.id];

        // B. Vérifier Supabase (Table 'match_analyses')
        if (isSupabaseConfigured()) {
            try {
                const { data, error } = await supabase!
                    .from('match_analyses')
                    .select('analysis')
                    .eq('match_id', match.id)
                    .single();
                
                if (error) {
                     // SI ERREUR RÉSEAU
                     if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network'))) {
                         console.warn("🔌 Supabase Cache Offline. Skipping.");
                         markSupabaseOffline();
                     }
                } else if (data && data.analysis) {
                    console.log("💎 Analyse récupérée depuis Supabase (Cache Hit)");
                    CACHED_ANALYSES[match.id] = data.analysis;
                    return data.analysis;
                }
            } catch (err) {
                console.warn("Supabase analysis cache miss (or offline):", err);
                markSupabaseOffline();
            }
        }
    }

    const ai = getClient();
    
    // CONTEXTE SPÉCIFIQUE
    let sportSpecificInstructions = "";
    if (match.sport === SportType.BASKETBALL) {
        sportSpecificInstructions = `
        - GARBAGE TIME FILTER: Cherche 'Cleaning the Glass stats'. Ignore les stats des 'Blowouts' (+20pts).
        - PACE & RATING: Analyse le rythme (Pace) et l'Efficacité Défensive.
        `;
    } else {
        sportSpecificInstructions = `
        - DISSECTION CONTEXTUELLE: Ne regarde pas juste les 5 derniers matchs. Regarde les 3 derniers CONTRE UN STYLE SIMILAIRE (ex: vs Low Block/Défense groupée).
        `;
    }

    // --- PHASE 1: EXECUTION PARALLÈLE ROBUSTE (Promise.allSettled) ---
    console.log("🚀 Lancement du Conseil des Sages (5 Agents) en mode Résilient...");

    const minerPrompt = `
        RÔLE: Agent de Renseignement (Miner - Deep Dive).
        MATCH: ${match.homeTeam} vs ${match.awayTeam}.
        WHITELIST: ${ELITE_SOURCES}
        
        MISSION:
        1. BEAT WRITERS INTELLIGENCE: Cherche "site:twitter.com [Team] injury update [Journaliste fiable]". 
           - Analyse le TON du tweet (Optimiste/Pessimiste). Copie les infos textuelles.
        2. X-FACTOR: Météo précise et Arbitre (Moyenne cartons).
        3. STATUS: Compo officielles. Si star 'GTD' (Game Time Decision), cherche la dernière update d'échauffement.
        ${forceRefresh ? '4. SCORE EN DIRECT: Cherche "live score flashscore" et donne la minute.' : ''}

        STRICT: Lister les faits. Pas d'analyse.
    `;

    const quantPrompt = `
        RÔLE: Analyste Quantitatif (Quant - Deep Dive).
        MATCH: ${match.homeTeam} vs ${match.awayTeam}.
        WHITELIST: ${ELITE_SOURCES}
        
        MISSION:
        ${sportSpecificInstructions}
        1. SHOT QUALITY (Deep Dive): Ne regarde pas juste les buts/points. Cherche 'Expected Points' ou 'Shot Quality'. L'équipe a-t-elle eu de la chance ?
        2. FORME PONDÉRÉE: Accorde plus d'importance aux matchs récents ET pertinents.
        3. H2H: Historique récent des confrontations.
    `;

    const traderPrompt = `
        RÔLE: Trader Sportif.
        MATCH: ${match.homeTeam} vs ${match.awayTeam}.
        WHITELIST: ${ELITE_SOURCES}
        
        MISSION:
        1. LINE MOVEMENT: Compare Cote Ouverture vs Cote Actuelle. "Value Sucked Out" si baisse > 15%.
        2. SENTIMENT: Cherche "public betting percentages". Où est la masse ? Où sont les pros ?
        3. REALITY CHECK: Vérifie la cote actuelle sur Pinnacle.
    `;

    const contrarianPrompt = `
        RÔLE: Sceptique Professionnel.
        MATCH: ${match.homeTeam} vs ${match.awayTeam}.
        
        MISSION:
        1. MOTIVATION MATRIX: Sandwich Game ? Tanking ?
        2. LE PIÈGE: Pourquoi le favori va perdre ?
        3. SCÉNARIOS: Trouve la condition critique (ex: "Si Joueur X Out").
    `;

    const propHunterPrompt = `
        RÔLE: Chasseur de Props (Player Matchups).
        MATCH: ${match.homeTeam} vs ${match.awayTeam}.
        WHITELIST: Statmuse, HashtagBasketball, Whoscored.

        MISSION: Trouve les duels individuels déséquilibrés (Mismatches).
        - NBA: "Defense vs Position". Ex: Si Team A est 28ème contre les Meneurs -> Value sur le Meneur adverse.
        - FOOT: Duel Ailier vs Latéral. Vitesse, cartons jaunes potentiels.
        - RÉSULTAT: Suggère 1 ou 2 paris joueurs précis (Points, Rebonds, Tirs cadrés).
    `;

    // Utilisation de allSettled pour ne pas crasher si un agent échoue
    const results = await Promise.allSettled([
        runAgent("MINER", minerPrompt),
        runAgent("QUANT", quantPrompt),
        runAgent("TRADER", traderPrompt),
        runAgent("CONTRARIAN", contrarianPrompt),
        runAgent("PROP HUNTER", propHunterPrompt)
    ]);

    // Extraction sécurisée des rapports
    const [minerReport, quantReport, traderReport, contrarianReport, propHunterReport] = results.map(
        r => r.status === 'fulfilled' ? r.value : "[RAPPORT AGENT MANQUANT]"
    );

    // --- PHASE 2: SYNTHÈSE DU JUGE SUPRÊME (PRE-MORTEM) ---
    console.log("⚖️ Délibération du Juge (avec Pre-Mortem)...");

    const judgePrompt = `
        RÔLE: Juge Suprême (Portfolio Manager Hedge Fund).
        CONTEXTE: Tu as reçu 5 rapports d'experts sur le match ${match.homeTeam} vs ${match.awayTeam}.
        
        RAPPORTS:
        ${minerReport}
        ${quantReport}
        ${traderReport}
        ${contrarianReport}
        ${propHunterReport}

        TA MISSION:
        1. SYNTHÈSE: Croise les sources. Si le Prop Hunter trouve une pépite (Value Player), intègre-la en priorité si le match est indécis.
        2. PRE-MORTEM ANALYSIS (CRITIQUE): 💀
           - Avant de valider, imagine que ton pari est PERDANT. Pourquoi ?
           - (Ex: "Le pari Lakers -5 a échoué car AD s'est blessé").
           - Si la probabilité de ce scénario d'échec est > 30%, ANNULE le pari ou baisse la confiance.
        3. VERDICT FINAL: Donne le Meilleur Pari (Bet) et la Mise (Unités - Kelly Criterion).

        IMPORTANT SANITIZATION:
        - Ne jamais copier-coller les "Notes internes".
        - Le champ "injuries" ne doit contenir QUE des joueurs des équipes concernées.

        FORMAT DE SORTIE (JSON STRICT):
        {
            "matchId": "${match.id}",
            "summary": "Synthèse style Hedge Fund. Mentionne l'avis du Prop Hunter si pertinent.",
            "liveScore": "Score (si trouvé)",
            "matchMinute": "Minute (si trouvé)",
            "weather": "Météo",
            "referee": "Arbitre",
            "contrarianView": "L'argument du sceptique.",
            "scenarios": [
                { 
                    "condition": "Si Joueur X Out", 
                    "outcome": "Under 220.5", 
                    "likelihood": "High",
                    "reasoning": "Sans X, l'OffRtg chute de 115 à 102." 
                }
            ],
            "injuries": ["Liste joueurs"],
            "keyFactors": ["Facteur 1", "Facteur 2"],
            "advancedStats": [
                { "label": "xG/NetRtg", "homeValue": "1.2", "awayValue": "0.8", "advantage": "home" }
            ],
            "marketAnalysis": {
                "publicTrend": "80% Home",
                "sharpMoney": "Away",
                "openingOdds": 1.90,
                "currentOdds": 1.80,
                "oddsMovement": "Dropping",
                "valueStatus": "Value Intact"
            },
            "trueProbability": { "home": 60, "draw": 20, "away": 20 },
            "predictions": [
                {
                    "betType": "Vainqueur",
                    "selection": "Team A",
                    "odds": 1.80,
                    "probability": 60,
                    "edge": 0, // LAISSER A 0
                    "confidence": 75,
                    "units": 2.0,
                    "reasoning": "Raison technique incluant le Pre-Mortem.",
                    "condition": "Aucune"
                },
                {
                    "betType": "Player Prop (Hunter)",
                    "selection": "Joueur X Over Pts",
                    "odds": 1.85,
                    "probability": 65,
                    "edge": 0,
                    "confidence": 70,
                    "units": 1.0,
                    "reasoning": "Analyse du duel individuel."
                }
            ]
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview", // Cerveau Puissant
            contents: judgePrompt,
            config: { 
                // responseMimeType: "application/json"
            },
        });

        const json = cleanAndParseJSON(response.text || "{}");

        // --- MATH RECALCULATION & SANITIZATION ---
        if (json.predictions && Array.isArray(json.predictions)) {
            json.predictions.forEach((pred: any) => {
                const prob = Number(pred.probability) || 50;
                const odds = Number(pred.odds) || 1.0;
                const calculatedEdge = ((prob / 100) * odds) - 1;
                pred.edge = parseFloat(calculatedEdge.toFixed(3));
            });
        }

        const analysis: MatchAnalysis = {
            matchId: match.id,
            summary: json.summary,
            contrarianView: json.contrarianView,
            scenarios: json.scenarios || [],
            keyFactors: json.keyFactors || [],
            injuries: json.injuries || [],
            predictions: json.predictions || [],
            sources: [],
            weather: json.weather,
            referee: json.referee,
            advancedStats: json.advancedStats,
            liveScore: json.liveScore,
            matchMinute: json.matchMinute,
            marketAnalysis: json.marketAnalysis,
            trueProbability: json.trueProbability
        };

        // 3. PERSISTENCE SUPABASE (Sauvegarde pour le futur)
        if (isSupabaseConfigured()) {
            console.log("💾 Tentative de sauvegarde de l'analyse dans Supabase...");
            supabase!.from('match_analyses').upsert(
                { 
                    match_id: match.id, 
                    analysis: analysis, 
                    updated_at: new Date().toISOString() 
                }, 
                { onConflict: 'match_id' }
            )
            .then(({ error }) => {
                if (error) {
                    if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network'))) {
                        console.warn("🔌 Supabase Analysis Save Failed (Network). Marking Offline.");
                        markSupabaseOffline();
                    } else {
                        console.warn("❌ Erreur Supabase Analysis:", error.message);
                    }
                } else {
                    console.log("✅ Analyse sauvegardée dans Supabase avec succès !");
                }
            }, err => {
                console.warn("❌ Network Error Supabase Analysis:", err);
                markSupabaseOffline();
            });
        }

        // Mise à jour cache local
        CACHED_ANALYSES[match.id] = analysis;
        return analysis;

    } catch (error) {
        console.error("Deep Analysis Failed:", error);
        throw error;
    }
};