// Evaluate a JS file in the judge-run Chrome (JUDGE env picks the instance) and save the result.
//   node dump.mjs <expr-file> [out-file]
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HERE = join(tmpdir(), 'recursion-judge-run');
const STATE = join(HERE, `chrome-state${process.env.JUDGE ? `-${process.env.JUDGE}` : ''}.json`);
const { port } = JSON.parse(readFileSync(STATE, 'utf8'));
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = list.find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((yes, no) => {
  ws.addEventListener('open', yes, { once: true });
  ws.addEventListener('error', no, { once: true });
});
const expression = readFileSync(process.argv[2], 'utf8');
const result = await new Promise((yes, no) => {
  ws.addEventListener('message', ({ data }) => {
    const m = JSON.parse(data);
    if (m.id !== 1) return;
    if (m.error) no(new Error(m.error.message));
    else yes(m.result);
  });
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }),
  );
});
ws.close();
if (result.exceptionDetails) {
  console.log('! ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text));
  process.exit(1);
}
const value = result.result.value;
if (process.argv[3]) {
  writeFileSync(process.argv[3], typeof value === 'string' ? value : JSON.stringify(value));
  console.log(`  dumped ${process.argv[3]} (${String(typeof value === 'string' ? value.length : JSON.stringify(value).length)} chars)`);
} else console.log(typeof value === 'string' ? value : JSON.stringify(value));
process.exit(0);
