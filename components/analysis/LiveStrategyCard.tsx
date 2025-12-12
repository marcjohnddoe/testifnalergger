import React from 'react';
import { MatchAnalysis } from '../../types';

export const LiveStrategyCard = ({ strategy }: { strategy: MatchAnalysis['liveStrategy'] }) => {
    if (!strategy || strategy.action === '-') return null;

    return (
        <div className="flex-1 bg-blue-900/10 border border-blue-500/20 rounded-[2rem] p-6 relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 p-3 opacity-10 text-4xl">⚡</div>
            <h3 className="text-blue-400 text-[10px] uppercase font-bold tracking-widest mb-4">Algo Live Trading</h3>
            
            <div className="flex flex-col gap-3">
                <div className="bg-blue-500/10 p-2 rounded border border-blue-500/20">
                    <span className="text-[9px] text-blue-300 uppercase block mb-1">Trigger (Quand ?)</span>
                    <span className="text-sm font-bold text-white">{strategy.triggerTime}</span>
                </div>
                <div className="bg-blue-500/10 p-2 rounded border border-blue-500/20">
                    <span className="text-[9px] text-blue-300 uppercase block mb-1">Condition (Quoi ?)</span>
                    <span className="text-xs text-white leading-tight">{strategy.condition}</span>
                </div>
                <div className="bg-white/10 p-2 rounded border border-white/10 mt-auto">
                    <span className="text-[9px] text-white/50 uppercase block mb-1">Action</span>
                    <span className="text-sm font-bold text-white block mb-1">{strategy.action}</span>
                    <span className="text-[10px] text-emerald-400">Target Cote: @{strategy.targetOdds}</span>
                </div>
            </div>
        </div>
    );
};