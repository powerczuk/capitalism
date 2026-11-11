// Commands are the only door into the game state, so they have to stay shut
// for nonsense: ids that happen to be property names of every object
// ("constructor"), positions that are not positions ("length", 1.5, -1),
// numbers that are not numbers (NaN, Infinity) and values of the wrong type.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { lineSrc } from '../src/sim/supply.js';

const content = createContent();

/** Everything in a healthy state survives JSON and holds only finite numbers. */
function problems(value, path = 'state', out = []) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} = ${value}`);
  } else if (Array.isArray(value)) {
    for (const key of Object.keys(value)) if (!/^\d+$/.test(key)) out.push(`${path}.${key} is not a position`);
    value.forEach((item, i) => problems(item, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) problems(value[key], `${path}.${key}`, out);
  } else if (value === undefined || typeof value === 'function') {
    out.push(`${path} is ${typeof value}`);
  }
  return out;
}

function world() {
  const game = Game.create(content, { seed: 'hostile', cityCount: 4, player: { name: 'Testowa' }, rivals: [{ level: 'novice' }], events: false });
  const me = game.human;
  me.cash = 500e6;
  const rival = game.companies().find((c) => !c.human);
  rival.ai = null;
  const city = game.cities()[0];
  const build = (type, district) => {
    const r = game.exec(me.id, 'build', { type, city: city.id, district });
    assert.ok(r.ok, `${type}: ${r.error}`);
    return r.building;
  };
  const store = build('supermarket', 'center');
  const factory = build('factory', 'industrial');
  const lab = build('lab', 'industrial');
  game.run(80);
  assert.ok(game.exec(me.id, 'setSlot', { building: store, slot: 0, product: 'bread' }).ok);
  assert.ok(game.exec(me.id, 'setLine', { building: factory, line: 0, recipe: 'bread', sell: true }).ok);
  assert.ok(game.exec(me.id, 'setLab', { building: lab, lab: 0, product: 'bread', budget: 100_000 }).ok);
  assert.ok(game.exec(me.id, 'buyShares', { target: rival.id, qty: 1000 }).ok);
  game.run(5);
  return { game, me, rival, city, store, factory, lab };
}

const NAMES = ['constructor', '__proto__', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', 'length', 'at', 'map', ''];
const HOSTILE = [...NAMES, '0', 'b1', -1, 1.5, NaN, Infinity, -Infinity, 1e15, null, undefined, true, {}, [], () => 1];

test('commands: hostile parameters are refused without a trace', () => {
  const { game, me, rival, city, store, factory, lab } = world();
  const own = lineSrc(factory, 0);
  const baselines = {
    build: { type: 'supermarket', city: city.id, district: 'residential', lot: 3 },
    upgrade: { building: store },
    demolish: { building: lab },
    rename: { building: store, name: 'Sklep' },
    setSlot: { building: store, slot: 1, product: 'cookies', src: 'import', price: 3 },
    clearSlot: { building: store, slot: 0 },
    setSlotPrice: { building: store, slot: 0, price: 2 },
    setSlotSource: { building: store, slot: 0, src: own },
    setSlotAuto: { building: store, slot: 0, auto: true },
    setLine: { building: factory, line: 1, recipe: 'cookies', sources: { flour: 'import' }, sell: true, price: 2 },
    clearLine: { building: factory, line: 0 },
    setLineSource: { building: factory, line: 0, input: 'flour', src: 'import' },
    setLineSale: { building: factory, line: 0, sell: true, price: 1 },
    setLab: { building: lab, lab: 1, product: 'cookies', budget: 100_000 },
    clearLab: { building: lab, lab: 0 },
    setAds: { product: 'bread', budget: 50_000 },
    borrow: { amount: 100_000 },
    repay: { amount: 100_000 },
    buyShares: { target: rival.id, qty: 100 },
    sellShares: { target: rival.id, qty: 100 },
    issueShares: { qty: 1000 },
    buyback: { qty: 1000 },
    setDividend: { ratio: 0.1 },
    takeover: { target: rival.id },
    continuePlay: {},
  };
  for (const id of content.commands.ids()) assert.ok(id in baselines, `the test knows the "${id}" command`);

  const before = Object.getOwnPropertyNames(Object).length;
  let tried = 0;
  for (const [type, baseline] of Object.entries(baselines)) {
    for (const key of Object.keys(baseline)) {
      for (const value of HOSTILE) {
        const params = { ...baseline, [key]: value };
        let result;
        assert.doesNotThrow(() => {
          result = game.exec(me.id, type, params);
        }, `${type} ${key}=${String(value)}`);
        assert.equal(typeof result.ok, 'boolean');
        const found = problems(game.state);
        assert.deepEqual(found, [], `${type} ${key}=${String(value)} left ${found[0]}`);
        tried += 1;
      }
    }
    // Missing and malformed parameter objects.
    for (const params of [{}, null, 'text', 7, []]) {
      assert.doesNotThrow(() => game.exec(me.id, type, params), `${type} with ${JSON.stringify(params)}`);
    }
    assert.deepEqual(problems(game.state), [], `${type} with a malformed parameter object`);
  }
  assert.ok(tried > 1000);
  assert.equal(Object.getOwnPropertyNames(Object).length, before, 'nothing was written onto built-in objects');
  assert.equal(Object.hasOwn(Object.prototype, 'src'), false);

  // The world still runs after the storm.
  game.run(60);
  assert.deepEqual(problems(game.state), []);
});

test('commands: sources and input names cannot reach inherited properties', () => {
  const { game, me, store, factory } = world();
  const bad = ['constructor:0', '__proto__:0', ':0', `${factory}:`, `${factory}:-1`, `${factory}:1.5`, `${factory}:length`, `${factory}:99`, 'import:0', 'IMPORT', {}, 5];
  for (const src of bad) {
    assert.equal(game.exec(me.id, 'setSlotSource', { building: store, slot: 0, src }).error, 'err.badSource', `shelf source ${String(src)}`);
    assert.equal(game.exec(me.id, 'setLineSource', { building: factory, line: 0, input: 'flour', src }).error, 'err.badSource', `input source ${String(src)}`);
    assert.equal(game.exec(me.id, 'setSlot', { building: store, slot: 1, product: 'cookies', src }).error, 'err.badSource');
    assert.equal(game.exec(me.id, 'setLine', { building: factory, line: 1, recipe: 'cookies', sources: { flour: src } }).error, 'err.badSource');
  }
  for (const input of ['constructor', '__proto__', 'toString', 'wheat', '', 0, null]) {
    assert.equal(game.exec(me.id, 'setLineSource', { building: factory, line: 0, input, src: 'import' }).error, 'err.badSource', `input ${String(input)}`);
  }
  const sneaky = JSON.parse('{"__proto__":"import","constructor":"import"}');
  assert.equal(game.exec(me.id, 'setLine', { building: factory, line: 1, recipe: 'cookies', sources: sneaky }).error, 'err.badSource');
  assert.equal(game.exec(me.id, 'setLine', { building: factory, line: 1, recipe: 'cookies', price: Infinity }).error, 'err.badPrice');
  assert.equal(game.exec(me.id, 'setLineSale', { building: factory, line: 0, price: 1e9 }).error, 'err.badPrice');
  assert.deepEqual(problems(game.state), []);
});

test('new game: odd options are normalised instead of breaking the world', () => {
  const odd = [
    { cityCount: NaN },
    { cityCount: '5' },
    { cityCount: -3 },
    { cityCount: 99 },
    { cityCount: null },
    { startCash: NaN },
    { startCash: 'abc' },
    { startCash: -5 },
    { rivals: 'many' },
    { rivals: [null, 'shark', { level: 'nope', persona: 'nope', color: 99, name: { toString: null } }, { color: -1, name: '   ' }] },
    { player: { name: { a: 1 }, color: 1e9 } },
    { goal: 'constructor' },
  ];
  for (const extra of odd) {
    const label = JSON.stringify(extra, (key, value) => (typeof value === 'number' && !Number.isFinite(value) ? String(value) : value));
    let game;
    assert.doesNotThrow(() => {
      game = Game.create(content, { seed: 'odd', player: { name: 'Testowa' }, rivals: [{ level: 'novice' }], ...extra });
    }, label);
    assert.ok(game.cities().length >= 2, label);
    for (const co of game.companies()) {
      assert.ok(co.cash >= 0, label);
      assert.ok(Number.isInteger(co.color) && co.color >= 0 && co.color < 8, `${label} colour ${co.color}`);
      assert.equal(typeof co.name, 'string');
      assert.ok(co.name.trim().length > 0, label);
    }
    assert.equal(new Set(game.companies().map((c) => c.color)).size, game.companies().length, 'colours stay unique');
    assert.doesNotThrow(() => game.run(45), label);
    assert.deepEqual(problems(game.state), [], label);
  }
});

test('commands: only living companies and known commands get through', () => {
  const { game, me } = world();
  for (const who of [...NAMES, null, undefined, 0, {}]) {
    assert.equal(game.exec(who, 'borrow', { amount: 1000 }).error, 'err.noCompany', `company ${String(who)}`);
  }
  for (const type of [...NAMES, null, undefined, 0]) {
    assert.equal(game.exec(me.id, type, {}).error, 'err.unknownCommand', `command ${String(type)}`);
  }
  assert.equal(game.exec(me.id, 'borrow', null).error, 'err.badValue');
  assert.equal(game.can(me.id, 'borrow', 'text').error, 'err.badValue');
});
