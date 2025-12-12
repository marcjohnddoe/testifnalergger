import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './components/Dashboard';

// Création du client React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 15, // Les données sont fraîches pendant 15 minutes
      gcTime: 1000 * 60 * 60 * 24, // Garder en cache 24h (Garbage Collection)
      refetchOnWindowFocus: false, // Évite de recharger quand on change d'onglet
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}