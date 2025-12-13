import React from 'react';
import { PlayerProp } from '../../types';
import { PlayerAvatar } from '../ui/PlayerAvatar';

interface PropHunterProps {
    props: PlayerProp[];
    onAddToTicket: (item: any) => void;
}

export const PropHunter: React.FC<PropHunterProps> = ({ props, onAddToTicket }) => {
    if (!props || props.length === 0) return null;

    return (
        <div className="lg:col-span-6 bg-[#121212] border border-white/5 rounded-[2rem] p-6 md:p-8">
            <h3 className="text-orange-400 text-[10px] uppercase font-bold tracking-widest mb-6 flex items-center gap-2">
                <span className="text-lg">🎯</span> Prop Hunter
                <span className="px-2 py-0.5 rounded bg-orange-500/10 text-[9px] text-orange-400 border border-orange-500/10">Value Cibleur</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {props.map((prop, idx) => (
                    <div key={idx} className="relative group bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-xl p-4 hover:border-orange-500/30 transition-all overflow-hidden">
                        {/* Background Effect */}
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-500/10 rounded-full blur-xl group-hover:bg-orange-500/20 transition-all"></div>
                        
                        <div className="flex justify-between items-start mb-3 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="scale-110 ring-1 ring-white/20 rounded-full">
                                    <PlayerAvatar name={prop.player} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white leading-none">{prop.player}</span>
                                    <span className="text-[10px] text-white/50 uppercase tracking-wide">{prop.market}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="block text-xl font-bold font-mono text-orange-400">{prop.line}</span>
                                <span className="text-[10px] text-white/30">Ligne</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-white/5 relative z-10">
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] text-white/30">IA Conf.</span>
                                <div className="h-1.5 w-16 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-orange-500" style={{ width: `${prop.confidence}%` }}></div>
                                </div>
                                <span className="text-[9px] font-bold text-orange-400">{prop.confidence}%</span>
                            </div>
                            
                            <button 
                                onClick={() => onAddToTicket({
                                    id: `prop-${idx}-${Date.now()}`,
                                    match: prop.player,
                                    selection: `${prop.market} ${prop.line}`,
                                    odds: prop.odds
                                })}
                                className="flex items-center gap-1.5 bg-white text-black px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-orange-400 hover:text-white transition-colors shadow-lg"
                            >
                                <span className="font-mono text-xs">@{prop.odds.toFixed(2)}</span>
                                <span className="text-lg leading-none mb-[1px]">+</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};