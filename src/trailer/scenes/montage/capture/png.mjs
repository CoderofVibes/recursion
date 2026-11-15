/* global process, console, fetch, URLSearchParams */
// node src/trailer/scenes/montage/capture/png.mjs OUT_DIR NAME
// One lossless screenshot of the page hold.mjs is holding (1920 x 1080), as OUT_DIR/NAME.png.
// hold.mjs takes it, because only its connection sees the page at 1.25.
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [dir, name] = process.argv.slice(2);
const state = join(tmpdir(), 'recursion-judge-run', 'chrome-state-m-shots.json');
const { port } = JSON.parse(readFileSync(state, 'utf8'));
const query = new URLSearchParams({ dir: resolve(dir), name });
console.log(`  ${(await (await fetch(`http://127.0.0.1:${port}/png?${query}`)).text()).trim()}`);
