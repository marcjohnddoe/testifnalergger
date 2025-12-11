import React from 'react';
import { Match, SportType } from '../types';

interface MatchCardProps {
  match: Match;
  onClick: () => void;
  isSelected?: boolean;
}

export const MatchCard: React.FC<MatchCardProps> = ({ match, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="group relative w-full h-full min-h-[180px] cursor-pointer rounded-3xl p-5 md:p-6 transition-all duration-300 border bg-white/[0.03] border-white/[0.05] hover:bg-white/[0.06] hover:border-white/10 hover:shadow-[0_0_30px_rgba(0,0,0,0.5)] hover:-translate-y-1 overflow-hidden flex flex-col justify-between"
    >
      {/* Background Sport Icon Faded */}
      <div className="absolute -right-4 -top-4 text-9xl opacity-[0.02] font-display pointer-events-none group-hover:opacity-[0.05] transition-opacity">
        {match.sport === SportType.FOOTBALL ? '⚽' : match.sport === SportType.BASKETBALL ? '🏀' : '🎾'}
      </div>

      {/* Top Meta */}
      <div className="relative flex justify-between items-start mb-4">
         <div className="flex flex-col items-start gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 bg-white/5 px-2 py-1 rounded border border-white/5">
                {match.league}
            </span>
            {match.status === 'live' && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 text-[10px] font-bold text-red-400 border border-red-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> LIVE
                </span>
            )}
         </div>
         <div className="text-[11px] font-medium text-white/40 flex flex-col items-end">
            <span className="text-white/60">{match.date}</span>
            <span>{match.time}</span>
         </div>
      </div>

      {/* Teams */}
      <div className="relative flex flex-col gap-2 mb-6">
        <div className="flex justify-between items-center group-hover:translate-x-1 transition-transform">
            <span className="text-lg md:text-xl font-bold tracking-tight text-white/90 group-hover:text-white leading-tight">
                {match.homeTeam}
            </span>
        </div>
        <div className="w-full h-px bg-white/5"></div>
        <div className="flex justify-between items-center group-hover:translate-x-1 transition-transform">
            <span className="text-lg md:text-xl font-bold tracking-tight text-white/90 group-hover:text-white leading-tight">
                {match.awayTeam}
            </span>
        </div>
      </div>

      {/* Footer info (Prediction & Odds) */}
      <div className="relative mt-auto flex items-center justify-between pt-4 border-t border-white/5">
        <div className="flex flex-col">
             <span className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Tendance</span>
             {match.quickPrediction ? (
                 <span className="text-xs font-semibold text-blue-400 truncate max-w-[120px]">{match.quickPrediction}</span>
             ) : (
                 <span className="text-xs text-white/20">En attente</span>
             )}
        </div>

        <div className="flex flex-col items-end">
             <span className="text-[9px] text-white/30 uppercase tracking-widest mb-0.5">Cote FDJ</span>
             {match.quickOdds && match.quickOdds > 1 ? (
                 <span className="text-sm font-mono font-bold text-black bg-white px-2 py-0.5 rounded shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                     {match.quickOdds.toFixed(2)}
                 </span>
             ) : (
                 <span className="text-xs text-white/20">—</span>
             )}
        </div>
      </div>
    </div>
  );
};