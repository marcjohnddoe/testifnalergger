import { GoogleGenAI } from "@google/genai";
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

// --- UTILS TIMEZONE (DOUBLE VERROU 🔒) ---

/**
 * Retourne la date au format YYYY-MM-DD (pour la base de données)
 * Forcé sur le fuseau Europe/Paris pour éviter les décalages UTC
 */
const getParisDBDate = () => {
    return new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }); 
};

/**
 * Retourne les formats d'affichage et de contrôle pour Paris
 */
const getParisDateParts = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    
    // Format court: "06/03"
    const short = d.toLocaleDateString('fr-FR', { 
        day: '2-digit', 
        month: '2-digit',
        timeZone: 'Europe/Paris' 
    });
    
    // Format complet: "jeudi 6 mars 2025"
    const full = d.toLocaleDateString('fr-FR', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric',
        timeZone: 'Europe/Paris'
    });

    return { short, full };
};

// --- GARBAGE COLLECTOR 🗑️ ---
/**
 * Vérifie si un match est terminé depuis plus de 3h30.
 * Compare l'heure du match (Paris) avec l'heure actuelle (Paris).
 * Gère le passage minuit (ex: NBA).
 */
const isMatchExpired = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr || !timeStr) return false;

    // 1. Obtenir l'heure actuelle "Vue de Paris" (convertie en objet Date local pour comparaison relative)
    const nowStr = new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"});
    const now = new Date(nowStr);

    // 2. Parser la date du match
    const [day, month] = dateStr.split('/').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);

    // 3. Construire l'objet Date du match (en utilisant l'année courante de "now")
    // Note: On crée cet objet comme s'il était local, pour le comparer à "now" qui est aussi "localisé" sur Paris.
    const matchDate = new Date(now.getFullYear(), month - 1, day, hour, minute);

    // Gestion du rollover d'année (Décembre -> Janvier ou inversement)
    if (month === 12 && now.getMonth() === 0) matchDate.setFullYear(now.getFullYear() - 1);
    if (month === 1 && now.getMonth() === 11) matchDate.setFullYear(now.getFullYear() + 1);

    // 4. Calculer l'heure d'expiration (Début + 3h30 de marge de sécurité)
    // 3.5 heures * 60 * 60 * 1000
    const expiryTime = new Date(matchDate.getTime() + (3.5 * 60 * 60 * 1000));

    // 5. Si MAINTENANT est après l'EXPIRATION, c'est poubelle.
    return now > expiryTime;
};

const isLive = (dateStr?: string, timeStr?: string): boolean => {
    if (!dateStr || !timeStr) return false;
    
    // Obtenir l'heure actuelle à Paris
    const nowParis = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Paris"}));
    const [h, m] = timeStr.split(':').map(Number);
    const matchTime = h * 60 + m;
    const nowTime = nowParis.getHours() * 60 + nowParis.getMinutes();
    
    const { short: todayShort } = getParisDateParts(0);
    const { short: tomorrowShort } = getParisDateParts(1);

    // Live si c'est aujourd'hui et qu'on est dans le créneau (matchTime + 150min)
    if (dateStr === todayShort) {
        return nowTime >= matchTime && nowTime < matchTime + 150;
    }
    // Gérer le cas NBA nuit (si on est le lendemain matin et que le match était "demain matin")
    if (dateStr === tomorrowShort && nowTime < 600) { // Avant 10h du mat
         return nowTime >= matchTime && nowTime < matchTime + 150;
    }
    return false;
};

// --- FILTRE DOUANIER 👮‍♂️ ---
const isValidMatchDate = (matchDate: string, matchTime: string, sport: string) => {
    if (!matchTime) return false; // Guard clause against undefined time

    const { short: today } = getParisDateParts(0);
    const { short: tomorrow } = getParisDateParts(1);

    // 1. Match Aujourd'hui (Accepté pour tout le monde)
    if (matchDate === today) return true;

    // 2. Match Demain Matin (Accepté UNIQUEMENT pour NBA/Basketball ou match tardif)
    // On accepte les matchs "demain" s'ils sont avant 10h00 du matin (nuit NBA)
    if (matchDate === tomorrow) {
         const hour = parseInt(matchTime.split(':')[0] || "0");
         return hour < 10; 
    }

    return false;
};

