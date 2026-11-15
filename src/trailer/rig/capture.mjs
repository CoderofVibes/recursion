/* global process, console, fetch, WebSocket */
// TV's capture helper. Uses an already-running NIGHT Chrome; installs no software.
// node src/trailer/rig/capture.mjs PORT EXPRESSION_FILE [OUTPUT_JSON]
import { readFileSync, writeFileSync } from 'node:fs';

const [port, source, output] = process.argv.slice(2);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const tab = tabs.find((entry) => entry.type === 'page');
if (!tab) throw new Error('No capture tab');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let next = 0;
const pending = new Map();
ws.addEventListener('message', ({ data }) => {
  const event = JSON.parse(data);
  const task = pending.get(event.id);
  if (!task) return;
  pending.delete(event.id);
  if (event.error) task.reject(new Error(JSON.stringify(event.error)));
  else task.resolve(event.result);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
try {
  const result = await send('Runtime.evaluate', {
    expression: readFileSync(source, 'utf8'),
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  if (output) {
    writeFileSync(output, `${JSON.stringify(result.result.value)}\n`);
    console.log(`Saved ${output}`);
  } else console.log(JSON.stringify(result.result.value, null, 2));
} finally {
  ws.close();
}
