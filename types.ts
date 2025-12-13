
export enum SportType {
  FOOTBALL = 'Football',
  BASKETBALL = 'Basketball',
  TENNIS = 'Tennis',
  OTHER = 'Autre'
}

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  time: string;
  date?: string; // Nouveau: Date courte (ex: 06/03)
  sport: SportType;
  status?: 'scheduled' | 'live' | 'finished';
  isTrending?: boolean; // Pour l'onglet Tendance
  reliability?: number; // Score de 0 à 100 pour "Le + Sûr"
  quickPrediction?: string; // Nouveau: Prono rapide affiché sur la liste
  quickConfidence?: number; // Nouveau: % affiché sur la liste
  quickOdds?: number; // Nouveau: Cote associée au prono rapide
  // NOUVEAU : Radar de Marché
  marketMove?: string; // ex: "-15% Drop", "High Vol"
  marketAlert?: 'dropping' | 'heavy' | 'stable'; // Pour la couleur du badge
}

export interface BettingTip {
  betType: string;
  selection?: string; // Le choix précis (ex: "Lakers")
  odds: number;
  confidence: number; // 0-100
  reasoning: string;
  edge?: number; // Avantage mathématique (Value)
  units?: number; // Mise conseillée (Kelly Criterion)
  probability?: number; // Probabilité estimée par l'IA
  condition?: string; // Nouveau: Condition de validation (ex: "Si Giannis joue")
}

export interface AdvancedStat {
  label: string; // ex: "xG (Expected Goals)", "Pace", "Defensive Rating"
  homeValue: string | number;
  awayValue: string | number;
  advantage: 'home' | 'away' | 'equal';
}

export interface MarketAnalysis {
  publicTrend?: string; // Où va l'argent du public
  sharpMoney?: string; // Où va l'argent des pros
  openingOdds?: number;
  currentOdds?: number;
  oddsMovement?: string; // "Stable", "Dropping", "Drifting"
  valueStatus?: string; // "Value Intact", "Value Sucked Out"
}

export interface TrueProbability {
  home: number;
  draw?: number;
  away: number;
}

export interface DetailedInjury {
  player: string;
  status: string; // "Out", "Doubtful"
  impact: string; // "High", "Medium"
}

export interface Scenario {
  condition: string;
  outcome: string;
  likelihood: string; // "High", "Med", "Low"
  reasoning?: string; // Explication détaillée pour l'accordéon
}

// --- NOUVEAUX TYPES ---

export interface SimulationInputs {
  homeAttack: number; // Score 0-100
  homeDefense: number; // Score 0-100
  awayAttack: number;
  awayDefense: number;
  tempo?: number; // Facteur de vitesse (surtout NBA)
}

export interface MonteCarloResult {
  homeWinProb: number; // %
  awayWinProb: number; // %
  drawProb?: number; // %
  projectedScore: { home: number; away: number };
  distribution: { diff: number; count: number }[]; // Pour la Bell Curve (Différence de points)
  totalIterations: number;
}

export interface LiveStrategy {
  triggerTime: string; // ex: "Mi-temps" ou "75ème minute"
  condition: string; // ex: "Score nul (0-0) ET Domination possession"
  action: string; // ex: "Miser 'Home Team to Win'"
  targetOdds: number; // Cote visée (ex: attendre que ça monte à 2.00)
  rationale: string;
}

export interface KeyDuel {
  player1: string; // Nom du joueur 1 (Home)
  player2: string; // Nom du joueur 2 (Away)
  statLabel: string; // Ex: "Points/Match" ou "Buts cette saison"
  value1: string | number;
  value2: string | number;
  winner: 'player1' | 'player2' | 'equal';
}

// --- PROP HUNTER & PANIC INDEX ---
export interface PlayerProp {
  player: string;
  market: string; // ex: "Points", "Rebonds", "Tirs cadrés"
  line: string; // ex: "Over 24.5"
  odds: number;
  confidence: number;
}

export interface SentimentAnalysis {
  score: number; // 0-100 (0=Panic, 100=Greed)
  label: string; // "Extreme Fear", "Neutral", "Greed"
  summary: string; // Explication courte
}

export interface TicketItem {
  id: string;
  match: string;
  selection: string;
  odds: number;
}

export interface MatchAnalysis {
  matchId: string;
  reasoning_trace?: string; // LE BROUILLON DE L'IA (Reasoning Trace)
  summary: string;
  contrarianView?: string; // L'avis de l'avocat du diable
  scenarios?: Scenario[]; // Scénarios conditionnels
  keyFactors: string[];
  injuries: string[] | DetailedInjury[]; // Supporte les deux formats
  predictions: BettingTip[];
  sources: { title: string; uri: string; sourceIcon?: string }[];
  weather?: string;
  weatherImpact?: string; // Détail impact météo
  referee?: string;
  socialContext?: string; // Résumé avis fans/twitter
  lastMinuteNews?: string; // Infos de dernière minute (leaks compo etc)
  tvChannel?: string; // Nouveau: Chaîne TV française
  advancedStats?: AdvancedStat[]; // Nouveau: Données chiffrées précises (Understat/Statmuse)
  liveScore?: string; // Nouveau: Score en direct (ex: "2-1")
  matchMinute?: string; // Nouveau: Minute du match (ex: "75'")
  marketAnalysis?: MarketAnalysis; // Nouveau: Analyse financière
  trueProbability?: TrueProbability; // Nouveau: Probas IA
  keyDuel?: KeyDuel; // Nouveau: Duel de joueurs
  
  // --- NOUVEAUX CHAMPS ---
  simulationInputs?: SimulationInputs; // Données brutes pour le moteur
  monteCarlo?: MonteCarloResult; // Résultat de la simulation
  liveStrategy?: LiveStrategy; // Plan de bataille live
  playerProps?: PlayerProp[]; // Nouveau: Prop Hunter
  sentiment?: SentimentAnalysis; // Nouveau: Panic Index
}

export interface SearchResultMatch {
  home: string;
  away: string;
  league: string;
  time: string;
  sport: string;
  trending?: boolean;
}