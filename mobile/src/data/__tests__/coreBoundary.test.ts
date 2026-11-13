/**
 * The shared engines must stay pure (plan M0-T1 accept): no React, Zustand, Supabase, DOM, window,
 * localStorage or import.meta in anything the phone imports from ../src/lib — otherwise the phone would pull
 * in the web's React (two copies → hooks crash) or a browser-only API. Bare imports allowed: decimal.js only
 * (Metro resolves it from mobile/node_modules).
 */
import fs from 'fs';
import path from 'path';

const appSrc = path.resolve(__dirname, '../..');
const coreRoot = path.resolve(appSrc, '../../src/lib');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

const IMPORT = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const importsOf = (file: string) => [...fs.readFileSync(file, 'utf8').matchAll(IMPORT)].map((m) => m[1] ?? m[2]);

/** Every core file reachable from the app's `@core/*` imports. */
function reachableCore(): Set<string> {
  const seen = new Set<string>();
  const queue = walk(appSrc).flatMap((f) => importsOf(f).filter((s) => s.startsWith('@core/')).map((s) => path.join(coreRoot, s.slice(6))));
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const s of importsOf(f)) if (s.startsWith('.')) queue.push(path.resolve(path.dirname(f), s.endsWith('.js') || s.endsWith('.json') ? s : `${s}.js`));
  }
  return seen;
}

test('the app imports some shared engines (sanity)', () => {
  expect(reachableCore().size).toBeGreaterThanOrEqual(8);
});

test.each([...reachableCore()].map((f) => [path.relative(coreRoot, f), f]))('%s is pure', (_rel, file) => {
  const src = fs.readFileSync(file, 'utf8');
  const bare = importsOf(file).filter((s) => !s.startsWith('.'));
  expect(bare.filter((s) => s !== 'decimal.js')).toEqual([]);
  expect(src).not.toMatch(/\b(window|document|localStorage|sessionStorage)\.|import\.meta/);
});
