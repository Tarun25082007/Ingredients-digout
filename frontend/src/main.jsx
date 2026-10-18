import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import ErrorBoundary from './ErrorBoundary.jsx';
import { initDevToolsProtection } from './utils/devToolsGuard.js';

import { registerSW } from 'virtual:pwa-register';

// Clean up any stale legacy dev service workers
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      if (registration.active && registration.active.scriptURL.includes('dev-sw.js')) {
        registration.unregister();
      }
    }
  });
}

// Auto-activate and update service worker immediately
registerSW({ immediate: true });

// Initialize DevTools security protection for non-host machines
initDevToolsProtection();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
