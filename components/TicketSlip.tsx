import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { TicketItem } from '../types';

interface TicketSlipProps {
    items: TicketItem[];
    onRemove: (id: string) => void;
}

export const TicketSlip: React.FC<TicketSlipProps> = ({ items, onRemove }) => {
    const ticketRef = useRef<HTMLDivElement>(null);
    const [isSharing, setIsSharing] = useState(false);

    if (items.length === 0) return null;

    const totalOdds = items.reduce((acc, item) => acc * item.odds, 1);
    
    // Calcul du gain potentiel pour 10€
    const potentialWin = (totalOdds * 10).toFixed(2);

    const handleShare = async () => {
        if (!ticketRef.current) return;
        setIsSharing(true);
        try {
            const canvas = await html2canvas(ticketRef.current, {
                backgroundColor: '#000000',
                scale: 2
            });
            const link = document.createElement('a');
            link.download = `BetMind-Ticket-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSharing(false);
        }
    };

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center animate-[slideUp_0.3s_ease-out]">
            <div 
                ref={ticketRef}
                className="w-full max-w-md bg-[#121212] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
                {/* Header Strip */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 h-1.5 w-full"></div>
                
                <div className="p-4">
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                             <div className="w-6 h-6 rounded bg-white text-black flex items-center justify-center font-bold text-xs">B</div>
                             <span className="font-bold text-white text-sm">Mon Ticket</span>
                             <span className="bg-white/10 text-white/50 text-[10px] px-2 py-0.5 rounded-full">{items.length} paris</span>
                        </div>
                        <button 
                            onClick={handleShare}
                            className="text-[10px] text-white/50 hover:text-white flex items-center gap-1 bg-white/5 px-2 py-1 rounded"
                        >
                            {isSharing ? '📸...' : '📤 Partager'}
                        </button>
                    </div>

                    <div className="space-y-2 max-h-[150px] overflow-y-auto no-scrollbar mb-3">
                        {items.map((item) => (
                            <div key={item.id} className="flex justify-between items-center bg-white/5 p-2 rounded-lg group">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-white/50 uppercase">{item.match}</span>
                                    <span className="text-xs font-bold text-white">{item.selection}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-blue-400 font-bold">@{item.odds.toFixed(2)}</span>
                                    <button 
                                        onClick={() => onRemove(item.id)}
                                        className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-3 border-t border-white/10 flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-white/40 uppercase">Cote Totale</span>
                            <span className="text-2xl font-bold font-mono text-white">{totalOdds.toFixed(2)}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] text-white/40 uppercase block">Gain pour 10€</span>
                            <span className="text-xl font-bold font-mono text-emerald-400">{potentialWin}€</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};