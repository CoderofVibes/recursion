// R61: the Cathedral in the production build, as a judge meets it. Fresh browser,
// ?encounter=chain-link, ENTER, FLIGHT, THREAD at 1x; then the Black Box channel's panel is read
// every 15 s for the model's own account (features supported, strands drawn). Passes when FLIGHT
// draws supported strands by T+3:00 (the lattice kills a coasting ship at about T+4:30).
//
//   npm run build
//   npx vite preview --port 4311 --strictPort
//   node docs/handoffs/2C/cathedral-check.mjs [http://localhost:4311]
//
// Drives NIGHT's headless Chrome (docs/handoffs/night/judge-run/do.mjs) with real keys and
// clicks; its own browser profile (JUDGE=cathedral-check unless set). Prints the timeline.
import { execFileSync } from 'node:child_process';

const URL = `${process.argv[2] ?? 'http://localhost:4311'}/?encounter=chain-link`;
const DRIVER = 'docs/handoffs/night/judge-run/do.mjs';
const env = { ...process.env, JUDGE: process.env.JUDGE ?? 'cathedral-check' };
const BY = 180; // ship time, s

/** Run driver steps; each step is an array of words. Returns the driver's last output line. */
function drive(...steps) {
  const args = steps.flatMap((s, i) => (i === 0 ? s : ['::', ...s]));
  const out = execFileSync(process.execPath, [DRIVER, ...args], {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.trim().split('\n').at(-1) ?? '';
}

const READ = `(() => {
  const t = document.body.innerText;
  const clock = t.match(/T\\+(\\d\\d):(\\d\\d):(\\d\\d)/);
  const fitted = t.match(/(\\d+) OF (\\d+) FITTED FEATURES SUPPORTED/);
  const strands = t.match(/SUPPORTED FRAGMENTS\\s*\\n?\\s*\\D?(\\d+)/);
  const frames = t.match(/(\\d+) RETAINED FRAMES/);
  return {
    t: clock ? 3600 * +clock[1] + 60 * +clock[2] + +clock[3] : null,
    supported: fitted ? +fitted[1] : null,
    fitted: fitted ? +fitted[2] : null,
    strands: strands ? +strands[1] : null,
    frames: frames ? +frames[1] : null,
  };
})()`;

let passed = false;
try {
  drive(['stop']);
} catch {
  // Not running.
}
try {
  console.log(drive(['start']));
  drive(
    ['open', URL],
    ['wait', '9000'],
    ['key', '3'],
    ['wait', '1000'],
    ['click', 'text=ENTER UNSEEN CATHEDRAL'],
    ['wait', '2000'],
    ['key', 'Escape'],
    ['wait', '500'],
    ['key', '4'],
    ['wait', '1500'],
    ['click', 'text=Thread · 1,000 W'],
    ['wait', '1000'],
  );
  for (let i = 0; i < 20; i++) {
    const r = JSON.parse(drive(['wait', '15000'], ['js', READ]));
    console.log(
      `T+${r.t ?? '?'} s  frames ${r.frames ?? '?'}  supported ${r.supported ?? '?'} of ${r.fitted ?? '?'}  strands ${r.strands ?? '?'}`,
    );
    if ((r.strands ?? 0) > 0 && (r.supported ?? 0) > 0) {
      passed = (r.t ?? Infinity) <= BY;
      break;
    }
    if ((r.t ?? 0) > BY) break;
  }
} finally {
  try {
    drive(['stop']);
  } catch {
    // Already closed.
  }
}
console.log(
  passed
    ? `PASS: supported strands in FLIGHT by T+${BY} s`
    : `FAIL: no supported strands by T+${BY} s`,
);
process.exitCode = passed ? 0 : 1;
