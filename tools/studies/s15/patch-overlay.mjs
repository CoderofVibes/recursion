// Strict unified-diff reader for study-only, in-memory Vite/TypeScript overlays.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function patchOverlay(root, patchPath) {
  const lines = readFileSync(patchPath, 'utf8').replaceAll('\r\n', '\n').split('\n');
  const files = new Map();
  let file, source, output, cursor;
  const flush = () => { if (file) files.set(resolve(root, file).replaceAll('\\', '/'), [...output, ...source.slice(cursor)].join('\n')); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('+++ b/')) {
      flush(); file = line.slice(6);
      if (!file.startsWith('src/') || file.includes('..')) throw new Error('Overlay only supports src/ files');
      source = readFileSync(resolve(root, file), 'utf8').replaceAll('\r\n', '\n').split('\n');
      output = []; cursor = 0;
    } else if (line.startsWith('@@ ')) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!m) throw new Error('Bad patch hunk');
      const start = Number(m[1]) - 1;
      if (start < cursor) throw new Error('Overlapping patch hunks');
      output.push(...source.slice(cursor, start)); cursor = start;
      let removed = 0, added = 0;
      while (removed < Number(m[2] ?? 1) || added < Number(m[4] ?? 1)) {
        const body = lines[++i];
        if (!body || ![' ', '+', '-'].includes(body[0])) throw new Error('Incomplete patch');
        if (body[0] !== '+') {
          if (source[cursor] !== body.slice(1)) throw new Error(`Patch context mismatch: ${file}:${cursor + 1}`);
          cursor++; removed++;
        }
        if (body[0] !== '-') { output.push(body.slice(1)); added++; }
      }
    }
  }
  flush();
  if (!files.size) throw new Error('Empty patch');
  return { files, plugin: { name: 's15-proposed-patch', enforce: 'pre',
    load(id) { return files.get(id.split('?')[0].replaceAll('\\', '/')) ?? null; } } };
}
