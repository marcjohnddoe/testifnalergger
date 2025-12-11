
import React, { useState } from 'react';
import { authService } from '../services/authService';

export const LandingPage = ({ onLogin }: { onLogin: (user: any) => void }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const user = await authService.loginWithGoogle();
      onLogin(user);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-orange-500/30 overflow-x-hidden">
      
      {/* Background FX */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[30vw] h-[30vw] bg-orange-500/5 rounded-full blur-[100px]"></div>
      </div>

      {/* Nav */}
      <nav className="relative z-20 max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white to-gray-400 text-black flex items-center justify-center font-bold text-lg">B</div>
           <span className="font-bold text-xl tracking-tight">BetMind AI</span>
        </div>
        <button 
          onClick={handleGoogleLogin}
          className="text-sm font-medium text-white/70 hover:text-white transition-colors"
        >
          Se connecter
        </button>
      </nav>

      {/* Hero Section */}
      <header className="relative z-10 pt-20 pb-32 px-6 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-orange-400 mb-8 animate-fade-in-up">
           <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
           Nouvelle Version BetMind AI Disponible
        </div>
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tighter mb-8 leading-[0.9]">
          Arrêtez de parier <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-orange-400">au hasard.</span>
        </h1>
        
        <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-12 leading-relaxed">
          L'intelligence artificielle la plus puissante au monde analyse chaque match, chaque blessure et chaque cote pour vous donner un avantage déloyal sur les bookmakers.
        </p>

        <div className="flex flex-col md:flex-row items-center justify-center gap-4">
          <button 
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="group relative flex items-center gap-3 bg-white text-black px-8 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform duration-200 shadow-[0_0_40px_rgba(255,255,255,0.3)] disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
               <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></span>
            ) : (
               <svg className="w-5 h-5" viewBox="0 0 24 24">
                 <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                 <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                 <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                 <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
               </svg>
            )}
            <span>Continuer avec Google</span>
          </button>
          <span className="text-white/30 text-sm">Accès gratuit immédiat</span>
        </div>
      </header>

      {/* Demo Grid Image (Mockup) */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 mb-32 group perspective-1000">
         <div className="relative bg-[#121212] border border-white/10 rounded-xl overflow-hidden shadow-2xl transform rotate-x-12 group-hover:rotate-x-0 transition-transform duration-700 ease-out">
            <div className="absolute top-0 left-0 w-full h-8 bg-[#1a1a1a] border-b border-white/5 flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/20"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/20"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/20"></div>
            </div>
            <div className="p-8 pt-12 grid grid-cols-1 md:grid-cols-3 gap-4 opacity-50 blur-[1px] group-hover:blur-0 group-hover:opacity-100 transition-all duration-500">
                <div className="h-32 bg-white/5 rounded-lg animate-pulse"></div>
                <div className="h-32 bg-white/5 rounded-lg animate-pulse delay-100"></div>
                <div className="h-32 bg-white/5 rounded-lg animate-pulse delay-200"></div>
                <div className="h-32 bg-white/5 rounded-lg animate-pulse delay-300"></div>
                <div className="h-32 bg-white/5 rounded-lg animate-pulse delay-100"></div>
                <div className="h-32 bg-white/5 rounded-lg animate-pulse delay-200"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
                 <button onClick={handleGoogleLogin} className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-6 py-3 rounded-full font-bold hover:bg-white/20 transition-all">
                    Voir les matchs du jour
                 </button>
            </div>
         </div>
      </div>

      {/* Features */}
      <section className="py-24 bg-white/[0.02] border-y border-white/5">
         <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="text-4xl mb-4">🧠</div>
                <h3 className="text-xl font-bold text-white mb-2">Analyse BetMind AI</h3>
                <p className="text-white/50">L'IA croise des millions de données (blessures, météo, stats avancées) en quelques secondes.</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="text-4xl mb-4">⚡</div>
                <h3 className="text-xl font-bold text-white mb-2">Temps Réel</h3>
                <p className="text-white/50">Connecté aux dernières infos Twitter, compo probables et cotes en direct des bookmakers.</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="text-4xl mb-4">💎</div>
                <h3 className="text-xl font-bold text-white mb-2">Value Bets</h3>
                <p className="text-white/50">Détecte les erreurs de cotation des bookmakers pour maximiser vos gains potentiels.</p>
            </div>
         </div>
      </section>

      {/* Pricing */}
      <section className="py-24 max-w-5xl mx-auto px-6">
        <h2 className="text-3xl md:text-5xl font-display font-bold text-center mb-16">Simple et Transparent</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {/* Free Plan */}
            <div className="p-8 rounded-3xl border border-white/10 bg-white/[0.02]">
                <h3 className="text-xl font-bold text-white/70">Découverte</h3>
                <div className="text-4xl font-bold text-white mt-4 mb-2">Gratuit</div>
                <p className="text-white/40 text-sm mb-8">Pour tester la puissance de l'IA.</p>
                <ul className="space-y-4 mb-8">
                    <li className="flex gap-3 text-white/70"><span className="text-green-500">✓</span> 5 Analyses par jour</li>
                    <li className="flex gap-3 text-white/70"><span className="text-green-500">✓</span> Cotes en direct</li>
                    <li className="flex gap-3 text-white/70"><span className="text-green-500">✓</span> Accès communautaire</li>
                </ul>
                <button onClick={handleGoogleLogin} className="w-full py-3 rounded-xl border border-white/20 hover:bg-white/5 text-white font-bold transition-all">
                    Créer un compte gratuit
                </button>
            </div>

            {/* Pro Plan */}
            <div className="relative p-8 rounded-3xl border border-orange-500/30 bg-gradient-to-b from-orange-500/10 to-transparent">
                <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-2xl uppercase tracking-widest">Populaire</div>
                <h3 className="text-xl font-bold text-orange-400">BetMind PRO</h3>
                <div className="text-4xl font-bold text-white mt-4 mb-2">19.99$ <span className="text-lg text-white/30 font-normal">/mois</span></div>
                <p className="text-white/40 text-sm mb-8">Pour les parieurs sérieux.</p>
                <ul className="space-y-4 mb-8">
                    <li className="flex gap-3 text-white"><span className="text-orange-400">✓</span> Analyses illimitées</li>
                    <li className="flex gap-3 text-white"><span className="text-orange-400">✓</span> Modèle BetMind Ultra (Plus rapide)</li>
                    <li className="flex gap-3 text-white"><span className="text-orange-400">✓</span> Détection "Value Bet" exclusive</li>
                    <li className="flex gap-3 text-white"><span className="text-orange-400">✓</span> Support prioritaire</li>
                </ul>
                <button onClick={handleGoogleLogin} className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-[0_0_20px_rgba(249,115,22,0.3)]">
                    Essayer le Pro
                </button>
            </div>
        </div>
      </section>
      
      <footer className="py-12 text-center text-white/20 text-sm border-t border-white/5">
        <p>&copy; 2025 BetMind AI. Tous droits réservés. Jouer comporte des risques : endettement, isolement, dépendance.</p>
      </footer>

      {/* CSS Animations */}
      <style>{`
        @keyframes fade-in-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
            animation: fade-in-up 0.8s ease-out forwards;
        }
      `}</style>
    </div>
  );
};