// Helper pour trier les matchs
const sortMatchesByTime = (matches: Match[]): Match[] => {
    return matches.sort((a, b) => {
        if (a.status === 'live' && b.status !== 'live') return -1;
        if (a.status !== 'live' && b.status === 'live') return 1;

        const getAdjustedTime = (time: string) => {
            if (!time) return 0;
            const [h] = time.split(':').map(Number);
            // Pour le tri, on considère que 00h-09h vient APRES 23h
            return h < 10 ? h + 24 : h;
        };

        const timeA = getAdjustedTime(a.time);
        const timeB = getAdjustedTime(b.time);

        if (timeA !== timeB) return timeA - timeB;
        return a.time.localeCompare(b.time);
    });
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

        if (start !== -1 && end !== -1) {
            cleanText = cleanText.substring(start, end + 1);
        }
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("JSON Parse Error on text:", text);
        return [];
    }
};

// --- META-VÉRIFICATEUR (Le Correcteur Automatique) ---
const metaVerifyAnalysis = (analysis: MatchAnalysis, matchSport: SportType): MatchAnalysis => {
    const clean = { ...analysis };

    // 1. Nettoyage des chaînes de caractères (Suppression "Note:", "Pre-Mortem:", etc.)
    const cleanString = (str?: string) => {
        if (!str) return "";
        // Enlève les lignes commençant par Note:, Pre-Mortem, Warning, etc.
        return str
            .replace(/^(Note|Pre-Mortem|Warning|Attention|Disclaimer)\s*:.*$/gim, '')
            .replace(/I cannot browse the live web.*/gi, '')
            .trim();
    };

    clean.summary = cleanString(clean.summary);
    if (clean.contrarianView) clean.contrarianView = cleanString(clean.contrarianView);

    // 2. Correction Mathématique des Prédictions (Edge & Confiance)
    if (clean.predictions && Array.isArray(clean.predictions)) {
        clean.predictions = clean.predictions.map(pred => {
            // Bornage de la confiance (0-100)
            const confidence = Math.max(0, Math.min(100, Number(pred.confidence) || 50));
            
            // Sécurisation de la cote
            const odds = Number(pred.odds) || 1.01;

            // Recalcul strict de l'Edge (Value)
            // Formule : (Probabilité Estimée * Cote) - 1
            // Probabilité Estimée = Confiance / 100
            const probability = confidence / 100;
            const calculatedEdge = (probability * odds) - 1;

            return {
                ...pred,
                confidence: confidence,
                odds: odds,
                // On garde 3 décimales pour la précision, ex: 0.125 (12.5%)
                edge: parseFloat(calculatedEdge.toFixed(3))
            };
        });
    }

    // 3. Dédoublonnage des blessures
    if (clean.injuries && Array.isArray(clean.injuries)) {
        const seen = new Set<string>();
        clean.injuries = (clean.injuries as any[]).filter(inj => {
            const name = typeof inj === 'string' ? inj : inj.player;
            // Normalisation pour comparaison (minuscule, trim)
            const key = name.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }) as string[] | DetailedInjury[];
    }

    // 4. MOTEUR MONTE CARLO (HYBRIDE) 🎲
    // Si l'IA a fourni des inputs valides, on lance le simulateur JS
    if (clean.simulationInputs) {
        // Fallback pour éviter les 0
        const simInputs: SimulationInputs = {
            homeAttack: clean.simulationInputs.homeAttack || 50,
            homeDefense: clean.simulationInputs.homeDefense || 50,
            awayAttack: clean.simulationInputs.awayAttack || 50,
            awayDefense: clean.simulationInputs.awayDefense || 50,
            tempo: clean.simulationInputs.tempo || 50
        };
        
        // Exécution de 10 000 itérations (Maths Pures)
        clean.monteCarlo = runMonteCarlo(simInputs, matchSport, 10000);
    }

    return clean;
};

const LOCAL_CACHE_KEY = 'betmind_matches_v7'; // Version bump

// --- 1. CORE FETCHING LOGIC ---

