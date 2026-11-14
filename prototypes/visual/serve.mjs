// Zero-dependency static server for the prototypes.
// Usage: node prototypes/visual/serve.mjs [port]   (default 5180)
//   http://localhost:5180/        the Night Watch visual prototype (prototypes/visual/)
//   http://localhost:5180/room/   the compartment and screen-composition mock-up (prototypes/room/)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here); // prototypes/
const folders = new Set(['visual', 'room']);
const port = Number(process.argv[2] ?? process.env.PORT ?? 5180);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // A folder URL without its trailing slash would break relative imports.
    if (folders.has(url.pathname.slice(1))) {
      res.writeHead(302, { location: `${url.pathname}/${url.search}` });
      res.end();
      return;
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (path === '' || path.endsWith('/') || path.endsWith('\\')) path = join(path, 'index.html');
    // Paths that do not name a prototype folder belong to the visual prototype.
    if (!folders.has(path.split(sep)[0])) path = join('visual', path);
    const file = join(root, path);
    if (!file.startsWith(root)) throw new Error('outside root');
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`prototypes: http://localhost:${port}/  and  http://localhost:${port}/room/`);
});
