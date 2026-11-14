import { useEffect, useState } from 'react';
import { Bench } from './bench/Bench.tsx';
import { createGame, type Game } from './game.ts';

/**
 * App shell (2F). It owns the running game and hands its belief-side controls to the screen.
 * Until the console (2D) and 3D view (2E) merge, the screen is the integration bench.
 */
export function App() {
  const [game, setGame] = useState<Game>();

  useEffect(() => {
    let cancelled = false;
    void createGame().then((created) => {
      if (!cancelled) setGame(created);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!game) return <main className="bench-wait">RECURSION</main>;
  return <Bench game={game.controls} modelError={game.modelError} erase={game.erase} />;
}
