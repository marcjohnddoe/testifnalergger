import { createClient } from '@supabase/supabase-js';

// Grâce à la config Vite mise à jour, process.env fonctionne maintenant dans le navigateur
// pour les clés définies dans le fichier vite.config.ts
const getEnv = (key: string) => {
  // Supporte import.meta.env (Standard Vite) OU process.env (Polyfill)
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
    return (import.meta as any).env[key];
  }
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