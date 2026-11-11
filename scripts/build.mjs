// Optional single-file build: bundles the game (scripts, styles, fonts) into
// one HTML file that works anywhere — opened straight from disk, attached to
// an e-mail, or dropped on any static host.
//
//   npm run build                      → dist/wielka-hossa.html
//   npm run build -- --fragment out.html
//       also writes a body-only fragment (no <html>/<head>/<body>) for hosts
//       that wrap pages in their own document skeleton
//
// The game itself needs no build step; this script is the only place that
// uses a dependency (esbuild, a dev dependency).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const fragmentPath = args.includes('--fragment') ? args[args.indexOf('--fragment') + 1] : null;

let esbuild;
try {
  esbuild = await import('esbuild');
} catch {
  console.error('The single-file build needs esbuild. Run "npm install" first.');
  process.exit(1);
}

// --- scripts ----------------------------------------------------------------
const bundle = await esbuild.build({
  entryPoints: [resolve(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2022',
  legalComments: 'none',
  write: false,
});
const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// --- styles (fonts become data URIs) ------------------------------------------
async function inlineFonts(css) {
  const pattern = /url\('\.\.\/\.\.\/assets\/fonts\/([^']+)'\)/g;
  const files = [...new Set([...css.matchAll(pattern)].map((m) => m[1]))];
  const data = new Map();
  for (const file of files) {
    const bytes = await readFile(resolve(root, 'assets/fonts', file));
    data.set(file, `url(data:font/woff2;base64,${bytes.toString('base64')})`);
  }
  return css.replace(pattern, (whole, file) => data.get(file));
}

const fonts = await inlineFonts(await readFile(resolve(root, 'src/styles/fonts.css'), 'utf8'));
const main = await readFile(resolve(root, 'src/styles/main.css'), 'utf8');
const minified = await esbuild.transform(`${fonts}\n${main}`, { loader: 'css', minify: true });
const style = minified.code;

// --- documents ------------------------------------------------------------------
const source = await readFile(resolve(root, 'index.html'), 'utf8');
const pick = (pattern) => source.match(pattern)?.[0] ?? '';
const title = pick(/<title>[^<]*<\/title>/);
const description = pick(/<meta name="description"[^>]*>/);
const icon = pick(/<link rel="icon"[^>]*>/);

const body = `<div id="root"></div>\n<script>${script}</script>`;

const page = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${title}
${description}
<meta name="color-scheme" content="light dark">
${icon}
<style>${style}</style>
</head>
<body>
${body}
</body>
</html>
`;

const out = resolve(root, 'dist/wielka-hossa.html');
await mkdir(dirname(out), { recursive: true });
await writeFile(out, page);
console.log(`dist/wielka-hossa.html  ${(page.length / 1024).toFixed(0)} kB`);

if (fragmentPath) {
  const fragment = `${title}
<meta name="claude:viewport-fit-sides" content="cover">
<style>${style}</style>
${body}
`;
  const target = resolve(process.cwd(), fragmentPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, fragment);
  console.log(`${fragmentPath}  ${(fragment.length / 1024).toFixed(0)} kB`);
}
