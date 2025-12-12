import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Charge les variables d'environnement depuis .env selon le mode (development/production)
  // le troisième paramètre '' permet de charger TOUTES les variables, pas seulement celles commençant par VITE_
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // On rend les variables accessibles via process.env comme dans une app Node
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.VITE_PUBLIC_SUPABASE_URL': JSON.stringify(env.VITE_PUBLIC_SUPABASE_URL),
      'process.env.VITE_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_PUBLIC_SUPABASE_ANON_KEY),
      // Fallback de sécurité pour éviter le crash si process.env est accédé autrement
      'process.env': {}
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});