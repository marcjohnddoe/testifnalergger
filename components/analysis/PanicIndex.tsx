import React from 'react';
import { SentimentAnalysis } from '../../types';

export const PanicIndex = ({ sentiment }: { sentiment: SentimentAnalysis }) => {
    if (!sentiment) return null;

    // Calcul de la rotation de l'aiguille (-90deg à 90deg)
    const rotation = (sentiment.score / 100) * 180 - 90;

    let color = "text-yellow-400";
    if (sentiment.score < 30) color = "text-red-500"; // Panic
    if (sentiment.score > 70) color = "text-green-500"; // Greed

    return (
        <div className="lg:col-span-2 bg-[#121212] border border-white/5 rounded-[2rem] p-6 flex flex-col items-center justify-between relative overflow-hidden">
            {/* Background Glow */}
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full blur-[60px] opacity-10 ${sentiment.score < 40 ? 'bg-red-500' : 'bg-green-500'}`}></div>

            <div className="w-full flex justify-between items-start mb-2 relative z-10">
                 <h3 className="text-white/40 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2">
                    😨 Panic Index
                 </h3>
                 <span className={`text-[9px] px-2 py-0.5 rounded border ${sentiment.score < 40 ? 'border-red-500/30 text-red-400 bg-red-500/10' : 'border-green-500/30 text-green-400 bg-green-500/10'}`}>
                    {sentiment.label}
                 </span>
            </div>

            {/* GAUGE */}
            <div className="relative w-40 h-20 overflow-hidden mb-2 mt-4">
                {/* Arc Background */}
                <div className="absolute w-40 h-40 rounded-full border-[6px] border-white/5 border-b-0"></div>
                {/* Gradient Arc */}
                <div 
                    className="absolute w-40 h-40 rounded-full border-[6px] border-transparent border-b-0"
                    style={{
                        background: 'conic-gradient(from 180deg, #ef4444 0deg, #eab308 90deg, #22c55e 180deg)',
                        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                        WebkitMaskComposite: 'xor',
                        maskComposite: 'exclude'
                    }}
                ></div>
                
                {/* Needle */}
                <div 
                    className="absolute bottom-0 left-1/2 w-1 h-20 bg-white origin-bottom rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-transform duration-1000 ease-out"
                    style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
                >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full"></div>
                </div>
            </div>

            <div className="text-center relative z-10">
                <span className={`text-2xl font-bold font-mono ${color}`}>{sentiment.score}</span>
                <span className="text-[10px] text-white/30 uppercase block">Sentiment Public</span>
            </div>

            <p className="text-[10px] text-white/50 text-center mt-4 border-t border-white/5 pt-3 w-full">
                "{sentiment.summary}"
            </p>
        </div>
    );
};