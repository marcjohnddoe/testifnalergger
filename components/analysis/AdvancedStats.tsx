import React from 'react';
import { MatchAnalysis } from '../../types';

export const AdvancedStats = ({ stats }: { stats: MatchAnalysis['advancedStats'] }) => {
    if (!stats || stats.length === 0) return null;

    return (
        <div className="lg:col-span-4 bg-[#121212] border border-white/5 rounded-[2rem] p-6 md:p-8">
            <h3 className="text-emerald-400 text-[10px] uppercase font-bold tracking-widest mb-6 flex items-center gap-2">
                <span className="w-1 h-4 bg-emerald-500 rounded-full"></span>
                Data Sniper (Quant)
            </h3>
            <div className="grid grid-cols-1 gap-6">
                {stats.map((stat, idx) => (
                    <div key={idx} className="relative group">
                        <div className="flex justify-between items-end mb-2">
                            <span className={`text-lg font-bold ${stat.advantage === 'home' ? 'text-white' : 'text-white/30'}`}>{stat.homeValue}</span>
                            <span className="text-[9px] uppercase tracking-widest text-white/50 bg-white/5 px-2 py-1 rounded">{stat.label}</span>
                            <span className={`text-lg font-bold ${stat.advantage === 'away' ? 'text-white' : 'text-white/30'}`}>{stat.awayValue}</span>
                        </div>
                        {/* Visual Bar with Center Marker */}
                        <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
                            {/* Center Marker */}
                            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-white/20 z-10"></div>
                            
                            <div className={`absolute top-0 bottom-0 transition-all duration-1000 ${stat.advantage === 'home' ? 'bg-gradient-to-r from-transparent to-emerald-500 right-1/2' : 'bg-transparent'}`} style={{width: '50%', opacity: stat.advantage === 'home' ? 1 : 0}}></div>
                            <div className={`absolute top-0 bottom-0 transition-all duration-1000 ${stat.advantage === 'away' ? 'bg-gradient-to-l from-transparent to-emerald-500 left-1/2' : 'bg-transparent'}`} style={{width: '50%', opacity: stat.advantage === 'away' ? 1 : 0}}></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};