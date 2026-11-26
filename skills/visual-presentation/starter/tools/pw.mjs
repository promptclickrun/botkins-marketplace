// Shared Playwright loader for shoot.mjs and smoke.mjs.
// Playwright is optional. Resolution order:
//   1. PLAYWRIGHT env var: path to a playwright package dir or its entry file
//   2. a normal `import('playwright')` (devDependency installed)
//   3. `import('playwright-core')`
// Chromium flags: software WebGL so it works on machines without a GPU (CI, servers).
import { existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function loadPlaywright() {
  const env = process.env.PLAYWRIGHT;
  const tries = [];
  if (env) {
    let p = resolve(env);
    if (existsSync(p) && statSync(p).isDirectory()) {
      const nm = join(p, 'node_modules', 'playwright');
      p = existsSync(nm) ? join(nm, 'index.js') : join(p, 'index.js');
    }
    tries.push(pathToFileURL(p).href);
  }
  tries.push('playwright', 'playwright-core');
  for (const spec of tries) {
    try {
      const mod = await import(spec);
      return mod.default && mod.default.chromium ? mod.default : mod;
    } catch {
      /* try next */
    }
  }
  console.error(
    'Playwright not found. Either `npm i -D playwright && npx playwright install chromium`,\n' +
      'or install it anywhere and set PLAYWRIGHT=/path/to/node_modules/playwright.',
  );
  process.exit(2);
}

export const GL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--autoplay-policy=no-user-gesture-required',
];

export async function launch(pw) {
  const opts = { headless: true, args: GL_ARGS };
  if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  return pw.chromium.launch(opts);
}

export function deckUrl(query = '', hash = '') {
  const file = resolve(ROOT, process.env.DECK || 'dist/deck.html');
  if (!existsSync(file)) {
    console.error(`No deck at ${file}. Run: node build.mjs`);
    process.exit(2);
  }
  return pathToFileURL(file).href + (query ? '?' + query : '') + (hash ? '#' + hash : '');
}
