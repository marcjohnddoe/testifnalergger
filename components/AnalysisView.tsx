import React, { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import html2canvas from 'html2canvas';
import { motion } from 'framer-motion';
import { Match, MatchAnalysis } from '../types';
import { PredictionCard } from './analysis/PredictionCard';
import { MonteCarloChart } from './analysis/MonteCarloChart';
import { LiveStrategyCard } from './analysis/LiveStrategyCard';
import { ScenarioList } from './analysis/ScenarioList';
import { AdvancedStats } from './analysis/AdvancedStats';
import { PlayerAvatar } from './ui/PlayerAvatar';
import { Typewriter } from './ui/Typewriter';

interface AnalysisViewProps {
  match: Match;
  analysis: MatchAnalysis | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 }
};

export const AnalysisView: React.FC<AnalysisViewProps> = ({ match, analysis, loading, onRefresh }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

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
    } finally {
      setIsExporting(false);
    }
  };
  
  if (loading && !analysis) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[#050505]">
        <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 border-t-2 border-white/20 rounded-full animate-spin"></div>
            <div className="absolute inset-2 border-r-2 border-emerald-500/50 rounded-full animate-spin reverse"></div>
        </div>
        <Typewriter text="Initialisation des protocoles Quant..." className="text-emerald-500 font-mono text-sm mb-2" speed={30} />
        <p className="text-white/30 text-xs tracking-widest uppercase">Analyse Positive Residual & Opta en cours</p>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-8 pb-32">
      {/* ACTION BAR */}
      <div className="flex justify-end mb-4 gap-3">
        <button 
          onClick={onRefresh}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-all text-xs font-bold uppercase tracking-wider text-red-400 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
           {loading ? 'Updating...' : '🔴 Live Update'}
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
      <motion.div 
        ref={contentRef}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="bg-[#050505] p-4 md:p-8 rounded-[3rem] border border-white/5 shadow-2xl relative"
      >
        
        {loading && (
             <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm rounded-[3rem] flex items-center justify-center">
                 <div className="flex flex-col items-center">
                     <span className="text-emerald-500 text-xs uppercase tracking-widest animate-pulse">Mise à jour Live...</span>
                 </div>
             </div>
        )}

        {/* HERO HEADER */}
        <motion.div variants={itemVariants} className="text-center mb-10">
          <div className="flex justify-center items-center gap-2 mb-4">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] uppercase tracking-widest text-white/60">
                <span>{match.league}</span>
                <span className="w-1 h-1 bg-white/30 rounded-full"></span>
                <span>{match.date}</span>
             </div>
             {analysis.tvChannel && (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-blue-500/10 text-[10px] uppercase tracking-widest text-blue-300 border-blue-500/20">
                    <span>📺 {analysis.tvChannel}</span>
                </div>
            )}
          </div>
          
          <h2 className="text-4xl md:text-6xl font-display font-bold text-white tracking-tighter mb-2">
              {match.homeTeam} <span className="text-white/20 mx-2 font-thin">vs</span> {match.awayTeam}
          </h2>

          {/* LIVE SCOREBOARD */}
          {(analysis.liveScore || match.status === 'live') && (
              <div className="mt-6 flex flex-col items-center">
                  <div className="relative px-8 py-4 bg-[#1a1a1a] border border-white/10 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(239,68,68,0.15)]">
                      
                      {/* Live Indicator Background */}
                      {match.status === 'live' && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/5 to-transparent animate-pulse"></div>
                      )}

                      <div className="flex flex-col items-center relative z-10">
                          <span className="text-5xl md:text-6xl font-mono font-bold text-white tracking-widest leading-none">
                              {analysis.liveScore || "0-0"}
                          </span>
                          
                          {analysis.matchMinute ? (
                              <div className="flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/20">
                                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                  <span className="text-xs font-bold text-red-400 font-mono">{analysis.matchMinute}</span>
                              </div>
                          ) : match.status === 'live' ? (
                              <div className="flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/20">
                                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                  <span className="text-xs font-bold text-red-400 font-mono">LIVE</span>
                              </div>
                          ) : (
                             <span className="text-[10px] text-white/30 mt-2 font-mono uppercase">Score Pré-match</span>
                          )}
                      </div>
                  </div>
              </div>
          )}
        </motion.div>

        {/* BENTO GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 md:gap-6">
          
          <motion.div variants={itemVariants} className="lg:col-span-4 lg:row-span-2">
            <PredictionCard analysis={analysis} />
          </motion.div>

          {/* SIDE: MONTE CARLO & LIVE SCRIPT */}
          <motion.div variants={itemVariants} className="lg:col-span-2 flex flex-col gap-4">
              <MonteCarloChart monteCarlo={analysis.monteCarlo} />
              <LiveStrategyCard strategy={analysis.liveStrategy} />
          </motion.div>

          <motion.div variants={itemVariants} className="lg:col-span-6">
             <ScenarioList scenarios={analysis.scenarios} />
          </motion.div>
          
          <motion.div variants={itemVariants} className="lg:col-span-4">
            <AdvancedStats stats={analysis.advancedStats} />
          </motion.div>

           {/* INFO BLOCK (Injuries, Ref, Weather) */}
           <motion.div variants={itemVariants} className="lg:col-span-2 bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 md:p-8">
              <h3 className="text-white/30 text-[10px] uppercase font-bold tracking-widest mb-4">Rapport Miner</h3>
              <div className="space-y-4">
                  <div>
                      <h4 className="text-[10px] text-white/40 uppercase mb-1">Blessures / Absences</h4>
                      <ul className="space-y-2">
                          {Array.isArray(analysis.injuries) && analysis.injuries.length > 0 ? (
                              analysis.injuries.map((inj: any, i) => (
                                  <li key={i} className="text-xs text-white/70 flex items-center gap-2 bg-white/5 p-2 rounded-lg border border-white/5">
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
              </div>
          </motion.div>

          {/* SUMMARY - TERMINAL STYLE */}
          <motion.div variants={itemVariants} className="lg:col-span-6 bg-[#121212] border border-white/5 rounded-[2rem] p-6 md:p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-blue-500 opacity-20"></div>
              <h3 className="text-emerald-400 text-[10px] uppercase font-bold tracking-widest mb-4 font-mono">
                  > SYSTEM_OUTPUT_SUMMARY
              </h3>
              <div className="prose prose-invert prose-sm max-w-none text-white/80 leading-relaxed font-mono">
                  {/* Utilisation du Typewriter au lieu de ReactMarkdown pour l'effet Terminal */}
                  {/* On clean le markdown basique pour l'affichage brut style terminal */}
                  <Typewriter 
                    text={analysis.summary.replace(/\*\*/g, '').replace(/###/g, '> ')} 
                    speed={10} 
                  />
              </div>
          </motion.div>

        </div>
      </motion.div>
    </div>
  );
};