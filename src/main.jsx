import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from './lib/queryClient';
// Self-hosted variable fonts: same files on every browser, allowed by the CSP (font-src 'self').
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/inter-tight/wght.css';
// Catch the browser's install offer before anything else loads (it fires once, early).
import './lib/installPrompt';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {/* Last session's data paints at once from IndexedDB, then refreshes (lib/queryClient.js). */}
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <App />
      </PersistQueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);
