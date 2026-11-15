import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme } from '../../theme/index.ts';
import { createGame } from '../game.ts';
import { OpeningGate } from './OpeningGate.tsx';
import '../app.css';

// A dev-only stage for OP and the UI lane while the app shell integration is being relayed.
const root = document.getElementById('root');
if (import.meta.env.DEV && root) {
  const query = new URLSearchParams(location.search);
  applyTheme(document.documentElement);
  void createGame().then(({ controls, modelError, erase }) => {
    createRoot(root).render(
      <StrictMode>
        <OpeningGate
          game={controls}
          modelError={modelError}
          erase={erase}
          saveSlot={`recursion-opening-preview:${controls.briefing.id}`}
          hasProgress={controls.status().attemptIndex > 1}
          replay={query.get('opening') === 'replay'}
        />
      </StrictMode>,
    );
  });
}
