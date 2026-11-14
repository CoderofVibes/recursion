/**
 * Proves the truth/belief lint boundary (DECISIONS P11) actually fires.
 */
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function violations(filePath: string, importPath: string): Promise<number> {
  const code = `import type { X } from '${importPath}';\nexport type Y = X;\n`;
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports').length;
}

describe('truth/belief boundary (P11)', () => {
  const beliefFiles = [
    'src/model/probe.ts',
    'src/blackbox/probe.ts',
    'src/console/panels/probe.tsx',
    'src/view3d/probe.ts',
    'src/theme/lab/probe.tsx',
  ];
  const forbidden = [
    '../sim/gravity.ts',
    '../../sim/index.ts',
    '../contracts/truth/index.ts',
    '../contracts/truth/world.ts',
    '../contracts/fixtures/truth.ts',
    '../contracts/fixtures/generate.ts',
  ];
  const allowed = ['../contracts/index.ts', '../contracts/fixtures/index.ts', '../lib/index.ts'];

  for (const file of beliefFiles) {
    it(`blocks truth imports in ${file}`, async () => {
      for (const path of forbidden) expect(await violations(file, path), path).toBe(1);
    });
    it(`allows shared imports in ${file}`, async () => {
      for (const path of allowed) expect(await violations(file, path), path).toBe(0);
    });
  }

  it('lets the game layer, simulation and ship systems use truth', async () => {
    expect(await violations('src/game/probe.ts', '../contracts/truth/index.ts')).toBe(0);
    expect(await violations('src/sim/probe.ts', '../contracts/truth/index.ts')).toBe(0);
    expect(await violations('src/ship/probe.ts', '../contracts/truth/index.ts')).toBe(0);
  });

  it('does not mistake similarly named modules for truth', async () => {
    expect(await violations('src/model/probe.ts', './simulate-forecast.ts')).toBe(0);
    expect(await violations('src/model/probe.ts', './truthiness.ts')).toBe(0);
  });
});
