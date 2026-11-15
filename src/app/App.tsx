import { useEffect, useState } from 'react';
import { applyTheme } from '../theme/index.ts';
import { ControlRoom } from './ControlRoom.tsx';
import { createGame, type Game } from './game.ts';

/**
 * App shell. It owns the running game and hands its belief-side controls to the one screen
 * there is: the control room (DECISIONS A8).
 */
export function App() {
  const [game, setGame] = useState<Game>();

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

  if (!game) return <main className="app-wait">RECURSION</main>;
  return <ControlRoom game={game.controls} modelError={game.modelError} erase={game.erase} />;
}
