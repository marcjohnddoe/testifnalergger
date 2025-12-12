import React from 'react';
import { MatchAnalysis } from '../../types';

export const MonteCarloChart = ({ monteCarlo }: { monteCarlo: MatchAnalysis['monteCarlo'] }) => {
    if (!monteCarlo || !monteCarlo.distribution) return null;
    
    // Trouver le pic pour normaliser la hauteur des barres
    const maxCount = Math.max(...monteCarlo.distribution.map(d => d.count));

    return (
        <div className="bg-[#121212] border border-white/5 rounded-[2rem] p-6">
            <h3 className="text-purple-400 text-[10px] uppercase font-bold tracking-widest mb-1 flex items-center gap-2">
                🎲 Monte Carlo Engine
            </h3>
            <span className="text-[9px] text-white/30 mb-4 block">10,000 Simulations du Match</span>
            
            <div className="flex justify-between items-baseline mb-2">
                <span className="text-xl font-bold text-white">{monteCarlo.projectedScore.home} <span className="text-white/30 text-sm">-</span> {monteCarlo.projectedScore.away}</span>
                <span className="text-[9px] text-white/40 uppercase">Score Moyen Simulé</span>
            </div>

            <div className="w-full h-32 flex items-end justify-center gap-[1px] md:gap-[2px] mt-4 relative">
                {/* Ligne Zéro (Match Nul) */}
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20 z-10 border-l border-dashed border-white/30"></div>
                
                {monteCarlo.distribution.map((d, i) => {
                    const height = (d.count / maxCount) * 100;
                    // Couleur : Vert si Home gagne (diff > 0), Rouge si Away gagne (diff < 0)
                    const bg = d.diff > 0 ? 'bg-emerald-500/50' : d.diff < 0 ? 'bg-red-500/50' : 'bg-white/50';
                    return (
                        <div 
                        key={i} 
                        style={{ height: `${height}%` }}
                        className={`w-1 md:w-2 rounded-t-sm ${bg} hover:opacity-100 opacity-60 transition-all`}
                        title={`Diff: ${d.diff} pts (${d.count} sims)`}
                        ></div>
                    );
                })}
                
                <div className="absolute -bottom-4 left-0 text-[9px] text-red-400 font-bold">Away Win {monteCarlo.awayWinProb.toFixed(0)}%</div>
                <div className="absolute -bottom-4 right-0 text-[9px] text-emerald-400 font-bold">Home Win {monteCarlo.homeWinProb.toFixed(0)}%</div>
            </div>
        </div>
    );
};