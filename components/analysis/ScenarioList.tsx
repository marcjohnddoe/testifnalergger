import React, { useState } from 'react';
import { MatchAnalysis } from '../../types';
import { PlayerAvatar } from '../ui/PlayerAvatar';

export const ScenarioList = ({ scenarios }: { scenarios: MatchAnalysis['scenarios'] }) => {
    const [expandedScenario, setExpandedScenario] = useState<number | null>(null);

    if (!scenarios || scenarios.length === 0) return null;

    return (
        <div className="lg:col-span-6 bg-[#121212] border border-white/5 rounded-[2rem] p-6 md:p-8">
            <h3 className="text-purple-400 text-[10px] uppercase font-bold tracking-widest mb-6 flex items-center gap-2">
                🔀 Scénarios Conditionnels
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {scenarios.map((sc, idx) => (
                    <div 
                    key={idx} 
                    onClick={() => setExpandedScenario(expandedScenario === idx ? null : idx)}
                    className={`bg-white/5 rounded-xl p-4 border border-white/5 hover:bg-white/10 transition-all cursor-pointer ${expandedScenario === idx ? 'ring-1 ring-purple-500/50 bg-white/[0.08]' : ''}`}
                    >
                        <div className="flex justify-between mb-2">
                            <span className="text-[9px] uppercase bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">SI...</span>
                            <span className="text-[9px] text-white/30">{sc.likelihood} prob.</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            {/* Auto-detect player name for avatar */}
                            {sc.condition && sc.condition.split(' ').slice(0,3).join(' ').match(/[A-Z][a-z]+/) && (
                                <PlayerAvatar name={sc.condition.split(' ').slice(0,2).join(' ')} />
                            )}
                            <p className="text-sm font-bold text-white leading-tight">{sc.condition}</p>
                        </div>
                        <div className="text-xs text-white/50 mb-2">Alors: <span className="text-white font-medium">{sc.outcome}</span></div>
                        
                        {expandedScenario === idx && sc.reasoning && (
                            <div className="mt-3 pt-3 border-t border-white/5 animate-fade-in-up">
                                <p className="text-xs text-white/70 italic leading-relaxed">
                                    "{sc.reasoning}"
                                </p>
                            </div>
                        )}
                        {expandedScenario !== idx && (
                            <div className="flex justify-center mt-1">
                                <span className="text-[10px] text-white/20">▼ Voir l'analyse</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};