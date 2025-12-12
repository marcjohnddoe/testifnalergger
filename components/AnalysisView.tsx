import React, { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import html2canvas from 'html2canvas';
import { Match, MatchAnalysis } from '../types';
import { BetCalculator } from './BetCalculator';

interface AnalysisViewProps {
  match: Match;
  analysis: MatchAnalysis | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

// --- SUB-COMPONENTS (SVG VIZ) ---

const Sparkline = ({ trend }: { trend?: string }) => {
    // Mock data based on trend (Text to visual)
    const isDropping = trend?.toLowerCase().includes('dropping');
    const isRising = trend?.toLowerCase().includes('drifting') || trend?.toLowerCase().includes('rising');
    const color = isDropping ? '#10b981' : isRising ? '#f43f5e' : '#94a3b8';
    
    // SVG Path d
    const path = isDropping 
        ? "M0 25 Q 10 20, 20 22 T 40 15 T 60 18 T 80 5" // Descente (bon pour favori)
        : isRising 
        ? "M0 10 Q 10 15, 20 12 T 40 18 T 60 15 T 80 28" // Montée (mauvais)
        : "M0 15 Q 20 10, 40 20 T 80 15"; // Stable

    return (
        <svg width="80" height="30" viewBox="0 0 80 30" className="opacity-80">
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
            <circle cx="80" cy={isDropping ? 5 : isRising ? 28 : 15} r="2" fill={color} className="animate-pulse"/>
        </svg>
    );
};

const ConsensusBar = ({ judgeConf, contrarianIntensity }: { judgeConf: number, contrarianIntensity: 'High' | 'Med' | 'Low' }) => {
    // Estimer la tension : High contrarian = red part bigger
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

const PlayerAvatar = ({ name }: { name: string }) => {
    if (!name) return <div className="w-6 h-6 rounded-full bg-white/10" />;
    // Generate initials
    const initials = name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
    return (
        <div className="w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[9px] font-bold text-white/70">
            {initials}
        </div>
    );
};

// --- MONTE CARLO CHART ---
const MonteCarloChart = ({ monteCarlo }: { monteCarlo: MatchAnalysis['monteCarlo'] }) => {
    if (!monteCarlo || !monteCarlo.distribution) return null;
    
    // Trouver le pic pour normaliser la hauteur des barres
    const maxCount = Math.max(...monteCarlo.distribution.map(d => d.count));

    return (
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
    );
};

export const AnalysisView: React.FC<AnalysisViewProps> = ({ match, analysis, loading, onRefresh }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [expandedScenario, setExpandedScenario] = useState<number | null>(null);

  const handleExport = async () => {
    if (!contentRef.current) return;
    setIsExporting(true);
    try {
      await new Promise(res => setTimeout(res, 100));
      const canvas = await html2canvas(contentRef.current, {
        backgroundColor: '#050505',
        scale: 2,
        useCORS: true,
        logging: false,
        scrollY: -window.scrollY,
        height: contentRef.current.scrollHeight + 50,
        windowHeight: contentRef.current.scrollHeight + 100
      });
      const link = document.createElement('a');
      link.download = `BetMind-HedgeFund-${match.homeTeam}-${match.awayTeam}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    } catch (error) {
      console.error("Export failed", error);
      alert("Erreur lors de l'export.");
    } finally {
      setIsExporting(false);
    }
  };

  const copyBet = (text: string) => {
      navigator.clipboard.writeText(text);
      // Feedback visuel idéalement, ici simple alert/log ou toast
      // alert("Pari copié !");
  };

  const getConfidenceColor = (score: number) => {
      if (score >= 80) return 'text-emerald-400 stroke-emerald-500';
      if (score >= 60) return 'text-yellow-400 stroke-yellow-500';
      return 'text-red-400 stroke-red-500';
  };
  
  if (loading && !analysis) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[#050505]">
        <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 border-t-2 border-white/20 rounded-full animate-spin"></div>
            <div className="absolute inset-2 border-r-2 border-emerald-500/50 rounded-full animate-spin reverse"></div>
        </div>
        <h3 className="text-2xl font-display font-medium text-white mb-2 animate-pulse">Conseil des Sages en cours...</h3>
        <p className="text-white/40 text-sm tracking-wide">Agents actifs : Miner, Quant, Trader, Contrarian.</p>
        <div className="mt-4 flex gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"></span>
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce delay-100"></span>
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-bounce delay-200"></span>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-bounce delay-300"></span>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const mainConf = analysis.predictions[0]?.confidence || 0;
  const strokeDashoffset = circumference - (mainConf / 100) * circumference;

  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-8 pb-32">
      {/* ACTION BAR */}
      <div className="flex justify-end mb-4 gap-3">
        <button 
          onClick={onRefresh}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-all text-xs font-bold uppercase tracking-wider text-red-400 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
           {loading ? 'Agents Running...' : '🔴 Live Update'}
        </button>
        <button 
          onClick={handleExport}
          disabled={isExporting || loading}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-xs font-bold uppercase tracking-wider text-white"
        >
           {isExporting ? 'Capture...' : '📸 Sauvegarder'}
        </button>
      </div>

      {/* CONTENT */}
      <div ref={contentRef} className="bg-[#050505] p-4 md:p-8 rounded-[3rem] border border-white/5 shadow-2xl relative">
        
        {loading && (
             <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm rounded-[3rem] flex items-center justify-center">
                 <div className="flex flex-col items-center">
                     <span className="text-emerald-500 text-xs uppercase tracking-widest animate-pulse">Délibération du Juge...</span>
                 </div>
             </div>
        )}

        {/* HERO HEADER */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] uppercase tracking-widest text-white/60 mb-4">
              <span>{match.league}</span>
              <span className="w-1 h-1 bg-white/30 rounded-full"></span>
              <span>{match.date}</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-display font-bold text-white tracking-tighter mb-2">
              {match.homeTeam} <span className="text-white/20 mx-2 font-thin">vs</span> {match.awayTeam}
          </h2>

          {analysis.liveScore && (
              <div className="mt-4 flex flex-col items-center animate-fade-in-up">
                  <div className="px-6 py-2 bg-red-500/10 border border-red-500/20 rounded-2xl backdrop-blur-sm">
                      <span className="text-3xl md:text-4xl font-mono font-bold text-red-500 tracking-widest">
                          {analysis.liveScore}
                      </span>
                  </div>
                  {analysis.matchMinute && (
                      <span className="text-red-400 text-xs font-bold uppercase tracking-widest mt-2 animate-pulse">
                          ● En Direct {analysis.matchMinute}
                      </span>
                  )}
              </div>
          )}
        </div>

        {/* BENTO GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 md:gap-6">
          
          {/* MAIN PREDICTION */}
          <div className="lg:col-span-4 lg:row-span-2 bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-emerald-500/20 rounded-[2rem] p-1 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] -mr-20 -mt-20 pointer-events-none"></div>
              
              <div className="h-full bg-[#121212]/90 backdrop-blur-sm rounded-[1.8rem] p-6 md:p-8 flex flex-col justify-between relative z-10">
                  
                  {/* Gauge */}
                  {analysis.predictions[0] && (
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
                              Verdict Juge
                          </span>
                          {analysis.predictions[0]?.edge !== undefined && (
                              <span className={`px-2 py-1 rounded bg-white/10 border border-white/10 text-[10px] font-bold uppercase tracking-widest ${analysis.predictions[0].edge > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  Edge {analysis.predictions[0].edge > 0 ? '+' : ''}{(analysis.predictions[0].edge * 100).toFixed(1)}%
                              </span>
                          )}
                      </div>
                      
                      {analysis.predictions[0] && (
                          <>
                              <div className="text-3xl md:text-4xl font-bold text-white mb-2 leading-tight pr-16">
                                  {analysis.predictions[0].selection || analysis.predictions[0].betType}
                              </div>
                              <div className="flex items-baseline gap-4 mb-4">
                                  <span className="text-5xl md:text-6xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200 tracking-tighter">
                                      {Number(analysis.predictions[0].odds).toFixed(2)}
                                  </span>
                                  <div className="flex gap-2">
                                     {analysis.predictions[0].units && (
                                          <div className="flex flex-col items-start px-3 py-1 rounded bg-white/5 border border-white/5">
                                              <span className="text-[9px] text-white/40 uppercase">Mise</span>
                                              <span className="text-white font-mono font-bold">{analysis.predictions[0].units}u</span>
                                          </div>
                                      )}
                                      <button 
                                        onClick={() => copyBet(`${analysis.predictions[0].selection} @ ${analysis.predictions[0].odds}`)}
                                        className="px-3 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-[9px] uppercase tracking-widest text-white/50 hover:text-white transition-colors flex items-center gap-1"
                                      >
                                          Copy Bet
                                      </button>
                                  </div>
                              </div>

                              <p className="text-sm md:text-base text-white/70 italic border-l-2 border-emerald-500/30 pl-4 py-1 leading-relaxed max-w-2xl">
                                  "{analysis.predictions[0].reasoning}"
                              </p>
                              
                              <ConsensusBar judgeConf={analysis.predictions[0].confidence} contrarianIntensity={analysis.contrarianView ? 'Med' : 'Low'} />
                          </>
                      )}
                  </div>
                  
                  <div className="mt-8 pt-6 border-t border-white/5">
                      <BetCalculator 
                        odds={Number(analysis.predictions[0]?.odds)} 
                        recommendedUnits={analysis.predictions[0]?.units}
                      />
                  </div>
              </div>
          </div>

          {/* SIDE: MONTE CARLO & LIVE SCRIPT */}
          <div className="lg:col-span-2 flex flex-col gap-4">
              
              {/* MONTE CARLO SIMULATOR */}
              {analysis.monteCarlo && (
                  <div className="bg-[#121212] border border-white/5 rounded-[2rem] p-6">
                       <h3 className="text-purple-400 text-[10px] uppercase font-bold tracking-widest mb-1 flex items-center gap-2">
                          🎲 Monte Carlo Engine
                      </h3>
                      <span className="text-[9px] text-white/30 mb-4 block">10,000 Simulations du Match</span>
                      
                      <div className="flex justify-between items-baseline mb-2">
                          <span className="text-xl font-bold text-white">{analysis.monteCarlo.projectedScore.home} <span className="text-white/30 text-sm">-</span> {analysis.monteCarlo.projectedScore.away}</span>
                          <span className="text-[9px] text-white/40 uppercase">Score Moyen Simulé</span>
                      </div>
                      
                      <MonteCarloChart monteCarlo={analysis.monteCarlo} />
                  </div>
              )}

              {/* LIVE TRADING SCRIPT */}
              {analysis.liveStrategy && analysis.liveStrategy.action !== '-' && (
                  <div className="flex-1 bg-blue-900/10 border border-blue-500/20 rounded-[2rem] p-6 relative overflow-hidden flex flex-col">
                       <div className="absolute top-0 right-0 p-3 opacity-10 text-4xl">⚡</div>
                       <h3 className="text-blue-400 text-[10px] uppercase font-bold tracking-widest mb-4">Algo Live Trading</h3>
                       
                       <div className="flex flex-col gap-3">
                           <div className="bg-blue-500/10 p-2 rounded border border-blue-500/20">
                               <span className="text-[9px] text-blue-300 uppercase block mb-1">Trigger (Quand ?)</span>
                               <span className="text-sm font-bold text-white">{analysis.liveStrategy.triggerTime}</span>
                           </div>
                           <div className="bg-blue-500/10 p-2 rounded border border-blue-500/20">
                               <span className="text-[9px] text-blue-300 uppercase block mb-1">Condition (Quoi ?)</span>
                               <span className="text-xs text-white leading-tight">{analysis.liveStrategy.condition}</span>
                           </div>
                           <div className="bg-white/10 p-2 rounded border border-white/10 mt-auto">
                               <span className="text-[9px] text-white/50 uppercase block mb-1">Action</span>
                               <span className="text-sm font-bold text-white block mb-1">{analysis.liveStrategy.action}</span>
                               <span className="text-[10px] text-emerald-400">Target Cote: @{analysis.liveStrategy.targetOdds}</span>
                           </div>
                       </div>
                  </div>
              )}
          </div>

          {/* SCENARIOS (INTERACTIVE) */}
          {analysis.scenarios && analysis.scenarios.length > 0 && (
              <div className="lg:col-span-6 bg-[#121212] border border-white/5 rounded-[2rem] p-6 md:p-8">
                  <h3 className="text-purple-400 text-[10px] uppercase font-bold tracking-widest mb-6 flex items-center gap-2">
                      🔀 Scénarios Conditionnels
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {analysis.scenarios.map((sc, idx) => (
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
          )}

          {/* ADVANCED STATS (DATA VIZ) */}
          {analysis.advancedStats && analysis.advancedStats.length > 0 && (
              <div className="lg:col-span-4 bg-[#121212] border border-white/5 rounded-[2rem] p-6 md:p-8">
                  <h3 className="text-emerald-400 text-[10px] uppercase font-bold tracking-widest mb-6 flex items-center gap-2">
                      <span className="w-1 h-4 bg-emerald-500 rounded-full"></span>
                      Data Sniper (Quant)
                  </h3>
                  <div className="grid grid-cols-1 gap-6">
                      {analysis.advancedStats.map((stat, idx) => (
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
          )}

           {/* INFO BLOCK (Injuries, Ref, Weather) */}
           <div className="lg:col-span-2 bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 md:p-8">
              <h3 className="text-white/30 text-[10px] uppercase font-bold tracking-widest mb-4">Rapport Miner</h3>
              <div className="space-y-4">
                  <div>
                      <h4 className="text-[10px] text-white/40 uppercase mb-1">Blessures / Absences</h4>
                      <ul className="space-y-2">
                          {Array.isArray(analysis.injuries) && analysis.injuries.length > 0 ? (
                              analysis.injuries.map((inj: any, i) => (
                                  <li key={i} className="text-xs text-white/70 flex items-center gap-2 bg-white/5 p-2 rounded-lg border border-white/5">
                                      {/* Avatar for injury */}
                                      {typeof inj === 'object' && inj.player && <PlayerAvatar name={inj.player} />}
                                      <div className="flex flex-col">
                                          <span className="font-bold text-white/90">{typeof inj === 'string' ? inj : inj.player}</span>
                                          {typeof inj === 'object' && <span className="text-[9px] text-red-400 uppercase">{inj.status}</span>}
                                      </div>
                                  </li>
                              ))
                          ) : <li className="text-xs text-white/30">R.A.S</li>}
                      </ul>
                  </div>
                  {analysis.referee && (
                    <div>
                        <h4 className="text-[10px] text-white/40 uppercase mb-1">Arbitre</h4>
                        <p className="text-xs text-white">{analysis.referee}</p>
                    </div>
                  )}
                  {analysis.weather && (
                    <div>
                        <h4 className="text-[10px] text-white/40 uppercase mb-1">Météo</h4>
                        <p className="text-xs text-white">{analysis.weather}</p>
                    </div>
                  )}
              </div>
          </div>

          {/* SUMMARY */}
          <div className="lg:col-span-6 bg-[#121212] border border-white/5 rounded-[2rem] p-6 md:p-8">
              <h3 className="text-white/30 text-[10px] uppercase font-bold tracking-widest mb-4">Synthèse du Juge</h3>
              <div className="prose prose-invert prose-sm max-w-none text-white/70 leading-relaxed columns-1 md:columns-2 gap-8">
                  <ReactMarkdown>{analysis.summary}</ReactMarkdown>
              </div>
          </div>

        </div>
      </div>
    </div>
  );
};