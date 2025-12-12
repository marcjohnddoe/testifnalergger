import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './components/Dashboard';

// Création du client React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // Les données sont fraîches pendant 30 secondes (Mode Live)
      gcTime: 1000 * 60 * 60 * 24, // Garder en cache 24h (Garbage Collection)
      refetchOnWindowFocus: true, // Recharger quand on change d'onglet et qu'on revient
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