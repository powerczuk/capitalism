import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Rng } from '../src/engine/rng.js';
import { Registry } from '../src/engine/registry.js';
import { Content } from '../src/engine/content.js';
import { EventBus } from '../src/engine/events.js';
import { dateOf, isMonthEnd, isYearEnd, START_YEAR } from '../src/engine/calendar.js';
import { blend, ema, hashString, roundSig } from '../src/engine/util.js';
import { createContent, Game } from '../src/setup.js';

test('rng: same seed gives the same stream, state lives in the holder', () => {
  const a = { rng: 123 };
  const b = { rng: 123 };
  const ra = new Rng(a);
  const rb = new Rng(b);
  const seqA = Array.from({ length: 50 }, () => ra.next());
  const seqB = Array.from({ length: 50 }, () => rb.next());
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every((x) => x >= 0 && x < 1));
  // Resuming from a copied state continues the same stream.
  const resumed = new Rng({ rng: a.rng });
  assert.equal(resumed.next(), ra.next());
});

test('rng: helpers stay in range', () => {
  const r = new Rng({ rng: 7 });
  for (let i = 0; i < 200; i++) {
    const n = r.int(3, 6);
    assert.ok(n >= 3 && n <= 6 && Number.isInteger(n));
    assert.ok(r.noise(0.5) >= 0.2);
  }
  assert.equal(r.pick([]), undefined);
  assert.equal(r.weighted(['a', 'b'], (x) => (x === 'b' ? 1 : 0)), 'b');
  assert.deepEqual([...r.shuffle([1, 2, 3, 4])].sort(), [1, 2, 3, 4]);
});

test('registry: rejects duplicates unless overriding, strict and lenient lookups', () => {
  const reg = new Registry('thing');
  reg.register({ id: 'a', v: 1 });
  assert.throws(() => reg.register({ id: 'a' }), /already registered/);
  reg.register({ id: 'a', v: 2 }, { override: true });
  assert.equal(reg.get('a').v, 2);
  assert.equal(reg.find('missing'), undefined);
  assert.throws(() => reg.get('missing'), /Unknown thing/);
  assert.throws(() => reg.register({}), /needs a string "id"/);
  reg.extend('a', { v: 3 });
  assert.equal(reg.all()[0].v, 3);
});

test('event bus: on/emit/unsubscribe', () => {
  const bus = new EventBus();
  const seen = [];
  const off = bus.on('x', (p) => seen.push(p));
  bus.emit('x', 1);
  off();
  bus.emit('x', 2);
  assert.deepEqual(seen, [1]);
});

test('calendar: 30-day months and 360-day years', () => {
  assert.deepEqual(dateOf(1), { year: START_YEAR, yearIndex: 0, month: 0, dom: 1 });
  assert.deepEqual(dateOf(30), { year: START_YEAR, yearIndex: 0, month: 0, dom: 30 });
  assert.deepEqual(dateOf(31), { year: START_YEAR, yearIndex: 0, month: 1, dom: 1 });
  assert.deepEqual(dateOf(361), { year: START_YEAR + 1, yearIndex: 1, month: 0, dom: 1 });
  assert.ok(isMonthEnd(30) && !isMonthEnd(31) && isYearEnd(360) && !isYearEnd(180));
});

test('util: numeric helpers', () => {
  assert.equal(ema(null, 10, 0.5), 10);
  assert.equal(ema(10, 20, 0.5), 15);
  assert.equal(blend(0, 99, 5, 7), 7);
  assert.equal(blend(10, 1, 10, 3), 2);
  assert.equal(roundSig(123456, 3), 123000);
  assert.equal(roundSig(0.012345, 2), 0.012);
  assert.equal(hashString('abc'), hashString('abc'));
  assert.notEqual(hashString('abc'), hashString('abd'));
});

test('content: derives costs, prices and rates from recipes', () => {
  const content = createContent();
  const wheat = content.products.get('wheat');
  const flour = content.products.get('flour');
  const bread = content.products.get('bread');
  assert.ok(flour.cost > wheat.cost, 'processing adds value');
  assert.ok(bread.price > bread.cost, 'retail price above wholesale cost');
  assert.ok(bread.demand > 0);
  const w = bread.weights;
  assert.ok(Math.abs(w.price + w.quality + w.brand - 1) < 1e-9, 'weights are normalised');
  assert.ok(content.recipes.get('bread').rate > 0);
  assert.equal(content.recipes.get('wheat').raw, true);
});

test('content: a broken mod fails loudly at start-up', () => {
  const broken = {
    id: 'broken',
    install(c) {
      c.recipes.register({ id: 'ghost', building: 'factory', output: 'no_such_product', inputs: {} });
    },
  };
  assert.throws(() => createContent({ mods: [broken] }), /unknown product "no_such_product"/);
});

test('content: tune() deep-merges balance numbers', () => {
  const c = new Content();
  c.tune({ a: { x: 1, y: 2 }, list: [1, 2] });
  c.tune({ a: { y: 3 }, list: [9] });
  assert.deepEqual(c.balance, { a: { x: 1, y: 3 }, list: [9] });
});

test('game: unknown commands and dead companies are rejected politely', () => {
  const content = createContent();
  const game = Game.create(content, { seed: 't', player: { name: 'T' }, rivals: [] });
  assert.deepEqual(game.exec(game.human.id, 'noSuchCommand'), { ok: false, error: 'err.unknownCommand', params: { type: 'noSuchCommand' } });
  assert.equal(game.exec('nobody', 'borrow', { amount: 1 }).error, 'err.noCompany');
});

test('game: save and load give identical futures', () => {
  const content = createContent();
  const options = { seed: 'replay', cityCount: 3, player: null, rivals: [{ level: 'manager' }, { level: 'shark' }] };
  const a = Game.create(content, options);
  a.run(200);
  const b = Game.load(content, JSON.parse(JSON.stringify(a.save())));
  a.run(200);
  b.run(200);
  assert.deepEqual(b.state, a.state);
  assert.throws(() => Game.load(content, { state: { v: 999, companies: {}, cities: {} } }), /save\.version/);
  assert.throws(() => Game.load(content, { nonsense: true }), /save\.invalid/);
});

test('game: the same seed builds the same world, another seed a different one', () => {
  const content = createContent();
  const make = (seed) => Game.create(content, { seed, cityCount: 5, player: { name: 'T' }, rivals: [{ level: 'novice' }] });
  assert.deepEqual(make('alpha').state.cities, make('alpha').state.cities);
  assert.notDeepEqual(make('alpha').state.cities, make('beta').state.cities);
});