export const fetchDailyMatches = async (category: string = 'All', forceRefresh: boolean = false): Promise<Match[]> => {
    console.log(`📡 Recherche des matchs: ${category} (Force: ${forceRefresh})...`);
    
    const dbDate = getParisDBDate(); // YYYY-MM-DD (Paris)
    const { short: todayDisplay } = getParisDateParts(0); // DD/MM (Paris)

    const cacheKey = `${LOCAL_CACHE_KEY}_${category}`;

    let matches: Match[] = [];
    let source = 'none';

    if (!forceRefresh) {
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const { date, data } = JSON.parse(cached);
                // Vérifie si le cache correspond à la date DB Paris
                if (date === dbDate && Array.isArray(data) && data.length > 0) {
                    // FILTRE LOCALSTORAGE: On nettoie immédiatement le cache des vieux matchs
                    const activeMatches = data.filter((m: Match) => !isMatchExpired(m.date, m.time));
                    
                    if (activeMatches.length > 0) {
                        source = 'local';
                        matches = activeMatches;
                    } else {
                        console.log("Cache présent mais tous les matchs sont expirés.");
                    }
                }
            }
        } catch (e) { console.warn("LocalStorage error", e); }

        if (matches.length === 0 && isSupabaseConfigured()) {
            try {
                let query = supabase!
                    .from('matches')
                    .select('*')
                    .eq('db_date', dbDate); // Requête sur la date Paris
                
                if (category === 'Football') query = query.eq('sport', 'Football');
                if (category === 'Basketball') query = query.eq('sport', 'Basketball');

                const { data, error } = await query;

                if (!error && data && data.length > 0) {
                    const mappedMatches = data.map((m: any) => ({
                        id: m.id,
                        homeTeam: m.home_team,
                        awayTeam: m.away_team,
                        league: m.league,
                        time: m.time || "00:00", // Safe fallback
                        date: m.date,
                        sport: m.sport === 'Basketball' ? SportType.BASKETBALL : SportType.FOOTBALL,
                        status: isLive(m.date, m.time) ? 'live' : 'scheduled',
                        isTrending: m.quick_odds > 0 && m.quick_odds < 2.5,
                        quickPrediction: m.quick_prediction,
                        quickConfidence: 75,
                        quickOdds: m.quick_odds
                    } as Match));

                    // FILTRE SUPABASE: On retire ceux qui sont finis
                    const activeSupabaseMatches = mappedMatches.filter((m: Match) => !isMatchExpired(m.date, m.time));

                    if (activeSupabaseMatches.length > 0) {
                        source = 'supabase';
                        matches = activeSupabaseMatches;
                    }
                }
            } catch (err) { 
                console.warn("Supabase check skipped");
            }
        }
    }

    if (matches.length === 0) {
        console.log("⚡ Scraping via Gemini (Strict Date Mode)...");
        matches = await scrapeMatchesWithGemini(category);
        source = 'gemini';
    }

    if (matches.length > 0) {
        // FILTRE ULTIME (Douanier + Garbage Collector)
        // 1. On garde que les dates valides (Auj / Demain matin)
        // 2. On jette les matchs dont l'heure est passée de > 3h30
        matches = matches.filter(m => 
            isValidMatchDate(m.date || todayDisplay, m.time, m.sport) && 
            !isMatchExpired(m.date, m.time)
        );
        
        matches = sortMatchesByTime(matches);
        
        if (source === 'gemini') {
            // On sauvegarde tout dans le cache, même ceux qui vont bientôt expirer, 
            // le filtre isMatchExpired fera le ménage à la lecture suivante.
            localStorage.setItem(cacheKey, JSON.stringify({ date: dbDate, data: matches }));
            
            if (isSupabaseConfigured()) {
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
                    db_date: dbDate
                }));
                
                supabase!.from('matches').upsert(matchesToInsert, { onConflict: 'id' })
                    .then(({ error }) => { if(error) console.warn("Save Error", error); });
            }
        }
    }
    return filterMatches(matches, category);
};

