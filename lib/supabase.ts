import { createClient } from '@supabase/supabase-js';

// SAFE ACCESS TO ENV VARIABLES
// On vérifie que 'env' existe sur import.meta pour éviter le crash "Cannot read properties of undefined"
const env = (import.meta as any).env || {};
const SUPABASE_URL = env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_PUBLIC_SUPABASE_ANON_KEY;

// Création conditionnelle du client
// Si les clés manquent, on renvoie null pour que l'app bascule en mode Offline sans crasher
export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false, // CRUCIAL: Désactive le stockage de session (Cookies/Local) pour éviter les erreurs "Failed to fetch"
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: { 'x-application-name': 'betmind-ai' }
      }
    })
  : null;

// --- CIRCUIT BREAKER ---
// Si Supabase échoue (réseau, adblock, erreur config), on le marque "Offline"
// et on arrête d'essayer de le contacter pour éviter les timeouts.
let isOffline = false;

export const markSupabaseOffline = () => {
  if (!isOffline) {
    console.warn("🔌 Supabase marqué comme HORS LIGNE. Passage en mode 100% LocalStorage.");
    isOffline = true;
  }
};

export const isSupabaseConfigured = () => {
  // On vérifie que les clés sont là ET que le réseau n'a pas planté
  return !isOffline && !!supabase; 
};