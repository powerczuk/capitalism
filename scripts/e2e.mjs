// Browser test: starts the game in headless Chromium, plays through the first
// steps a new player takes, visits every view (failing on any console error
// or sideways page overflow) and then clicks through the deeper management
// flows: factory and recipe, suppliers, prices, research, advertising, bank,
// shares, renaming and demolition — and finally checks the safety nets
// (instant response, saving on leaving, crash screens).
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

/** The deeper management flows, driven by clicks the way a player does them. */
async function flows() {
  const name = 'flows';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  const S = (fn, arg) => page.evaluate(fn, arg);
  const building = (id) => S((x) => window.hossa.game.state.buildings[x], id);
  const modalClosed = () => page.waitForFunction(() => !document.querySelector('.modal'));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('[data-act=draftOpen]');
  await page.selectOption('#start-capital', 'rich');
  await page.fill('#start-seed', 'flows');
  await page.click('#new-game button[type=submit]');
  await page.waitForSelector('.app');

  // A store and a factory in the same city.
  await S(() => window.hossa.go('map', window.hossa.game.cities()[1].id));
  await page.click('[data-act=openBuild][data-district=residential]');
  await page.click('[data-act=buildHere][data-type=supermarket]');
  await page.waitForSelector('.panel');
  await page.click('[data-act=pickProduct][data-slot="0"]');
  await page.click('[data-act=chooseProduct][data-product=bread]');
  const storeId = await S(() => window.hossa.ui.panel.id);
  await page.click('[data-act=closePanel]');
  await page.click('[data-act=openBuild][data-district=industrial]');
  await page.click('[data-act=buildHere][data-type=factory]');
  await page.waitForSelector('.panel');
  const factoryId = await S(() => window.hossa.ui.panel.id);
  await page.click('[data-act=pickRecipe][data-line="0"]');
  await page.click('[data-act=chooseRecipe][data-recipe=bread]');
  await page.waitForFunction(() => document.querySelectorAll('.panel .unit:not(.unit-empty)').length === 1);
  check((await building(factoryId)).lines[0]?.recipe === 'bread', `${name}: recipe chosen`);
  await page.check(`#sell-${factoryId}-0`);
  await page.fill(`#lprice-${factoryId}-0`, '0,70');
  await page.press(`#lprice-${factoryId}-0`, 'Tab');
  const line = (await building(factoryId)).lines[0];
  check(line.sell === true && Math.abs(line.price - 0.7) < 1e-9, `${name}: wholesale offer set (decimal comma accepted)`);

  // After construction: switch the shelf to the own factory through the picker.
  await S(() => {
    for (let i = 0; i < 80; i++) window.hossa.game.tick();
    window.hossa.render();
  });
  await S((id) => window.hossa.openBuilding(id), storeId);
  await page.click('[data-act=pickSource][data-slot="0"]');
  await page.click(`[data-act=chooseSource][data-src="${factoryId}:0"]`);
  await modalClosed();
  check((await building(storeId)).slots[0].src === `${factoryId}:0`, `${name}: shelf supplied by the own factory`);

  // Prices.
  const before = (await building(storeId)).slots[0].price;
  await page.click('[data-act=slotPriceStep][data-dir="1"]');
  check((await building(storeId)).slots[0].price > before, `${name}: price stepper`);
  await page.fill(`#price-${storeId}-0`, '1.05');
  await page.press(`#price-${storeId}-0`, 'Enter');
  check(Math.abs((await building(storeId)).slots[0].price - 1.05) < 1e-9, `${name}: typed price`);
  await page.check(`#auto-${storeId}-0`);
  check((await building(storeId)).slots[0].auto === true, `${name}: auto pricing`);

  // Renaming must never turn into markup.
  await page.click('[data-act=renameStart]');
  await page.fill(`#rename-${storeId}`, 'Sklep <i>pierwszy</i>');
  await page.press(`#rename-${storeId}`, 'Enter');
  await page.waitForTimeout(150);
  check((await building(storeId)).name === 'Sklep <i>pierwszy</i>', `${name}: rename stored`);
  check((await page.$('.panel-title i')) === null, `${name}: names are rendered as text`);
  await page.click('[data-act=closePanel]');

  // Research, advertising, bank, shares.
  await page.click('[data-act=openBuild][data-district=industrial]');
  await page.click('[data-act=buildHere][data-type=lab]');
  await page.waitForSelector('.panel');
  const labId = await S(() => window.hossa.ui.panel.id);
  await page.selectOption(`#lab-product-${labId}-0`, 'bread');
  await page.selectOption(`#lab-budget-${labId}-0`, '200000');
  const lab = (await building(labId)).labs[0];
  check(lab?.product === 'bread' && lab.budget === 200000, `${name}: lab team assigned`);
  await page.click('[data-act=closePanel]');

  await S(() => window.hossa.go('brands'));
  await page.selectOption('#ads-bread', '50000');
  check((await S(() => window.hossa.me.ads.bread)) === 50000, `${name}: advertising budget`);

  await S(() => {
    window.hossa.ui.tabs.finance = 'bank';
    window.hossa.go('finance');
  });
  await page.selectOption('#loan-amount', '2000000');
  await page.click('[data-act=borrow]');
  check((await S(() => window.hossa.me.loan)) === 2000000, `${name}: loan taken`);
  await page.click('[data-act=repayAll]');
  check((await S(() => window.hossa.me.loan)) === 0, `${name}: loan repaid`);

  await S(() => window.hossa.go('stocks'));
  await page.click('[data-act=openTrade][data-mode=buy]');
  await page.click('[data-act=tradeGo]');
  await modalClosed();
  const held = () =>
    S(() => {
      const me = window.hossa.me;
      return window.hossa.game.companies().reduce((n, c) => n + (c.shares.held[me.id] || 0), 0);
    });
  check((await held()) > 0, `${name}: shares bought`);
  await page.click('[data-act=openTrade][data-mode=sell]');
  await page.click('[data-act=tradeGo]');
  await modalClosed();
  check((await held()) < 20000 + 1, `${name}: shares sold`);
  await page.click('[data-act=openTrade][data-mode=buyback]');
  await page.click('[data-act=tradeGo]');
  await modalClosed();
  check((await S(() => window.hossa.me.shares.total)) < 1_000_000, `${name}: buyback`);

  // Demolition asks first.
  await S((id) => window.hossa.openBuilding(id), labId);
  await page.click('[data-act=demolishAsk]');
  check((await building(labId)) !== undefined, `${name}: demolition waits for confirmation`);
  await page.click('[data-act=confirmOk]');
  await page.waitForTimeout(150);
  check((await building(labId)) === undefined, `${name}: demolished`);
  check((await page.$('.panel')) === null, `${name}: panel closed after demolition`);

  // A year later the store sells bread made in the own factory.
  const sells = await S((id) => {
    const app = window.hossa;
    for (let i = 0; i < 360; i++) app.game.tick();
    app.render();
    return app.game.state.buildings[id].slots[0].by === app.me.id;
  }, storeId);
  check(sells, `${name}: own-made goods reach the shelf`);

  check(problems.length === 0, `${name}: console errors:\n  ${problems.join('\n  ')}`);
  await browser.close();
  console.log(`${failures.some((f) => f.startsWith(name)) ? '✗' : '✓'} ${name}`);
}

