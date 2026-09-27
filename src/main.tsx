import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppController } from './core/controller';
import { App } from './ui/App';
import './ui/styles.css';

/**
 * Browser entry point — no backend, no server state.
 * The Electron build reuses this exact renderer (see electron/main.cjs).
 */
const controller = createAppController();

if (typeof window !== 'undefined' && window.__shotComposer?.window) {
  window.__shotComposer.window.setTitle('Shot Composer');
}

// Dev affordance: expose the controller for automated checks and manual debugging.
if (import.meta.env.DEV) {
  (window as unknown as { __controller?: typeof controller }).__controller = controller;
}

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing');

createRoot(container).render(
  <StrictMode>
    <App controller={controller} />
  </StrictMode>,
);
