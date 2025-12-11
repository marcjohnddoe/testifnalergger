import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// --- KILL SWITCH SERVICE WORKER ---
// Si un ancien Service Worker traîne (PWA), on le tue immédiatement pour éviter les erreurs de fetch.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      console.log('Service Worker trouvé et tué :', registration);
      registration.unregister();
    }
  }).catch(function(err) {
    console.log('Service Worker Unregistration failed: ', err);
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