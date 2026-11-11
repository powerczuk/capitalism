// Saves come from outside the game — a file, another device, an older or a
// modded copy — so loading has to recognise what it cannot run and say so,
// instead of letting a broken world into play.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { lineSrc } from '../src/sim/supply.js';

const content = createContent();

function played(days = 400) {
  const game = Game.create(content, { seed: 'saves', cityCount: 4, player: { name: 'Zapis' }, rivals: [{ level: 'shark' }, { level: 'novice' }] });
  const me = game.human;
  me.cash = 2e8;
  const city = game.cities()[0];
  const store = game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'center' }).building;
  const plant = game.exec(me.id, 'build', { type: 'factory', city: city.id, district: 'industrial' }).building;
  const lab = game.exec(me.id, 'build', { type: 'lab', city: city.id, district: 'industrial' }).building;
  game.run(80);
  game.exec(me.id, 'setLine', { building: plant, line: 0, recipe: 'bread', sell: true });
  game.exec(me.id, 'setSlot', { building: store, slot: 0, product: 'bread', src: lineSrc(plant, 0) });
  game.exec(me.id, 'setSlot', { building: store, slot: 1, product: 'coffee' });
  game.exec(me.id, 'setLab', { building: lab, lab: 0, product: 'bread', budget: 100_000 });
  game.exec(me.id, 'setAds', { product: 'bread', budget: 50_000 });
  game.run(days - 80);
  return { game, me, store, plant, lab };
}

const copy = (game) => JSON.parse(JSON.stringify(game.save()));
const refusal = (data, using = content) => {
  try {
    Game.load(using, data);
    return null;
  } catch (error) {
    return error;
  }
};

test('save: a played game loads back and carries on exactly as before', () => {
  const { game } = played();
  const data = copy(game);
  const loaded = Game.load(content, data);
  assert.equal(loaded.state.day, game.state.day, 'checking a save does not advance it');
  // (compared as JSON: the sign of a zero does not survive a save, and need not)
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(loaded.state, plain(game.state));
  game.run(120);
  loaded.run(120);
  assert.deepEqual(plain(loaded.state), plain(game.state), 'both worlds stay in step');
});

test('save: damaged files are refused, with the game told apart from its content', () => {
  const { game, store } = played(200);

  // Things that are not saves at all.
  for (const junk of [null, 7, 'text', [], {}, { state: null }, { state: {} }, { v: 1, state: { v: 1, day: 7, companies: {}, cities: {} } }]) {
    assert.match(refusal(junk)?.message ?? 'loaded', /^save\.invalid$/, JSON.stringify(junk));
  }
  const other = copy(game);
  other.state.v = 99;
  assert.equal(refusal(other).message, 'save.version');

  const mangle = (change) => {
    const data = copy(game);
    change(data.state);
    return refusal(data);
  };
  const expectInvalid = (change, what) => assert.equal(mangle(change)?.message, 'save.invalid', what);
  expectInvalid((s) => delete s.economy, 'no economy');
  expectInvalid((s) => (s.day = 'soon'), 'day is not a number');
  expectInvalid((s) => (s.companies[s.humanId].cash = null), 'cash is missing');
  expectInvalid((s) => (s.companies[s.humanId].cash = 1e400), 'cash is infinite');
  expectInvalid((s) => s.companyOrder.push('k999'), 'a company that is not there');
  expectInvalid((s) => (s.buildings[store].co = 'k999'), 'a building without an owner');
  expectInvalid((s) => (s.buildings[store].city = 'constructor'), 'a building in no city');
  expectInvalid((s) => (s.buildings[store].slots = null), 'a store without shelves');
  expectInvalid((s) => (s.buildings[store].slots[0].price = 0), 'a free product');
  expectInvalid((s) => (s.humanId = 'nobody'), 'a player without a company');
  expectInvalid((s) => {
    const id = s.cityOrder[0];
    const evil = 'c1"><img src=x onerror=alert(1)>';
    s.cities[evil] = { ...s.cities[id], id: evil };
    delete s.cities[id];
    s.cityOrder[0] = evil;
  }, 'an id that is not a plain word');
  expectInvalid((s) => (s.cities[s.cityOrder[0]].x = '10"><script>'), 'a coordinate that is not a number');

  // Content this game does not have.
  const unknown = mangle((s) => (s.buildings[store].slots[0].product = 'tea_from_removed_mod'));
  assert.equal(unknown.message, 'save.content');
  assert.equal(unknown.params.id, 'tea_from_removed_mod');
  assert.equal(mangle((s) => (s.buildings[store].type = 'casino')).message, 'save.content');
  assert.equal(mangle((s) => (s.companies[s.companyOrder[1]].ai.level = 'godlike')).message, 'save.content');
});

test('save: a game made with a mod is refused without it, by name', () => {
  const { game } = played(200);
  const plain = createContent({ mods: [] });
  const error = refusal(copy(game), plain);
  assert.equal(error.message, 'save.content');
  assert.match(error.params.id, /^coffee/);
});

test('save: what the check lets through also runs', () => {
  // Damage one value at a time; a save is either refused or playable.
  const { game } = played(200);
  const base = JSON.stringify(game.save());
  let seed = 20261111;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const paths = [];
  (function walk(value, here) {
    if (!value || typeof value !== 'object') return;
    const keys = Object.keys(value);
    for (const key of Array.isArray(value) && keys.length > 4 ? [keys[0], keys.at(-1)] : keys) {
      paths.push([...here, key]);
      walk(value[key], [...here, key]);
    }
  })(JSON.parse(base).state, []);
  const damage = [(o, k) => delete o[k], (o, k) => (o[k] = null), (o, k) => (o[k] = 'x'), (o, k) => (o[k] = -7.5), (o, k) => (o[k] = {}), (o, k) => (o[k] = [])];
  let refused = 0;
  for (let i = 0; i < 80; i++) {
    const data = JSON.parse(base);
    const path = pick(paths);
    let node = data.state;
    for (const key of path.slice(0, -1)) node = node[key];
    pick(damage)(node, path.at(-1));
    const label = `state.${path.join('.')}`;
    let loaded;
    try {
      loaded = Game.load(content, data);
    } catch (error) {
      assert.match(error.message, /^save\.(invalid|content)$/, `${label}: ${error.message}`);
      refused += 1;
      continue;
    }
    assert.doesNotThrow(() => loaded.run(45), label);
  }
  assert.ok(refused > 10, `only ${refused} of 80 damaged saves were refused`);
});