/**
 * The shell's safety nets: clicks answer at once while the clock runs, leaving
 * the page saves the game, a view that fails to draw offers a way back, and a
 * failing rule stops the clock without overwriting the last good save.
 */
async function safety() {
  const name = 'safety';
  const browser = await chromium.launch();
  const fresh = async (seed) => {
    const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.click('[data-act=draftOpen]');
    await page.fill('#start-seed', seed);
    await page.click('#new-game button[type=submit]');
    await page.waitForSelector('.app');
    return page;
  };
  const autosave = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('wielka-hossa:save:auto')).state);

  // A dialog opens on the next frame, also at full speed.
  let page = await fresh('quick');
  let worst = 0;
  for (const speed of [1, 4]) {
    await page.evaluate((s) => window.hossa.setSpeed(s), speed);
    await page.waitForTimeout(400);
    for (let i = 0; i < 4; i++) {
      const took = await page.evaluate(
        () =>
          new Promise((done) => {
            const start = performance.now();
            const waited = () => performance.now() - start;
            document.querySelector('.topbar [data-act=openMenu]').click();
            const look = () => (document.querySelector('.modal') || waited() > 1500 ? done(waited()) : requestAnimationFrame(look));
            requestAnimationFrame(look);
          }),
      );
      worst = Math.max(worst, took);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(90 + i * 37);
    }
  }
  check(worst < 120, `${name}: a dialog took ${Math.round(worst)} ms to appear while the clock was running`);
  await page.close();

  // Going to the background saves what was done while paused.
  page = await fresh('hide');
  const built = await page.evaluate(() => {
    const app = window.hossa;
    return app.cmd('build', { type: 'supermarket', city: app.game.cities()[0].id, district: 'center' }).building;
  });
  check(!(await autosave(page)).buildings[built], `${name}: the autosave should not know the new store yet`);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  check(!!(await autosave(page)).buildings[built], `${name}: hiding the page saves the game`);
  await page.close();

  // A view that throws shows the error and a way back to the overview.
  page = await fresh('view');
  await page.evaluate(() => {
    const app = window.hossa;
    app.content.views.get('stocks').render = () => {
      throw new Error('view boom');
    };
    app.go('stocks');
  });
  await page.waitForSelector('.crash');
  check((await page.textContent('.crash pre')).includes('view boom'), `${name}: the crash screen names the error`);
  await page.click('[data-act=recover]');
  await page.waitForSelector('.app');
  check((await page.evaluate(() => window.hossa.ui.view)) === 'overview', `${name}: recovering leads to the overview`);
  await page.close();

  // A rule that throws stops the clock for good; the last good save stays.
  page = await fresh('rule');
  await page.evaluate(() => {
    const app = window.hossa;
    const tick = app.game.tick.bind(app.game);
    app.game.tick = () => {
      if (app.game.state.day >= 3) throw new Error('rule boom');
      tick();
    };
    app.setSpeed(4);
  });
  await page.waitForSelector('.crash');
  const stopped = await page.evaluate(() => ({
    text: document.querySelector('.crash pre').textContent,
    recover: !!document.querySelector('[data-act=recover]'),
    speed: window.hossa.ui.speed,
  }));
  check(stopped.text.includes('rule boom') && !stopped.recover && stopped.speed === 0, `${name}: a failing rule stops the clock and shows the error`);
  const savedDay = (await autosave(page)).day;
  await page.evaluate(() => {
    window.hossa.game.state.day = 999; // pretend the world got mangled
    window.dispatchEvent(new Event('pagehide'));
  });
  check((await autosave(page)).day === savedDay, `${name}: a failed game must not overwrite the autosave`);
  // The way out: back to the start screen, where the last good save can be continued.
  await page.click('.crash [data-act=quitNow]');
  await page.waitForSelector('.start');
  await page.click('[data-act=loadSlot][data-slot=auto]');
  await page.waitForSelector('.app');
  check((await page.evaluate(() => window.hossa.game.state.day)) === savedDay, `${name}: the autosave can be continued after a failure`);
  await page.close();

  // Importing: the text survives re-renders; a broken save changes nothing; a good one loads.
  page = await fresh('import');
  await page.evaluate(() => {
    for (let i = 0; i < 45; i++) window.hossa.game.tick();
    window.hossa.save('auto');
  });
  const good = await page.evaluate(() => JSON.stringify(window.hossa.game.save()));
  const openImport = async () => {
    await page.click('.topbar [data-act=openMenu]');
    await page.click('[data-act=openImport]');
    await page.waitForSelector('#import-text');
  };
  await openImport();
  // The way a chosen file arrives: the text is put into the field, which does not have the focus.
  await page.evaluate(() => {
    document.querySelector('#import-text').value = '{"v":1,"state":{"v":1,"day":7,"companies":{},"cities":{}}}';
    window.hossa.toast('re-render'); // any redraw while the dialog is open
  });
  await page.waitForTimeout(250);
  check((await page.inputValue('#import-text')).length > 20, `${name}: the import text must survive a re-render`);
  await page.click('[data-act=importApply]');
  await page.waitForTimeout(250);
  const refused = await page.evaluate(() => ({ day: window.hossa.game.state.day, crash: !!document.querySelector('.crash'), companies: window.hossa.game.companies().length }));
  check(refused.day === 45 && !refused.crash && refused.companies > 0, `${name}: a broken save must leave the running game alone (${JSON.stringify(refused)})`);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  check((await autosave(page)).day === 45, `${name}: a refused import must not touch the autosave`);
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) window.hossa.game.tick();
    window.hossa.render();
  });
  await page.fill('#import-text', good);
  await page.click('[data-act=importApply]');
  await page.waitForFunction(() => !document.querySelector('.modal'));
  check((await page.evaluate(() => window.hossa.game.state.day)) === 45, `${name}: a good save is imported`);
  await page.close();

  // Details of the building panel: the lab budget shown is the real one; Escape abandons a rename.
  page = await fresh('details');
  const lab = await page.evaluate(() => {
    const app = window.hossa;
    const id = app.cmd('build', { type: 'lab', city: app.game.cities()[0].id, district: 'industrial' }).building;
    app.cmd('setLab', { building: id, lab: 0, product: 'bread', budget: 300_000 });
    app.openBuilding(id);
    return id;
  });
  await page.waitForSelector(`#lab-budget-${lab}-0`);
  check((await page.inputValue(`#lab-budget-${lab}-0`)) === '300000', `${name}: the lab budget select shows the actual budget`);
  await page.click('[data-act=renameStart]');
  await page.waitForSelector(`#rename-${lab}`);
  await page.fill(`#rename-${lab}`, 'Nie zapisuj');
  await page.keyboard.press('Escape');
  await page.waitForFunction((id) => !document.querySelector(`#rename-${id}`), lab);
  check((await page.evaluate((id) => window.hossa.game.state.buildings[id].name, lab)) == null, `${name}: Escape abandons a rename`);
  check((await page.$('.panel')) !== null, `${name}: …and keeps the panel open`);
  await page.close();

  await browser.close();
  console.log(`${failures.some((f) => f.startsWith(name)) ? '✗' : '✓'} ${name}`);
}

await run('desktop', { width: 1360, height: 860 });
if (process.argv.includes('--phone')) await run('phone', { width: 390, height: 800 });
await flows();
await safety();
server.close();

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Browser smoke test passed.');
