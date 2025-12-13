import { createClient } from '@supabase/supabase-js';

// Fonction qui cherche les variables partout (Cloud Run > Build > Local)
const getEnv = (key: string) => {
  // 1. Priorité : Injection Cloud Run (Runtime) via server.js
  if (typeof window !== 'undefined' && (window as any).__ENV__ && (window as any).__ENV__[key]) {
    return (window as any).__ENV__[key];
  }
  
  // 2. Fallback : Vite Build (Local / Dev)
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
    return (import.meta as any).env[key];
  }

  // 3. Fallback : Process (Node)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
};

const SUPABASE_URL = getEnv('VITE_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnv('VITE_PUBLIC_SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("⚠️ Configuration Supabase manquante.");
}

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        headers: { 'x-application-name': 'betmind-ai' }
      }
    })
  : null;

let isOffline = false;

export const markSupabaseOffline = () => {
  if (!isOffline) {
    console.warn("🔌 Mode Hors Ligne activé pour Supabase.");
    isOffline = true;
  }
};

export const isSupabaseConfigured = () => {
  return !isOffline && !!supabase; 
};