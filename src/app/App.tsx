import { KNOWN_EXTENSIONS } from '../contracts/index.ts';

/**
 * Placeholder screen (1A). Replaced by the console shell (2D) and game loop (2F).
 * Visual direction comes from 1E; nothing here is a design decision.
 */
export function App() {
  const rows: [string, string][] = [
    ['Build', __APP_VERSION__],
    ['Model', 'v0 · Newtonian'],
    ['Extensions', `${KNOWN_EXTENSIONS.length} available · 0 enabled`],
    ['Black Box', 'no records'],
    ['Systems', 'awaiting integration'],
  ];
  return (
    <main className="placeholder">
      <h1>RECURSION</h1>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
