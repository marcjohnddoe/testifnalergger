import React, { useState } from 'react';
import { MatchAnalysis } from '../../types';
import { BetCalculator } from '../BetCalculator';

const ConsensusBar = ({ judgeConf, contrarianIntensity }: { judgeConf: number, contrarianIntensity: 'High' | 'Med' | 'Low' }) => {
    const redPart = contrarianIntensity === 'High' ? 40 : contrarianIntensity === 'Med' ? 25 : 10;
    const greenPart = 100 - redPart;

    return (
        <div className="w-full mt-2">
            <div className="flex justify-between text-[9px] uppercase tracking-widest text-white/40 mb-1">
                <span>Consensus Juge</span>
                <span>Tension Contrarian</span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden flex">
                <div style={{ width: `${greenPart}%` }} className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                <div style={{ width: `${redPart}%` }} className="h-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]"></div>
            </div>
        </div>
    );
};

export const PredictionCard = ({ analysis }: { analysis: MatchAnalysis }) => {
    // Le premier est le MAIN, les autres sont secondaires
    const mainPrediction = analysis.predictions[0];
    const otherPredictions = analysis.predictions.slice(1);
    
    // State pour gérer l'ouverture des cartes secondaires
    const [expandedPred, setExpandedPred] = useState<number | null>(null);
    
    const mainConf = mainPrediction?.confidence || 0;
    const radius = 28;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (mainConf / 100) * circumference;

    const getConfidenceColor = (score: number) => {
        if (score >= 80) return 'text-emerald-400 stroke-emerald-500';
        if (score >= 60) return 'text-yellow-400 stroke-yellow-500';
        return 'text-red-400 stroke-red-500';
    };

    const copyBet = (text: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="lg:col-span-4 lg:row-span-2 flex flex-col gap-4">
            {/* MAIN HERO CARD */}
            <div className="flex-1 bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-emerald-500/20 rounded-[2rem] p-1 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none"></div>
                
                <div className="h-full bg-[#121212]/90 backdrop-blur-sm rounded-[1.8rem] p-6 md:p-8 flex flex-col justify-between relative z-10">
                    
                    {/* Gauge */}
                    {mainPrediction && (
                    <div className="absolute top-6 right-6 flex flex-col items-end">
                        <div className="relative w-16 h-16 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" className="text-white/5" />
                                <circle 
                                    cx="32" cy="32" r={radius} 
                                    stroke="currentColor" strokeWidth="6" 
                                    fill="transparent" 
                                    strokeLinecap="round"
                                    className={`${getConfidenceColor(mainConf)} transition-all duration-1000 ease-out`}
                                    style={{ strokeDasharray: circumference, strokeDashoffset }}
                                />
                            </svg>
                            <span className={`absolute text-sm font-bold ${getConfidenceColor(mainConf).split(' ')[0]}`}>{mainConf}%</span>
                        </div>
                        <span className="text-[9px] text-white/30 uppercase tracking-widest mt-1 font-bold">Confiance</span>
                    </div>
                    )}

                    <div>
                        <div className="flex flex-wrap items-center gap-3 mb-6">
                            <span className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold uppercase tracking-wide shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                                {mainPrediction?.betType || 'Verdict Juge'}
                            </span>
                            {mainPrediction?.edge !== undefined && (
                                <span className={`px-2 py-1 rounded bg-white/10 border border-white/10 text-[10px] font-bold uppercase tracking-widest ${mainPrediction.edge > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    Edge {mainPrediction.edge > 0 ? '+' : ''}{mainPrediction.edge.toFixed(1)}%
                                </span>
                            )}
                        </div>
                        
                        {mainPrediction && (
                            <>
                                <div className="text-3xl md:text-4xl font-bold text-white mb-2 leading-tight pr-16">
                                    {mainPrediction.selection}
                                </div>
                                <div className="flex items-baseline gap-4 mb-4">
                                    {mainPrediction.odds > 0 ? (
                                        <span className="text-5xl md:text-6xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200 tracking-tighter">
                                            {Number(mainPrediction.odds).toFixed(2)}
                                        </span>
                                    ) : (
                                        <span className="text-2xl font-mono text-white/30">En attente</span>
                                    )}
                                    <div className="flex gap-2">
                                        {mainPrediction.units && (
                                            <div className="flex flex-col items-start px-3 py-1 rounded bg-white/5 border border-white/5">
                                                <span className="text-[9px] text-white/40 uppercase">Mise</span>
                                                <span className="text-white font-mono font-bold">{mainPrediction.units}u</span>
                                            </div>
                                        )}
                                        <button 
                                        onClick={(e) => copyBet(`${mainPrediction.selection} @ ${mainPrediction.odds}`, e)}
                                        className="px-3 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-[9px] uppercase tracking-widest text-white/50 hover:text-white transition-colors flex items-center gap-1"
                                        >
                                            Copy Bet
                                        </button>
                                    </div>
                                </div>

                                <p className="text-sm md:text-base text-white/70 italic border-l-2 border-emerald-500/30 pl-4 py-1 leading-relaxed max-w-2xl">
                                    "{mainPrediction.reasoning}"
                                </p>
                                
                                <ConsensusBar judgeConf={mainPrediction.confidence} contrarianIntensity={analysis.contrarianView ? 'Med' : 'Low'} />
                            </>
                        )}
                    </div>
                    
                    <div className="mt-8 pt-6 border-t border-white/5">
                        <BetCalculator 
                        odds={Number(mainPrediction?.odds)} 
                        recommendedUnits={mainPrediction?.units}
                        />
                    </div>
                </div>
            </div>

            {/* SECONDARY PREDICTIONS LIST */}
            {otherPredictions.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {otherPredictions.map((pred, idx) => {
                        const isExpanded = expandedPred === idx;
                        return (
                            <div 
                                key={idx} 
                                onClick={() => setExpandedPred(isExpanded ? null : idx)}
                                className={`
                                    border rounded-xl p-4 transition-all cursor-pointer group flex flex-col gap-2
                                    ${isExpanded 
                                        ? 'bg-white/[0.08] border-white/10 shadow-lg' 
                                        : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.05]'
                                    }
                                `}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] text-white/40 uppercase tracking-widest mb-1">{pred.betType}</span>
                                        <span className="font-bold text-white text-sm">{pred.selection}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        {pred.odds > 0 ? (
                                            <span className="text-lg font-bold font-mono text-emerald-400">{pred.odds.toFixed(2)}</span>
                                        ) : (
                                            <span className="text-xs text-white/20 font-mono">--</span>
                                        )}
                                        <div className="flex items-center gap-1 mt-1">
                                            <div className="w-10 h-1 bg-white/10 rounded-full overflow-hidden">
                                                <div className="h-full bg-white/50" style={{width: `${pred.confidence}%`}}></div>
                                            </div>
                                            <span className="text-[9px] text-white/30">{pred.confidence}%</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Reasoning Section - Collapsible */}
                                <div className={`relative ${isExpanded ? 'mt-2' : ''}`}>
                                    <p className={`text-[10px] text-white/50 transition-all duration-300 ${isExpanded ? 'text-white/80 leading-relaxed' : 'truncate'}`}>
                                        {pred.reasoning}
                                    </p>
                                    {!isExpanded && (
                                        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#111] via-[#111]/80 to-transparent pointer-events-none group-hover:via-[#161616]/80"></div>
                                    )}
                                </div>
                                
                                <div className={`flex justify-center transition-all duration-300 overflow-hidden ${isExpanded ? 'h-4 opacity-100' : 'h-0 opacity-0'}`}>
                                    <span className="text-[9px] text-white/20 uppercase tracking-widest">Cliquez pour réduire</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};