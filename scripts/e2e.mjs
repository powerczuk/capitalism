// Browser smoke test: starts the game in headless Chromium, plays through the
// first steps a new player takes and visits every view, failing on any
// console error or sideways page overflow.
//
//   npm run test:e2e            (needs Playwright: npm i -D playwright && npx playwright install chromium)
//   npm run test:e2e -- --phone  also run at phone width
//
// Playwright is deliberately not a dependency of the game — install it only
// if you want to run this script.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (path === sep || path === '/') path = '/index.html';
    const file = resolve(join(root, path));
    if (!file.startsWith(root + sep)) throw new Error('outside root');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, done));
const url = `http://localhost:${server.address().port}/`;

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

async function run(name, viewport) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('[data-act=draftOpen]');
  await page.fill('#company-name', 'Test & Spółka <b>');
  await page.fill('#start-seed', 'e2e');
  await page.click('#new-game button[type=submit]');
  await page.waitForSelector('.app');

  // Build a store from the city page, the way a player does.
  await page.evaluate(() => window.hossa.go('map'));
  await page.click('[data-act=openCity]');
  await page.click('[data-act=openBuild][data-district=suburb]');
  await page.click('[data-act=buildHere][data-type=supermarket]');
  await page.waitForSelector('.panel');
  for (let slot = 0; slot < 3; slot++) {
    await page.click(`[data-act=pickProduct][data-slot="${slot}"]`);
    await page.click('[data-act=chooseProduct]');
  }
  const stocked = await page
    .waitForFunction(() => document.querySelectorAll('.panel .unit:not(.unit-empty)').length === 3, null, { timeout: 3000 })
    .then(() => true, () => false);
  check(stocked, `${name}: three shelves stocked`);
  check(!(await page.innerHTML('.panel')).includes('<b>'.repeat(2)), `${name}: names are escaped`);

  // Let time pass, then walk through every view.
  const sold = await page.evaluate(() => {
    const app = window.hossa;
    for (let i = 0; i < 400; i++) app.game.tick();
    app.render();
    return app.me.reports.reduce((s, r) => s + r.retail, 0);
  });
  check(sold > 0, `${name}: the store sells`);
  const views = await page.evaluate(() => window.hossa.views().map((v) => v.id));
  for (const view of views) {
    await page.evaluate((v) => {
      window.hossa.closePanel();
      window.hossa.go(v);
    }, view);
    await page.waitForTimeout(120);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 0, `${name}: view "${view}" overflows sideways by ${overflow}px`);
    check((await page.$('.crash')) === null, `${name}: view "${view}" crashed`);
  }

  // Save, reload and continue.
  await page.evaluate(() => window.hossa.save('manual'));
  const day = await page.evaluate(() => window.hossa.game.state.day);
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('[data-act=loadSlot][data-slot=manual]');
  await page.waitForSelector('.app');
  check((await page.evaluate(() => window.hossa.game.state.day)) === day, `${name}: saved game restored`);

  // The clock runs.
  await page.keyboard.press('3');
  await page.waitForTimeout(900);
  await page.keyboard.press(' ');
  check((await page.evaluate(() => window.hossa.game.state.day)) > day, `${name}: time advances`);

  check(problems.length === 0, `${name}: console errors:\n  ${problems.join('\n  ')}`);
  await browser.close();
  console.log(`${failures.length ? '✗' : '✓'} ${name}`);
}

await run('desktop', { width: 1360, height: 860 });
if (process.argv.includes('--phone')) await run('phone', { width: 390, height: 800 });
server.close();

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Browser smoke test passed.');
