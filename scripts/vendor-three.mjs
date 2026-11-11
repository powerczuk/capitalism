// Refreshes the copy of three.js that ships with the game.
//
// The game has no build step, so the 3D view loads the library from a file in
// the repository: vendor/three.min.js (one ES module, minified, MIT licence
// in vendor/three.LICENSE). Run this only to move to another version:
//
//   npm install            (three and esbuild are dev dependencies)
//   npm run vendor
//
// and commit the two files it writes.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = resolve(root, 'node_modules/three');

let esbuild;
let pkg;
try {
  esbuild = await import('esbuild');
  pkg = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
} catch {
  console.error('Vendoring needs the dev dependencies. Run "npm install" first.');
  process.exit(1);
}

const result = await esbuild.build({
  entryPoints: [resolve(source, 'build/three.module.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  legalComments: 'none',
  write: false,
});
const banner = `/*! three.js ${pkg.version} — Copyright 2010-2026 Three.js Authors — MIT licence (see three.LICENSE) */\n`;
const code = banner + result.outputFiles[0].text;
await mkdir(resolve(root, 'vendor'), { recursive: true });
await writeFile(resolve(root, 'vendor/three.min.js'), code);
await writeFile(resolve(root, 'vendor/three.LICENSE'), await readFile(resolve(source, 'LICENSE'), 'utf8'));
console.log(`vendor/three.min.js  three ${pkg.version}  ${(code.length / 1024).toFixed(0)} kB`);
