import React from 'react';

export const PlayerAvatar = ({ name }: { name: string }) => {
    if (!name) return <div className="w-6 h-6 rounded-full bg-white/10" />;
    // Generate initials
    const initials = name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
    return (
        <div className="w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[9px] font-bold text-white/70">
            {initials}
        </div>
    );
};