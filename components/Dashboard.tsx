import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDailyMatches, analyzeMatchDeeply } from '../services/geminiService';
import { Match, MatchAnalysis, SportType, TicketItem } from '../types';
import { MatchCard } from './MatchCard';
import { AnalysisView } from './AnalysisView';
import { TicketSlip } from './TicketSlip';

type TabType = 'All' | SportType | 'Trending' | 'Safe' | 'HighOdds' | 'Value';

// Helper local pour filtrer instantanément les vieux matchs
const isMatchExpiredLocal = (dateStr?: string, timeStr?: string) => {
    if (!dateStr || !timeStr) return false;
    const now = new Date();
    // Gestion robuste des formats de date (DD/MM ou YYYY-MM-DD)
    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    
    if (!day || !month) return false; // Si date illisible, on affiche par sécurité

    const cleanTime = timeStr.replace('h', ':');
    const [hour, minute] = cleanTime.split(':').map(Number);
    
    const matchDate = new Date();
    matchDate.setMonth(month - 1);
    matchDate.setDate(day);
    matchDate.setHours(hour || 0, minute || 0, 0, 0);

    // Gestion du changement d'année (Décembre -> Janvier)
    if (month === 1 && now.getMonth() === 11) matchDate.setFullYear(now.getFullYear() + 1);
    if (month === 12 && now.getMonth() === 0) matchDate.setFullYear(now.getFullYear() - 1);

    // FIX : Buffer augmenté à 4h (240 min) pour ne jamais cacher un match NBA en cours
    const expiryTime = new Date(matchDate.getTime() + (240 * 60 * 1000));
    return now > expiryTime;
};

