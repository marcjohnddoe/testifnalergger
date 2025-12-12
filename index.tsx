import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// --- KILL SWITCH SERVICE WORKER ---
// Nettoyage sécurisé des anciens Service Workers
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        console.log('Service Worker nettoyé :', registration);
        registration.unregister();
      }
    }).catch(function(err) {
      console.log('Service Worker cleanup error (non-blocking): ', err);
    });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);