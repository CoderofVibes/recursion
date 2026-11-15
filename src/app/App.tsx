import { useEffect, useState } from 'react';
import { REGIONS } from '../console/regions.tsx';
import { applyTheme } from '../theme/index.ts';
import { ControlRoom } from './ControlRoom.tsx';
import { createGame, type Game } from './game.ts';
import { appOpening, BROWSER_SLOT, openingLaunch } from './opening/launch.ts';
import { OpeningGate } from './opening/OpeningGate.tsx';

/**
 * App shell. It owns the running game and hands its belief-side controls to the one screen
 * there is: the control room (DECISIONS A8). The first time a browser opens the game, the opening
 * (A21) plays ahead of the room and wakes into the region the expedition starts in (A25, R41).
 */
export function App() {
  const [game, setGame] = useState<Game>();
  // Before a first opening the wait is plain black, so the title first appears in the dark.
  const [quiet] = useState(() => openingLaunch(BROWSER_SLOT, false, false) === 'first');

  useEffect(() => {
    applyTheme(document.documentElement);
    let cancelled = false;
    void createGame().then((created) => {
      if (!cancelled) setGame(created);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!game)
    return (
      <main className="app-wait" aria-busy="true" aria-label="Recursion is loading">
        {quiet ? null : 'RECURSION'}
      </main>
    );
  const room = { game: game.controls, modelError: game.modelError, erase: game.erase };
  const opening = appOpening(game.controls.briefing.id, REGIONS[0]!.id, location.search);
  return opening ? <OpeningGate {...room} {...opening} /> : <ControlRoom {...room} />;
}