export const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<TabType>('All');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  
  // TICKET STATE
  const [ticketItems, setTicketItems] = useState<TicketItem[]>([]);

  const addToTicket = (item: TicketItem) => {
      // Eviter doublons
      if (!ticketItems.find(i => i.id === item.id)) {
          setTicketItems(prev => [...prev, item]);
      }
  };

  const removeFromTicket = (id: string) => {
      setTicketItems(prev => prev.filter(i => i.id !== id));
  };
  
  const { data: matches = [], isLoading: loadingMatches, refetch: refetchMatches, isRefetching } = useQuery({
    queryKey: ['matches', activeTab === SportType.FOOTBALL || activeTab === SportType.BASKETBALL ? activeTab : 'All'],
    queryFn: () => fetchDailyMatches(activeTab === SportType.FOOTBALL || activeTab === SportType.BASKETBALL ? activeTab : 'All'),
    enabled: !selectedMatch, 
    refetchInterval: 1000 * 120,
    refetchOnWindowFocus: false,
  });

  const { 
    data: analysis = null, 
    isLoading: loadingAnalysis, 
    isError, 
    error,
    refetch: refetchAnalysis 
  } = useQuery({
    queryKey: ['analysis', selectedMatch?.id],
    queryFn: () => selectedMatch ? analyzeMatchDeeply(selectedMatch) : Promise.reject('No match'),
    enabled: !!selectedMatch,
    staleTime: 1000 * 60 * 60,
    retry: false,
  });

  const handleMatchSelect = (match: Match) => {
    setSelectedMatch(match);
    document.body.style.overflow = 'hidden';
  };

  const closeAnalysis = () => {
      setSelectedMatch(null);
      document.body.style.overflow = 'auto';
  };

  const tabs: {id: TabType, label: string}[] = [
    { id: 'All', label: 'Vue d\'ensemble' },
    { id: 'Trending', label: '🔥 Top Affiches' },
    { id: 'Safe', label: '💎 Les Sûrs' },
    { id: 'Value', label: '🧠 Value Bets' },
    { id: 'HighOdds', label: '🚀 Cotes Élevées' },
    { id: SportType.FOOTBALL, label: '⚽ Football' },
    { id: SportType.BASKETBALL, label: '🏀 NBA' },
  ];

  const filteredMatches = useMemo(() => {
      const freshMatches = matches.filter(m => !isMatchExpiredLocal(m.date, m.time));
      return freshMatches.filter(m => {
          if (activeTab === 'Trending') return m.isTrending;
          if (activeTab === 'Safe') return (m.quickConfidence || 0) > 70;
          if (activeTab === 'HighOdds') return (m.quickOdds || 0) >= 2.50;
          if (activeTab === 'Value') {
              const prob = (m.quickConfidence || 50) / 100;
              const valueScore = prob * (m.quickOdds || 0);
              return valueScore > 1.1;
          }
          if (activeTab === SportType.FOOTBALL) return m.sport === SportType.FOOTBALL;
          if (activeTab === SportType.BASKETBALL) return m.sport === SportType.BASKETBALL;
          return true;
      });
  }, [matches, activeTab]);

  return (
    <div className="min-h-screen w-full bg-[#050505] relative pb-20"> {/* Padding bottom for ticket */}
      <div className="fixed top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none"></div>
      
      {/* HEADER */}
      <header className="sticky top-0 z-30 w-full backdrop-blur-xl border-b border-white/5 bg-[#050505]/80">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white to-gray-400 text-black flex items-center justify-center font-bold text-xl shadow-[0_0_20px_rgba(255,255,255,0.15)]">B</div>
                <div>
                    <h1 className="text-lg font-bold tracking-tight text-white leading-none">BetMind <span className="text-white/40 font-normal">AI</span></h1>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium">Hedge Fund Edition</p>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                    {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 border ${activeTab === tab.id ? 'bg-white text-black border-white' : 'bg-white/5 text-white/60 border-transparent hover:bg-white/10'}`}
                    >
                        {tab.label}
                    </button>
                    ))}
                    
                    <button 
                        onClick={() => refetchMatches()}
                        disabled={isRefetching || loadingMatches}
                        className={`hidden md:flex w-9 h-9 ml-2 rounded-full items-center justify-center bg-white/5 hover:bg-white/10 border border-white/5 transition-all ${isRefetching ? 'text-green-400 bg-green-900/20' : 'text-white/40'}`}
                    >
                        <svg className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        {loadingMatches && matches.length === 0 ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                 {[1,2,3,4].map(i => <div key={i} className="h-48 rounded-3xl bg-white/5 animate-pulse border border-white/5"></div>)}
             </div>
        ) : filteredMatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-4xl mb-4 opacity-30">🔍</div>
                <h3 className="text-white text-lg font-medium">Aucun match trouvé</h3>
                <p className="text-white/40 text-sm mb-4">
                    {matches.length > 0 ? "Les matchs sont terminés ou filtrés." : "Essayez d'actualiser."}
                </p>
                <button onClick={() => refetchMatches()} className="px-6 py-2 bg-blue-600 rounded-full text-sm font-bold text-white hover:bg-blue-500 transition-colors">
                    Forcer l'Actualisation
                </button>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {filteredMatches.map(match => (
                    <MatchCard key={match.id} match={match} onClick={() => handleMatchSelect(match)} />
                ))}
            </div>
        )}
      </main>

      {/* OVERLAY */}
      {selectedMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 lg:p-8">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeAnalysis}></div>
            <div className="relative w-full h-full md:h-[90vh] lg:max-w-5xl bg-[#080808] md:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-white/10 animate-[slideUp_0.3s_ease-out]">
                <div className="flex justify-between items-center p-4 border-b border-white/5 bg-[#080808]/50 backdrop-blur-md z-20">
                    <button onClick={closeAnalysis} className="flex items-center gap-2 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full text-sm">← Retour</button>
                    <div className="text-xs font-bold text-white/30 uppercase tracking-widest">BetMind Analyst</div>
                </div>
                <div className="flex-1 overflow-y-auto pt-6 no-scrollbar">
                    <AnalysisView 
                        match={selectedMatch} 
                        analysis={analysis} 
                        loading={loadingAnalysis} 
                        error={isError ? (error as Error) : null}
                        onClose={closeAnalysis}
                        onRefresh={() => refetchAnalysis()} 
                        onAddToTicket={addToTicket}
                    />
                </div>
            </div>
        </div>
      )}

      {/* TICKET SLIP (Floating) */}
      <TicketSlip items={ticketItems} onRemove={removeFromTicket} />
    </div>
  );
};