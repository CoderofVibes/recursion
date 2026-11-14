import { useState } from 'react';
import { Bench } from './bench/Bench.tsx';
import { createGame } from './game.ts';

/**
 * App shell (2F). It owns the running game and hands its belief-side controls to the screen.
 * Until the console (2D) and 3D view (2E) merge, the screen is the integration bench.
 */
export function App() {
  const [game] = useState(createGame);
  return <Bench game={game} />;
}
