// Browser test: starts the game in headless Chromium, plays through the first
// steps a new player takes (down from the 3D map of the country to a city, a
// click on a free plot, a store), visits every view (failing on any console
// error or sideways page overflow) and then clicks through the deeper
// management flows on the flat map: factory and recipe, suppliers, prices,
// research, advertising, bank, shares, renaming and demolition. Then the 3D
// world itself (tools, picking, labels, the fallback without WebGL) and
// finally the safety nets (instant response, saving on leaving, crash screens).
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

/** Wait until the 3D world shows the given scene (a city id, or 'country') and its camera has settled. */
async function worldReady(page, key) {
  await page.waitForSelector('.world-gl', { timeout: 30000 });
  await page.waitForFunction((k) => window.hossa.world3d?.key === k && !window.hossa.world3d.stage.flying, key, { timeout: 30000 });
}

/**
 * Bring a city, plot or building of the 3D world to the middle of the view
 * and return a point of the page where a click reaches it. What the town
 * hides from one side is looked at from another, the way a player would.
 */
async function worldPoint(page, pick) {
  await page.evaluate((p) => {
    const app = window.hossa;
    app.ui.toasts = []; // nothing may lie over the middle of the map
    app.render();
    app.world3d.focus(p);
  }, pick);
  for (let turn = 0; turn < 4; turn++) {
    await page.waitForFunction(() => !window.hossa.world3d.stage.flying);
    const at = await page.evaluate((p) => {
      const at = window.hossa.world3d.reach(p);
      const box = document.querySelector('.world-gl').getBoundingClientRect();
      return at && { x: box.left + at.x, y: box.top + at.y };
    }, pick);
    if (at) return at;
    await page.evaluate(() => window.hossa.world3d.rotate(1));
  }
  throw new Error(`nothing reaches ${JSON.stringify(pick)} from any side`);
}

/**
 * Click a name that stands over the 3D map. The names let the pointer
 * through to the map (it can be dragged and zoomed over them), so the click
 * goes where the name is, the way a player's does.
 */
async function clickLabel(page, selector) {
  const box = await page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.click(box.x, box.y);
}

/** Click a city, plot or building of the 3D world. */
async function worldClick(page, pick) {
  const at = await worldPoint(page, pick);
  await page.mouse.click(at.x, at.y);
}

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

  // Build a store the way a player does: a new game opens on the map of the
  // country; go down to a city, click one of the lit free plots and choose
  // what to build.
  check((await page.evaluate(() => window.hossa.ui.view)) === 'map', `${name}: a new game opens on the map`);
  await worldReady(page, 'country');
  const cityId = await page.evaluate(() => window.hossa.game.cities()[0].id);
  const inView = await page.evaluate(() => {
    const world = window.hossa.world3d;
    return window.hossa.game.cities().filter((city) => {
      const at = world.screenOf({ kind: 'city', id: city.id });
      return at.x > 10 && at.y > 10 && at.x < world.stage.width - 10 && at.y < world.stage.height - 10;
    }).length;
  });
  check(inView === (await page.evaluate(() => window.hossa.game.cities().length)), `${name}: every city of the country is in view when the map opens (${inView})`);
  await worldClick(page, { kind: 'city', id: cityId });
  await worldReady(page, cityId);
  check((await page.evaluate(() => window.hossa.ui.arg)) === cityId, `${name}: clicking a city on the map opens it`);
  check(await page.evaluate(() => document.querySelector('.world-tip').hidden), `${name}: the tip that named the city on the map does not linger in the city`);
  await worldClick(page, { kind: 'lot', district: 'suburb', lot: 2 });
  await page.waitForSelector('.modal');
  await page.click('[data-act=buildHere][data-type=supermarket]');
  await page.waitForSelector('.panel');
  const first = await page.evaluate(() => {
    const app = window.hossa;
    const b = app.game.state.buildings[app.ui.panel.id];
    return { district: b.district, lot: b.lot, shown: app.world3d.current.buildings.has(b.id), drawn: app.world3d.stage.renderer.info.render.triangles };
  });
  check(first.district === 'suburb' && first.lot === 2, `${name}: the store stands on the plot that was clicked (${JSON.stringify(first)})`);
  check(first.shown && first.drawn > 5000, `${name}: the 3D city shows the new building (${JSON.stringify(first)})`);
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

  // The flat map is one click away, and remembered.
  await S(() => window.hossa.go('map'));
  await page.click('[data-act=worldFlat]');
  await page.waitForSelector('.map-box');
  check((await S(() => JSON.parse(localStorage.getItem('wielka-hossa:prefs')).map3d)) === false, `${name}: the flat map is remembered`);
  check((await page.$('.world-gl')) === null, `${name}: the 3D canvas leaves the page with its view`);

  // A store and a factory in the same city.
  await page.click('[data-act=openCity]');
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

  // Research, advertising, bank, shares. The lab goes on a plot picked on the flat plan of the city.
  const plotPx = await page.$eval('.plan-lot[data-district=center]', (el) => el.getBoundingClientRect().width);
  check(plotPx >= 16, `${name}: a plot on the flat plan is large enough to hit (${plotPx.toFixed(1)} px)`);
  const planLot = await page.getAttribute('.plan-lot[data-district=industrial]', 'data-lot');
  await page.click('.plan-lot[data-district=industrial]');
  await page.click('[data-act=buildHere][data-type=lab]');
  await page.waitForSelector('.panel');
  const labId = await S(() => window.hossa.ui.panel.id);
  check((await building(labId)).lot === Number(planLot), `${name}: a plot picked on the flat plan is the plot built on`);
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
 * The 3D world: what a click picks, what the tools do, names over buildings,
 * the camera kept between visits — and the flat map where WebGL is missing.
 */
