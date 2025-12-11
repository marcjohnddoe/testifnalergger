
import React, { useState, useEffect } from 'react';

interface BetCalculatorProps {
  odds: number;
  recommendedUnits?: number; // ex: 1.5
}

export const BetCalculator: React.FC<BetCalculatorProps> = ({ odds, recommendedUnits }) => {
  const safeOdds = Number(odds) || 0;
  const [unitValue, setUnitValue] = useState<number>(100); // 1 unité = 100$ par défaut
  const [wager, setWager] = useState<number>(100);

  const potentialWin = (wager * safeOdds).toFixed(2);
  const recommendedWager = recommendedUnits ? recommendedUnits * unitValue : null;

  return (
    <div className="mt-2 pt-4 border-t border-white/10">
      <div className="flex justify-between items-baseline mb-3">
        <h4 className="text-[10px] uppercase text-white/30 font-bold tracking-widest">Simulateur Gain</h4>
        <div className="flex items-center gap-1">
            <span className="text-[9px] text-white/30 uppercase">Valeur 1 Unité:</span>
            <input 
                type="number"
                value={unitValue}
                onChange={(e) => setUnitValue(Number(e.target.value))}
                className="w-12 bg-transparent text-right text-[10px] text-white/50 border-b border-white/10 focus:outline-none focus:border-white focus:text-white"
            />
            <span className="text-[9px] text-white/30">$</span>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mb-3">
        {[20, 50, 100].map(amt => (
             <button 
             key={amt}
             onClick={() => setWager(amt)} 
             className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${wager === amt && (!recommendedWager || wager !== recommendedWager) ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
           >{amt}$</button>
        ))}
        
        {recommendedWager && (
            <button 
                onClick={() => setWager(recommendedWager)}
                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all border border-emerald-500/30 ${wager === recommendedWager ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
            >
                IA: {recommendedUnits}u ({recommendedWager}$)
            </button>
        )}

        <div className="relative flex-1">
          <input 
            type="number" 
            value={wager}
            onChange={(e) => setWager(Number(e.target.value))}
            className="w-full bg-black/40 border border-white/10 rounded-md py-1 pl-2 pr-2 text-white text-xs text-right focus:outline-none focus:border-white/30 font-mono"
          />
        </div>
      </div>

      <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5">
        <div className="flex flex-col">
            <span className="text-xs text-white/50 font-medium">Gain Potentiel</span>
            {wager === recommendedWager && (
                <span className="text-[9px] text-emerald-500/70">Basé sur reco. IA</span>
            )}
        </div>
        <span className="text-lg font-bold text-emerald-400 font-mono">{potentialWin} $</span>
      </div>
    </div>
  );
};
