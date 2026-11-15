// Scrub diagnostic JSON before writing; local paths are not study evidence.
import { writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[\\/]+$/, '');
const repository = workspace.replace(/[\\/]\.worktrees[\\/][^\\/]+$/, '');
const homes = [process.env.USERPROFILE, process.env.HOME].filter(Boolean);
const account = process.env.USERNAME;
export function scrub(value) {
  if (typeof value === 'string') {
    for (const [path, replacement] of [[workspace, '<workspace>'], [repository, '<repository>'], ...homes.map((p) => [p, '<user-home>'])]) {
      for (const form of new Set([path, path.replaceAll('\\', '/'), path.replaceAll('/', '\\')]))
        value = value.replaceAll(form, replacement);
    }
    value = value.replace(/[A-Za-z]:[\\/]Users[\\/][^\\/\s"<>]+/gi, '<user-home>');
    if (account) value = value.replace(new RegExp(`\\b${account.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '<local-account>');
    return value;
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [scrub(k), scrub(v)]));
  return value;
}

export function writeEvidence(path, data) {
  if (path.endsWith('.json') || path.endsWith('.json.gz') || path.endsWith('.cpuprofile.gz') || path.endsWith('.map.gz')) {
    const compressed = path.endsWith('.gz');
    const parsed = JSON.parse((compressed ? gunzipSync(data) : data).toString());
    const safe = JSON.stringify(scrub(parsed), null, compressed ? undefined : 2) + '\n';
    writeFileSync(path, compressed ? gzipSync(safe) : safe);
  } else writeFileSync(path, data);
}