async function world() {
  const name = 'world';
  const browser = await chromium.launch();
  const start = async (page, seed) => {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.click('[data-act=draftOpen]');
    await page.fill('#start-seed', seed);
    await page.click('#new-game button[type=submit]');
    await page.waitForSelector('.app');
  };
  let page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  const S = (fn, arg) => page.evaluate(fn, arg);
  const view = () => S(() => ({ ...window.hossa.world3d.stage.view }));
  const settled = () => page.waitForFunction(() => !window.hossa.world3d.stage.flying);
  await start(page, 'world');

  // A year of rivals building, then the map of the country.
  await S(() => {
    const app = window.hossa;
    for (let i = 0; i < 365; i++) app.game.tick();
    app.go('map');
  });
  await worldReady(page, 'country');
  const country = await S(() => ({
    labels: document.querySelectorAll('.world-label-city').length,
    cities: window.hossa.game.cities().length,
    plotsTool: !!document.querySelector('[data-act=worldLots]'),
  }));
  check(country.labels === country.cities, `${name}: every city carries its name on the map (${country.labels} of ${country.cities})`);
  check(!country.plotsTool, `${name}: the plots tool belongs to cities, not to the map of the country`);

  // Down to the city where the rivals have built the most.
  const target = await S(() => {
    const app = window.hossa;
    const game = app.game;
    const city = [...game.cities()].sort((a, b) => game.buildingsIn(b.id).length - game.buildingsIn(a.id).length)[0];
    const rival = game.buildingsIn(city.id).find((b) => b.co !== app.me.id && game.isReady(b));
    const taken = new Set(game.buildingsIn(city.id).map((b) => `${b.district}:${b.lot}`));
    let lot = 0;
    while (taken.has(`residential:${lot}`)) lot++;
    return { city: city.id, rival: rival?.id, owner: game.state.companies[rival?.co]?.name, lot };
  });
  check(!!target.rival, `${name}: after a year some rival has a finished building`);
  // The name over a city is a button: clicking it goes down to the city, like clicking the city itself.
  await worldPoint(page, { kind: 'city', id: target.city });
  await clickLabel(page, `.world-label-city[data-id="${target.city}"]`);
  await worldReady(page, target.city);
  check((await S(() => window.hossa.world3d.current.highlight?.visible)) === true, `${name}: a company without buildings is shown the free plots`);

  // Hovering a free plot says what it is.
  const plot = await worldPoint(page, { kind: 'lot', district: 'residential', lot: target.lot });
  await page.mouse.move(plot.x - 3, plot.y - 3);
  await page.mouse.move(plot.x, plot.y);
  const tip = await page
    .waitForFunction(() => !document.querySelector('.world-tip').hidden && document.querySelector('.world-tip').textContent.length > 3, null, { timeout: 3000 })
    .then(() => true, () => false);
  check(tip, `${name}: hovering a free plot names it`);
  check((await S(() => window.hossa.world3d.current.markers.hover?.mesh?.visible)) === true, `${name}: the plot under the pointer is framed`);

  // A rival's building: a card says whose it is, and no panel opens.
  await worldClick(page, { kind: 'building', id: target.rival });
  await page.waitForSelector('.world-card');
  check((await page.textContent('.world-card')).includes(target.owner), `${name}: a rival's building names its owner`);
  check((await page.$('.panel')) === null, `${name}: a rival's building has no management panel`);
  await page.click('[data-act=worldInfoClose]');
  await page.waitForFunction(() => !document.querySelector('.world-card'));

  // The tools: turning, zooming, the plots, the drawer with the city's numbers.
  const before = await view();
  await page.click('[data-act=worldTurn][data-dir="1"]');
  await settled();
  check((await view()).rot === before.rot + 1, `${name}: the turn tool turns the camera a quarter`);
  await page.click('[data-act=worldZoom][data-factor="0.7"]');
  check((await view()).zoom < before.zoom, `${name}: the zoom tool zooms in`);
  await page.click('[data-act=worldLots]');
  await page.waitForFunction(() => window.hossa.world3d.current.highlight.visible === false);
  await page.click('[data-act=worldLots]');
  await page.click('[data-act=worldDetails]');
  await page.waitForSelector('.world-details');
  const stats = await page.$eval('.world-details .stat-row', (el) => el.getBoundingClientRect().height);
  check(stats > 40, `${name}: the drawer shows the numbers of the city (stat row ${Math.round(stats)} px high)`);

  // Building from the drawer takes the next free plot; the site appears in the world with its name.
  await page.click('.world-details [data-act=openBuild][data-district=industrial]');
  await page.click('[data-act=buildHere][data-type=factory]');
  await page.waitForSelector('.panel');
  const mine = await S(() => window.hossa.ui.panel.id);
  await page.click('[data-act=closePanel]');
  await page.click('.world-details [data-act=worldDetails]');
  await page.waitForFunction(() => !document.querySelector('.world-details'));
  const site = await S((id) => {
    const app = window.hossa;
    const entry = app.world3d.current.buildings.get(id);
    return { shown: !!entry, stage: entry?.key.split('|')[3], label: document.querySelector('.world-label-own')?.textContent };
  }, mine);
  check(site.shown && site.stage?.startsWith('site'), `${name}: a building under construction stands as a site (${JSON.stringify(site)})`);
  check(!!site.label && site.label === (await S((id) => window.hossa.buildingName(window.hossa.game.state.buildings[id]), mine)), `${name}: the player's building carries its name (${site.label})`);

  // Clicking the own building opens its panel; when construction ends the model is replaced.
  await worldClick(page, { kind: 'building', id: mine });
  await page.waitForSelector('.panel');
  check((await S(() => window.hossa.ui.panel.id)) === mine, `${name}: clicking the own building opens its panel`);
  await page.waitForFunction(() => window.hossa.world3d.current.markers.selected?.mesh?.visible === true);
  await page.click('[data-act=closePanel]');
  await page.waitForFunction(() => !document.querySelector('.panel'));
  await page.waitForFunction(() => window.hossa.world3d.current.markers.selected.mesh.visible === false);
  await clickLabel(page, `.world-label-own[data-id="${mine}"]`);
  await page.waitForSelector('.panel');
  check((await S(() => window.hossa.ui.panel.id)) === mine, `${name}: clicking the name over the own building opens its panel too`);
  await page.click('[data-act=closePanel]');
  await S(() => {
    const app = window.hossa;
    for (let i = 0; i < 120; i++) app.game.tick();
    app.render();
  });
  await page.waitForFunction((id) => window.hossa.world3d.current.buildings.get(id)?.key.split('|')[3] === 'ok', mine);

  // The dark theme is night in the world.
  await S(() => window.hossa.setTheme('dark'));
  await page.waitForFunction(() => window.hossa.world3d.stage.mode === 'night');
  await S(() => window.hossa.setTheme('light'));
  await page.waitForFunction(() => window.hossa.world3d.stage.mode === 'day');

  // The keyboard moves the camera when the world has the focus — and the pause key stays the pause key.
  await page.focus('.world-gl');
  const here = await view();
  await page.keyboard.press('ArrowLeft');
  const moved = await view();
  check(moved.x !== here.x || moved.z !== here.z, `${name}: arrow keys move the view`);
  await page.keyboard.press(' ');
  check((await S(() => window.hossa.ui.speed)) > 0, `${name}: space still starts the clock while the world has the focus`);
  await page.keyboard.press(' ');

  // Leaving the map and coming back keeps the world and the camera.
  const cam = await view();
  await S(() => {
    document.querySelector('.world-gl').dataset.mark = 'kept';
    window.hossa.go('overview');
  });
  await page.waitForFunction(() => !document.querySelector('.world-gl'));
  await S((id) => window.hossa.go('map', id), target.city);
  await worldReady(page, target.city);
  const back = await view();
  check((await page.getAttribute('.world-gl', 'data-mark')) === 'kept', `${name}: the world is not rebuilt when the map is opened again`);
  check(Math.abs(back.x - cam.x) < 1e-6 && Math.abs(back.zoom - cam.zoom) < 1e-6 && back.rot === cam.rot, `${name}: the camera is where it was left`);

  // Back to the country with the arrow in the title; the keyboard carries on from the map.
  await page.focus('.world-title [data-act=go]');
  await page.keyboard.press('Enter');
  await worldReady(page, 'country');
  check((await page.$('.world-label-city.mine')) !== null, `${name}: the map of the country marks the city the player has built in`);
  check((await S(() => document.activeElement?.className)) === 'world-gl', `${name}: after going back with the keyboard the focus is on the map, not lost`);

  // ----- what a review of the 3D world found, kept fixed -----

  // A card about a rival's building stays in the city it was opened in, and Escape closes it.
  await S((id) => window.hossa.go('map', id), target.city);
  await worldReady(page, target.city);
  await worldClick(page, { kind: 'building', id: target.rival });
  await page.waitForSelector('.world-card');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.world-card'));
  await worldClick(page, { kind: 'building', id: target.rival });
  await page.waitForSelector('.world-card');
  await S(() => window.hossa.go('map'));
  await worldReady(page, 'country');
  check((await page.$('.world-card')) === null, `${name}: the card of a building does not follow the player to the country`);
  await S((id) => window.hossa.go('map', id), target.city);
  await worldReady(page, target.city);
  check((await page.$('.world-card')) === null, `${name}: …nor come back with the city`);

  // The drawer: Escape closes it and hands the focus back to its button; toggles say whether they are on.
  await page.click('[data-act=worldDetails]');
  await page.waitForSelector('.world-details');
  check((await page.getAttribute('.world-tools [data-act=worldDetails]', 'aria-pressed')) === 'true', `${name}: an open drawer is announced as pressed`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.world-details'));
  await page.waitForFunction(() => document.activeElement?.dataset.act === 'worldDetails');
  check((await page.getAttribute('.world-tools [data-act=worldDetails]', 'aria-pressed')) === 'false', `${name}: …and a closed one as not pressed`);

  // Keys: letters in either case; the browser's own shortcuts are left alone.
  await page.focus('.world-gl');
  const rot0 = (await view()).rot;
  await page.keyboard.press('Shift+Q');
  await settled();
  check((await view()).rot === (rot0 + 3) % 4, `${name}: a capital Q turns the view as well`);
  await page.keyboard.press('Control+E');
  await page.waitForTimeout(120);
  await settled();
  check((await view()).rot === (rot0 + 3) % 4, `${name}: Ctrl+E belongs to the browser, not to the map`);
  await page.keyboard.press('e');
  await settled();

  // A click may wobble a little and is still a click.
  const wobble = await worldPoint(page, { kind: 'lot', district: 'residential', lot: target.lot + 1 });
  await page.mouse.move(wobble.x, wobble.y);
  await page.mouse.down();
  await page.mouse.move(wobble.x + 2, wobble.y + 1);
  await page.mouse.move(wobble.x - 1, wobble.y);
  await page.mouse.move(wobble.x, wobble.y);
  await page.mouse.up();
  const wobbled = await page.waitForSelector('.modal', { timeout: 3000 }).then(() => true, () => false);
  check(wobbled, `${name}: a press that wobbles by a pixel or two is still a click`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.modal'));

  // Two fingers move within one frame: the ground between them must stay where it is.
  const drift = await S(() => {
    const stage = window.hossa.world3d.stage;
    stage.renderNow();
    const px = stage.width * 0.3;
    const py = stage.height * 0.4;
    const before = stage.groundAt(px, py);
    stage.zoomBy(0.85, px, py);
    stage.zoomBy(0.85, px, py); // the second finger, before anything has been drawn
    stage.renderNow();
    const after = stage.groundAt(px, py);
    return Math.hypot(after.x - before.x, after.z - before.z);
  });
  check(drift < 0.05, `${name}: zooming twice within a frame keeps the point under the fingers (it moved ${drift.toFixed(2)} units)`);

  // A turn that is interrupted still ends on a quarter.
  const rested = await S(() => {
    const stage = window.hossa.world3d.stage;
    stage.rotate(1);
    stage.panBy(12, 0);
    return { rot: stage.view.rot, flying: stage.flying };
  });
  check(Number.isInteger(rested.rot) && !rested.flying, `${name}: a turn cut short by a drag rests on a quarter (${JSON.stringify(rested)})`);

  // The tip stays inside the map at its right and bottom edges.
  const tipBox = await S((lot) => {
    const world = window.hossa.world3d;
    world.onHover({ kind: 'lot', district: 'residential', lot }, { x: world.stage.width - 3, y: world.stage.height - 3 });
    const tip = document.querySelector('.world-tip').getBoundingClientRect();
    const host = document.querySelector('.world-host').getBoundingClientRect();
    const inside = tip.left >= host.left && tip.right <= host.right && tip.top >= host.top && tip.bottom <= host.bottom;
    world.onHover(null, { x: -1, y: -1 });
    return { inside, hidden: document.querySelector('.world-tip').hidden };
  }, target.lot + 1);
  check(tipBox.inside && tipBox.hidden, `${name}: the tip is kept inside the map and goes when the pointer leaves (${JSON.stringify(tipBox)})`);

  // With the building panel open the tools of the map stay in reach (the panel floats over the page at this width).
  await S((id) => window.hossa.openBuilding(id), mine);
  await page.waitForSelector('.panel');
  await page.waitForTimeout(150);
  const covered = await S(() =>
    [...document.querySelectorAll('.world-tools .tool')].filter((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !el.contains(top);
    }).length,
  );
  check(covered === 0, `${name}: ${covered} tool(s) of the map lie under the building panel`);
  await page.click('[data-act=closePanel]');
  await page.waitForFunction(() => !document.querySelector('.panel'));

  // Leaving a city while the camera is still coming down keeps where it was going, not where it was.
  const other = await S((first) => window.hossa.game.cities().find((c) => c.id !== first).id, target.city);
  await S(() => window.hossa.go('map'));
  await worldReady(page, 'country');
  await S((id) => window.hossa.go('map', id), other);
  await page.waitForFunction((id) => window.hossa.world3d.key === id, other);
  await S(() => window.hossa.go('overview'));
  await page.waitForFunction(() => !document.querySelector('.world-gl'));
  await S((id) => window.hossa.go('map', id), other);
  await worldReady(page, other);
  const landed = await S(() => ({ zoom: window.hossa.world3d.stage.view.zoom, meant: window.hossa.world3d.current.view.zoom }));
  check(Math.abs(landed.zoom - landed.meant) < 0.5, `${name}: a city left in mid-descent is found at its own height again (${JSON.stringify(landed)})`);

  // The system's dark theme is night in the world at once, without waiting for anything else to redraw
  // (for a player who has not chosen a theme of their own).
  await S(() => window.hossa.setTheme('system'));
  await page.emulateMedia({ colorScheme: 'dark' });
  const night = await page.waitForFunction(() => window.hossa.world3d.stage.mode === 'night', null, { timeout: 3000 }).then(() => true, () => false);
  check(night, `${name}: the world follows the system's dark theme`);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => window.hossa.world3d.stage.mode === 'day');

  check(problems.length === 0, `${name}: console errors:\n  ${problems.join('\n  ')}`);

  // A model that fails to draw (a mod's, most likely) is replaced by a plain building; the world carries on.
  const broken = await S(async (cityId) => {
    const models = await import('/src/ui3d/models/index.js');
    models.registerModel('lab', () => {
      throw new Error('model boom');
    });
    const app = window.hossa;
    app.me.cash = 1e9;
    const built = app.cmd('build', { type: 'lab', city: cityId, district: 'industrial' });
    app.game.state.buildings[built.building].ready = app.game.state.day; // finished at once
    app.render();
    return built.building;
  }, other);
  await page.waitForFunction((id) => window.hossa.world3d?.current.buildings.has(id), broken, { timeout: 5000 }).catch(() => {});
  const survived = await S((id) => ({ shown: !!window.hossa.world3d?.current.buildings.has(id), no3d: window.hossa.no3d, crash: !!document.querySelector('.crash') }), broken);
  check(survived.shown && !survived.no3d && !survived.crash, `${name}: a failing model must not take the world down (${JSON.stringify(survived)})`);

  // …and if the world itself fails, the flat map takes over instead of the game ending.
  await S(() => {
    window.hossa.world3d.current.sync = () => {
      throw new Error('scene boom');
    };
    window.hossa.render();
  });
  await page.waitForSelector('.plan', { timeout: 5000 }).catch(() => {});
  const fell = await S(() => ({ flat: !!document.querySelector('.plan'), no3d: window.hossa.no3d, crash: !!document.querySelector('.crash'), told: window.hossa.ui.toasts.length }));
  check(fell.flat && fell.no3d && !fell.crash && fell.told > 0, `${name}: a failing world falls back to the flat map (${JSON.stringify(fell)})`);
  await page.close();

  // A game that is only watched: buildings can be looked at, plots cannot be clicked.
  page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  const watching = [];
  page.on('console', (m) => m.type() === 'error' && watching.push(m.text()));
  page.on('pageerror', (e) => watching.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('[data-act=draftOpen]');
  await page.fill('#start-seed', 'watch');
  await page.check('#opt-spectate');
  await page.click('#new-game button[type=submit]');
  await page.waitForSelector('.app');
  await worldReady(page, 'country');
  const watched = await page.evaluate(() => {
    const app = window.hossa;
    for (let i = 0; i < 200; i++) app.game.tick();
    const city = [...app.game.cities()].sort((a, b) => app.game.buildingsIn(b.id).length - app.game.buildingsIn(a.id).length)[0];
    app.go('map', city.id);
    return city.id;
  });
  await worldReady(page, watched);
  const idle = await page.evaluate(() => {
    const world = window.hossa.world3d;
    const scene = world.current;
    world.stage.renderNow();
    let reachable = 0;
    for (const key of scene.lotProxies.keys()) {
      const [district, lot] = key.split(':');
      if (world.reach({ kind: 'lot', district, lot: Number(lot) })) reachable++;
    }
    return { plots: scene.lotProxies.size, reachable, tool: !!document.querySelector('[data-act=worldLots]') };
  });
  check(idle.plots > 0 && idle.reachable === 0 && !idle.tool, `${name}: with no company to build, free plots are not clickable (${JSON.stringify(idle)})`);
  check(watching.length === 0, `${name}: console errors while watching:\n  ${watching.join('\n  ')}`);
  await page.close();

  // Without WebGL the flat map takes over, and building works from its plan.
  page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  const loud = [];
  page.on('console', (m) => m.type() === 'error' && !/WebGL/i.test(m.text()) && loud.push(m.text()));
  page.on('pageerror', (e) => loud.push(e.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
      return String(type).includes('webgl') ? null : original.call(this, type, ...rest);
    };
  });
  await start(page, 'flat');
  await page.evaluate(() => window.hossa.go('map'));
  await page.waitForSelector('.map-box');
  const flat = await page.evaluate(() => ({
    no3d: window.hossa.no3d,
    world: !!document.querySelector('.world'),
    offer: !!document.querySelector('[data-act=worldSolid]'),
    told: window.hossa.ui.toasts.length,
  }));
  check(flat.no3d && !flat.world && !flat.offer && flat.told > 0, `${name}: without WebGL the flat map is shown and the player is told (${JSON.stringify(flat)})`);
  await page.click('[data-act=openCity]');
  await page.click('.plan-lot[data-district=center]');
  await page.click('[data-act=buildHere][data-type=supermarket]');
  await page.waitForSelector('.panel');
  check((await page.$('.crash')) === null && loud.length === 0, `${name}: the flat map works without WebGL:\n  ${loud.join('\n  ')}`);
  await page.close();

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
    // These checks are about the shell, so they run on a plain page rather than on the 3D map a new game opens with.
    await page.evaluate(() => window.hossa.go('overview'));
    await page.waitForFunction(() => document.querySelector('.main')?.dataset.view === 'overview');
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
await world();
await safety();
server.close();

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Browser smoke test passed.');
