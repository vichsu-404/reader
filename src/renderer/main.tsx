import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './index.css';

// Dev-only test seam; the whole branch is eliminated from production builds.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('e2e')) {
  const { installE2EHarness } = await import('./e2e-harness');
  await installE2EHarness();
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root not found');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