const scrapeMatchesWithGemini = async (category: string): Promise<Match[]> => {
    const ai = getClient();
    
    // Utilisation des dates Paris précises
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
      HEURE ACTUELLE: ${new Date().toLocaleTimeString('fr-FR', {timeZone: 'Europe/Paris'})}.
      
      MISSION: Liste UNIQUEMENT les matchs A VENIR ou EN COURS aujourd'hui (${todayShort}) ou cette nuit (${tomorrowShort}).
      EXCLURE les matchs déjà terminés.
      
      RECHERCHE GOOGLE: "Programme matchs ${TARGET_LEAGUES} ${todayFull} et nuit NBA"
      
      ${promptContext}

      RÈGLES STRICTES:
      1. Si NBA: Les matchs de 01h00, 02h00, 04h00 du matin (demain) SONT INCLUS.
      2. Si Ligue 1: Uniquement les matchs du jour précis.
      3. Format Date: "${todayShort}" ou "${tomorrowShort}" (pour NBA nuit).
      4. Output JSON uniquement.

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
            config: { tools: [{ googleSearch: {} }] }
        });

        const rawData = cleanAndParseJSON(response.text || "[]");
        if (!Array.isArray(rawData)) return [];

        return rawData.map((m: any) => ({
            id: `${m.homeTeam}-${m.awayTeam}-${m.date}`.replace(/\s+/g, '-').toLowerCase(),
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            league: m.league || 'Ligue 1',
            time: m.time || "00:00", // Safe fallback
            date: m.date || todayShort,
            sport: (m.league && (m.league.includes('NBA') || m.league.includes('Basket'))) || m.sport === 'Basketball' ? SportType.BASKETBALL : SportType.FOOTBALL,
            status: isLive(m.date, m.time) ? 'live' : 'scheduled',
            quickPrediction: "Analyse IA",
            quickConfidence: 0,
            quickOdds: Number(m.quickOdds) || 0,
            isTrending: (Number(m.quickOdds) > 0) && (Number(m.quickOdds) < 2.5)
        } as Match));
    } catch (e) {
        console.error("Gemini Scraping Failed", e);
        return [];
    }
};

const filterMatches = (matches: Match[], category: string) => {
    if (category === 'All' || category === 'Trending' || category === 'Safe' || category === 'HighOdds' || category === 'Value') return matches;
    return matches.filter(m => m.sport === category);
};

// --- AGENTIC ANALYSIS (UNCHANGED) ---
// ... (reste du fichier inchangé pour l'analyse)
const CACHED_ANALYSES: Record<string, MatchAnalysis> = {};

