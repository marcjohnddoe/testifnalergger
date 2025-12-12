
import { MonteCarloResult, SimulationInputs, SportType } from "../types";

// Box-Muller transform pour générer une distribution normale (Gaussienne)
// Retourne un nombre aléatoire suivant une loi normale centrée réduite N(0,1)
const randomNormal = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

export const runMonteCarlo = (inputs: SimulationInputs, sport: SportType, iterations: number = 10000): MonteCarloResult => {
    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    
    let totalHomeScore = 0;
    let totalAwayScore = 0;

    // Stockage de la distribution des écarts (Home Score - Away Score)
    // Map de l'écart -> nombre d'occurrences
    const diffMap = new Map<number, number>();

    // Facteur de variance selon le sport
    // Le basket a plus de variance de points (écart type plus grand) que le foot
    const stdDev = sport === SportType.BASKETBALL ? 12 : 1.2; 
    
    // Ajustement de base pour le score moyen selon le sport
    const baseScore = sport === SportType.BASKETBALL ? 100 : 1.3;

    for (let i = 0; i < iterations; i++) {
        // Logique de simulation simplifiée basée sur les Ratings (0-100)
        // Score = Base + (Attaque - DefenseAdverse)/Facteur + Aleatoire
        
        // Facteur de puissance : à quel point le rating impacte le score
        const powerFactor = sport === SportType.BASKETBALL ? 0.5 : 0.03;

        // Génération des scores
        // On ajoute le "tempo" pour le basket s'il existe
        const tempoMult = (inputs.tempo || 50) / 50; // 1.0 est la base

        let simHomeScore = baseScore + ((inputs.homeAttack - inputs.awayDefense) * powerFactor) + (randomNormal() * stdDev);
        let simAwayScore = baseScore + ((inputs.awayAttack - inputs.homeDefense) * powerFactor) + (randomNormal() * stdDev);

        if (sport === SportType.BASKETBALL) {
            simHomeScore *= tempoMult;
            simAwayScore *= tempoMult;
            // Pas de nul au basket (prolongations implicites dans la simu simple)
            if (Math.round(simHomeScore) === Math.round(simAwayScore)) {
                 // Coin flip léger avantage home
                 simHomeScore += 1;
            }
        }

        // Arrondi
        const finalHome = Math.round(Math.max(0, simHomeScore));
        const finalAway = Math.round(Math.max(0, simAwayScore));

        totalHomeScore += finalHome;
        totalAwayScore += finalAway;

        const diff = finalHome - finalAway;
        diffMap.set(diff, (diffMap.get(diff) || 0) + 1);

        if (finalHome > finalAway) homeWins++;
        else if (finalAway > finalHome) awayWins++;
        else draws++;
    }

    // Préparation des données de distribution pour le graphique (Bell Curve)
    // On trie les écarts du plus petit au plus grand
    const distribution: { diff: number; count: number }[] = [];
    const minDiff = Math.min(...diffMap.keys());
    const maxDiff = Math.max(...diffMap.keys());

    // On lisse un peu ou on regroupe si trop large (surtout basket)
    const step = sport === SportType.BASKETBALL ? 2 : 1; 
    
    for (let d = minDiff; d <= maxDiff; d += step) {
        let count = 0;
        // Aggrégation si step > 1
        for(let s=0; s<step; s++) {
             count += diffMap.get(d + s) || 0;
        }
        if (count > 0) {
            distribution.push({ diff: d, count });
        }
    }

    return {
        homeWinProb: (homeWins / iterations) * 100,
        awayWinProb: (awayWins / iterations) * 100,
        drawProb: (draws / iterations) * 100,
        projectedScore: {
            home: Math.round(totalHomeScore / iterations),
            away: Math.round(totalAwayScore / iterations)
        },
        distribution: distribution.sort((a, b) => a.diff - b.diff),
        totalIterations: iterations
    };
};
