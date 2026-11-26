#!/usr/bin/env node
// Zero-dependency bundler: turns src/ (ES modules) + assets/ into ONE self-contained
// dist/deck.html that opens from file:// with no network requests.
//
// It handles the module syntax the starter uses (top-level, one statement per line):
//   import x from './a.js'; import { a, b as c } from './a.js'; import './a.js';
//   export const|let|function|class NAME; export default EXPR; export { a, b as c };
// Each module becomes a function scope; modules run once, in dependency order.
//
// Usage: node build.mjs [--watch] [--out dist/deck.html]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, watch } from 'node:fs';
import { dirname, join, resolve, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const ASSETS = join(ROOT, 'assets');
const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const OUT = resolve(ROOT, outArg >= 0 ? args[outArg + 1] : 'dist/deck.html');

const MIME = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json',
};

function dataUri(file) {
  const mime = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

// Replace any relative reference to assets/<file> with an inline data URI.
function inlineAssets(code) {
  return code.replace(/(?:\.\.?\/)+assets\/([\w./-]+\.\w+)/g, (m, name) => {
    const f = join(ASSETS, name);
    if (!existsSync(f)) throw new Error(`missing asset: ${name}`);
    return dataUri(f);
  });
}

const IMPORT_RE = /^import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}\s*)?(?:from\s*)?['"]([^'"]+)['"];?[ \t]*$/gm;

function transform(file, code, idOf) {
  const deps = [];
  const exportsList = [];
  let body = code.replace(IMPORT_RE, (m, def, named, spec) => {
    const dep = resolve(dirname(file), spec);
    deps.push(dep);
    const ref = `__m[${JSON.stringify(idOf(dep))}]`;
    const out = [];
    if (def) out.push(`const ${def} = ${ref}.default;`);
    if (named && named.trim()) {
      const parts = named.split(',').map((x) => x.trim()).filter(Boolean)
        .map((x) => x.replace(/^([\w$]+)\s+as\s+([\w$]+)$/, '$1: $2'));
      out.push(`const { ${parts.join(', ')} } = ${ref};`);
    }
    return out.join(' ') || `/* import ${spec} */`;
  });
  body = body.replace(/^export\s+default\s+/m, () => {
    exportsList.push('default: __default');
    return 'const __default = ';
  });
  body = body.replace(/^export\s+(const|let|var|function\*?|class|async\s+function)\s+([\w$]+)/gm, (m, kw, name) => {
    exportsList.push(name);
    return `${kw} ${name}`;
  });
  body = body.replace(/^export\s*\{([^}]*)\};?[ \t]*$/gm, (m, list) => {
    for (const x of list.split(',').map((s) => s.trim()).filter(Boolean)) {
      const mm = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(x);
      exportsList.push(mm[2] ? `${mm[2]}: ${mm[1]}` : mm[1]);
    }
    return '';
  });
  if (/^\s*(import|export)\b/m.test(body.replace(/`[\s\S]*?`/g, ''))) {
    throw new Error(`${relative(ROOT, file)}: unsupported import/export form (keep one statement per line)`);
  }
  return { deps, body, exportsList };
}

function bundle(entry) {
  const modules = new Map();
  const order = [];
  const idOf = (f) => relative(SRC, f).split('\\').join('/');
  const visiting = new Set();
  function visit(file) {
    if (modules.has(file)) return;
    if (visiting.has(file)) throw new Error(`import cycle at ${idOf(file)}`);
    visiting.add(file);
    const code = readFileSync(file, 'utf8');
    const m = transform(file, code, idOf);
    for (const d of m.deps) visit(d);
    visiting.delete(file);
    modules.set(file, m);
    order.push(file);
  }
  visit(entry);
  const parts = order.map((f) => {
    const m = modules.get(f);
    return `// ---- ${idOf(f)} ----\n__m[${JSON.stringify(idOf(f))}] = (() => {\n${m.body}\nreturn { ${m.exportsList.join(', ')} };\n})();`;
  });
  return `(() => {\n'use strict';\nconst __m = Object.create(null);\n${parts.join('\n\n')}\n})();`;
}

// Optional brand fonts: assets/fonts/display.woff2, body.woff2, mono.woff2 (any of them).
function fontFaces() {
  const dir = join(ASSETS, 'fonts');
  if (!existsSync(dir)) return '';
  const map = { display: 'Deck Display', body: 'Deck Body', mono: 'Deck Mono' };
  const rules = [];
  for (const f of readdirSync(dir)) {
    const key = basename(f, extname(f));
    if (!map[key]) continue;
    rules.push(`@font-face{font-family:'${map[key]}';src:url(${dataUri(join(dir, f))});font-display:block;}`);
  }
  return rules.length ? `<style>${rules.join('')}</style>` : '';
}

function build() {
  const t0 = Date.now();
  let html = readFileSync(join(SRC, 'index.html'), 'utf8');
  const js = inlineAssets(bundle(join(SRC, 'main.js'))).replace(/<\/script/gi, '<\\/script');
  html = inlineAssets(html);
  html = html.replace('<!-- build:fonts -->', fontFaces());
  const tag = /<script type="module" src="\.\/main\.js"><\/script>/;
  if (!tag.test(html)) throw new Error('index.html must contain <script type="module" src="./main.js"></script>');
  html = html.replace(tag, () => `<script>\n${js}\n</script>`);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, html);
  const kb = (statSync(OUT).size / 1024).toFixed(1);
  console.log(`built ${relative(process.cwd(), OUT) || OUT} · ${kb} KB · ${Date.now() - t0} ms`);
}

try {
  build();
} catch (e) {
  console.error('build failed:', e.message);
  if (!args.includes('--watch')) process.exit(1);
}

if (args.includes('--watch')) {
  let timer = 0;
  const again = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        build();
      } catch (e) {
        console.error('build failed:', e.message);
      }
    }, 80);
  };
  for (const dir of [SRC, ASSETS]) if (existsSync(dir)) watch(dir, { recursive: true }, again);
  console.log('watching src/ and assets/ …');
}