export const analyzeMatchDeeply = async (match: Match, forceRefresh = false): Promise<MatchAnalysis> => {
    if (!forceRefresh) {
        if (CACHED_ANALYSES[match.id]) return CACHED_ANALYSES[match.id];
        if (isSupabaseConfigured()) {
            try {
                const { data } = await supabase!
                    .from('match_analyses')
                    .select('analysis')
                    .eq('match_id', match.id)
                    .single();
                if (data && data.analysis) {
                    CACHED_ANALYSES[match.id] = data.analysis;
                    return data.analysis;
                }
            } catch (err) {}
        }
    }

    const ai = getClient();
    
    // PROMPT RENFORCÉ (Avec champs obligatoires explicites et NOUVEAUX CHAMPS MonteCarlo/Script)
    const judgePrompt = `
        RÔLE: Expert Paris Sportifs (Foot & NBA) & Analyste Quantitatif.
        MATCH: ${match.homeTeam} vs ${match.awayTeam} (${match.league}).
        DATE: ${match.date} à ${match.time}.
        
        TACHE 1: Analyse Classique (Blessures, Forme, Enjeux).
        TACHE 2: QUANT RATING (Pour Simulation Monte Carlo). Donne une note de 0 à 100 pour l'Attaque et la Défense de chaque équipe.
        TACHE 3: LIVE SCRIPTING (Stratégie de Trading). Ne donne pas juste un pari sec. Donne un algorithme conditionnel.
        
        UTILISE GOOGLE SEARCH pour les stats récentes.

        RÈGLE JSON ABSOLUE :
        - Les champs numériques (odds, confidence, units) doivent contenir UNIQUEMENT des chiffres (ex: 1.75).
        - INTERDIT d'ajouter du texte ou des parenthèses dans les champs nombres (ex: "1.75 (Celtics)" est INTERDIT).
        
        FORMAT DE SORTIE (JSON STRICT, TOUS LES CHAMPS SONT OBLIGATOIRES):
        {
            "matchId": "${match.id}",
            "summary": "Résumé de l'analyse en français.",
            "predictions": [
                { "betType": "Vainqueur", "selection": "${match.homeTeam}", "odds": 1.5, "confidence": 80, "units": 2, "reasoning": "Explication..." }
            ],
            "injuries": ["Joueur A (Out)", "Joueur B (Doubtful)"],
            "keyFactors": ["Facteur 1", "Facteur 2"],
            "scenarios": [
                { "condition": "Si X joue", "outcome": "Alors Y", "likelihood": "High/Med/Low", "reasoning": "..." }
            ],
            "advancedStats": [
                { "label": "xG / Pace", "homeValue": 1.2, "awayValue": 0.9, "advantage": "home" }
            ],
            "simulationInputs": {
                "homeAttack": 85,
                "homeDefense": 70,
                "awayAttack": 75,
                "awayDefense": 60,
                "tempo": 95
            },
            "liveStrategy": {
                "triggerTime": "Mi-temps",
                "condition": "Si le favori perd de 1 but mais domine les xG > 1.5",
                "action": "Miser 'Home Team or Draw' (Double Chance)",
                "targetOdds": 1.90,
                "rationale": "Le marché va sur-réagir au score, mais les stats montrent une domination."
            },
            "marketAnalysis": {
                "publicTrend": "Mise sur Home",
                "sharpMoney": "Mise sur Away",
                "openingOdds": 1.8,
                "currentOdds": 1.75,
                "oddsMovement": "Dropping",
                "valueStatus": "Value Intact"
            },
            "liveScore": "0-0",
            "matchMinute": "Pre-match",
            "weather": "Clair",
            "referee": "Nom arbitre"
        }
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: judgePrompt,
            config: { tools: [{ googleSearch: {} }] }
        });

        const json = cleanAndParseJSON(response.text || "{}");
        
        // CONSTRUCTION AVEC FALLBACKS (Sécurité anti-crash)
        const rawAnalysis: MatchAnalysis = {
            matchId: match.id,
            summary: json.summary || "Analyse en cours de génération...",
            contrarianView: json.contrarianView || "Pas d'alerte spécifique détectée.",
            scenarios: Array.isArray(json.scenarios) ? json.scenarios : [],
            keyFactors: Array.isArray(json.keyFactors) ? json.keyFactors : ["Forme du moment", "Contexte"],
            injuries: Array.isArray(json.injuries) ? json.injuries : [],
            predictions: (Array.isArray(json.predictions) && json.predictions.length > 0) ? json.predictions : [
                {
                    betType: "Résultat",
                    selection: "En attente",
                    odds: match.quickOdds || 1.10,
                    confidence: 50,
                    units: 1,
                    reasoning: "Données insuffisantes pour une prédiction IA précise."
                }
            ],
            sources: [],
            weather: json.weather || "Non spécifié",
            referee: json.referee || "Non spécifié",
            advancedStats: Array.isArray(json.advancedStats) ? json.advancedStats : [
                { label: "Analyse Stats", homeValue: "-", awayValue: "-", advantage: "equal" }
            ],
            liveScore: json.liveScore,
            matchMinute: json.matchMinute,
            simulationInputs: json.simulationInputs || { homeAttack: 50, homeDefense: 50, awayAttack: 50, awayDefense: 50, tempo: 50 },
            liveStrategy: json.liveStrategy || { triggerTime: "N/A", condition: "Pas de stratégie live", action: "-", targetOdds: 0, rationale: "" },
            marketAnalysis: json.marketAnalysis || {
                 publicTrend: "Neutre",
                 sharpMoney: "Non détecté",
                 openingOdds: match.quickOdds || 1.5,
                 currentOdds: match.quickOdds || 1.5,
                 oddsMovement: "Stable",
                 valueStatus: "Neutre"
            },
            trueProbability: json.trueProbability
        };

        // --- PASSAGE AU META-VÉRIFICATEUR (+ Moteur Monte Carlo) ---
        // Nettoyage, Correction Mathématique, Dédoublonnage, Simulation JS
        const verifiedAnalysis = metaVerifyAnalysis(rawAnalysis, match.sport);

        if (isSupabaseConfigured()) {
            supabase!.from('match_analyses').upsert(
                { match_id: match.id, analysis: verifiedAnalysis, updated_at: new Date().toISOString() }, 
                { onConflict: 'match_id' }
            ).then(() => {});
        }

        CACHED_ANALYSES[match.id] = verifiedAnalysis;
        return verifiedAnalysis;

    } catch (error) {
        console.error("Analysis Failed:", error);
        throw error;
    }
};