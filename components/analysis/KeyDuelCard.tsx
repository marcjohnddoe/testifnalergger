import React from 'react';
import { KeyDuel } from '../../types';
import { PlayerAvatar } from '../ui/PlayerAvatar';

export const KeyDuelCard = ({ duel }: { duel: KeyDuel }) => {
    if (!duel) return null;

    return (
        <div className="bg-[#121212] border border-white/5 rounded-[2rem] p-6 relative overflow-hidden group h-full">
            {/* Background FX */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-[60px] pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-[60px] pointer-events-none"></div>

            <h3 className="text-white/40 text-[10px] uppercase font-bold tracking-widest mb-6 flex items-center gap-2 relative z-10">
                <span className="text-lg">⚔️</span> Duel du Match
            </h3>

            <div className="flex items-center justify-between relative z-10">
                {/* Player 1 (Home) */}
                <div className="flex flex-col items-center gap-2 w-1/3">
                    <div className="scale-150 mb-2 ring-2 ring-blue-500/30 rounded-full">
                        <PlayerAvatar name={duel.player1} />
                    </div>
                    <span className="text-xs font-bold text-white text-center leading-tight">{duel.player1}</span>
                    <span className={`text-sm font-mono font-bold ${duel.winner === 'player1' ? 'text-blue-400' : 'text-white/30'}`}>
                        {duel.value1}
                    </span>
                </div>

                {/* VS / Stat Label */}
                <div className="flex flex-col items-center gap-1 w-1/3">
                    <div className="w-px h-8 bg-white/10"></div>
                    <span className="text-[9px] text-white/30 uppercase tracking-widest text-center px-2 py-1 bg-white/5 rounded border border-white/5">
                        {duel.statLabel}
                    </span>
                    <div className="w-px h-8 bg-white/10"></div>
                </div>

                {/* Player 2 (Away) */}
                <div className="flex flex-col items-center gap-2 w-1/3">
                    <div className="scale-150 mb-2 ring-2 ring-purple-500/30 rounded-full">
                        <PlayerAvatar name={duel.player2} />
                    </div>
                    <span className="text-xs font-bold text-white text-center leading-tight">{duel.player2}</span>
                    <span className={`text-sm font-mono font-bold ${duel.winner === 'player2' ? 'text-purple-400' : 'text-white/30'}`}>
                        {duel.value2}
                    </span>
                </div>
            </div>
            
            {/* Visual Bar Comparison */}
            <div className="mt-6 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden flex justify-end">
                     <div 
                        className={`h-full ${duel.winner === 'player1' ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6]' : 'bg-white/20'}`} 
                        style={{width: duel.winner === 'player1' ? '100%' : '60%'}}
                     ></div>
                </div>
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden flex justify-start">
                     <div 
                        className={`h-full ${duel.winner === 'player2' ? 'bg-purple-500 shadow-[0_0_10px_#a855f7]' : 'bg-white/20'}`} 
                        style={{width: duel.winner === 'player2' ? '100%' : '60%'}}
                     ></div>
                </div>
            </div>
        </div>
    );
};