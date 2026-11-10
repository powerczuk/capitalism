import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { equityOf } from '../src/sim/accounting.js';
import { diagnose } from '../src/sim/diagnostics.js';
import { buildingCounts } from '../src/sim/stats.js';

const content = createContent();
const LEVELS = content.difficulties.ids();

function league(seed, years, levels = LEVELS, extra = {}) {
  const game = Game.create(content, {
    seed,
    cityCount: 4,
    player: null,
    rivals: levels.map((level) => ({ level, persona: 'merchant' })),
    ...extra,
  });
  game.aiLog = [];
  game.run(years * 360);
  return game;
}

test('ai: every difficulty level and personality is well-formed', () => {
  const moduleIds = new Set(content.aiModules.ids());
  for (const level of content.difficulties.all()) {
    for (const id of Object.keys(level.cadence)) assert.ok(moduleIds.has(id), `${level.id}: unknown module "${id}" in cadence`);
    assert.ok(level.name.pl && level.name.en && level.desc.pl && level.desc.en);
    assert.ok(level.projects.length > 0);
  }
  for (const persona of content.personalities.all()) {
    for (const key of ['retail', 'industry', 'raw', 'rnd', 'ads', 'finance', 'price', 'risk']) {
      assert.ok(persona.w[key] > 0, `${persona.id}.w.${key}`);
    }
  }
});

test('ai: plays by the rules — commands succeed and nobody goes broke early', () => {
  const game = league('rules', 3);
  const failed = game.aiLog.filter((e) => !e.ok);
  const rate = failed.length / game.aiLog.length;
  assert.ok(game.aiLog.length > 100, 'the AI is active');
  assert.ok(rate < 0.02, `too many rejected AI commands: ${failed.length}/${game.aiLog.length} e.g. ${JSON.stringify(failed[0])}`);
  for (const co of game.companies()) {
    assert.ok(co.alive, `${co.name} survives three years`);
    assert.ok(buildingCounts(game, co.id).retail > 0, `${co.name} (${co.ai.level}) opened stores`);
    assert.ok(Number.isFinite(equityOf(game, co)));
  }
});

test('ai: a game is fully deterministic', () => {
  const a = league('same', 2);
  const b = league('same', 2);
  assert.deepEqual(a.state, b.state);
});

test('ai: stronger levels build bigger companies', () => {
  const totals = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const seed of ['ladder-1', 'ladder-2', 'ladder-3']) {
    const game = league(seed, 6, LEVELS, { takeovers: false });
    for (const co of game.state.companyOrder.map((id) => game.state.companies[id])) {
      totals[co.ai.level] += co.alive ? equityOf(game, co) : 0;
    }
  }
  const { novice, manager, shark, tycoon } = totals;
  assert.ok(manager > novice * 1.5, `manager (${manager}) should clearly beat novice (${novice})`);
  assert.ok(shark > manager * 1.2, `shark (${shark}) should beat manager (${manager})`);
  assert.ok(tycoon > manager * 1.5, `tycoon (${tycoon}) should clearly beat manager (${manager})`);
  // The two top levels can swap places in a single short game; over many
  // seeds the tycoon wins (see `npm run sim -- --runs 8`). Here we only make
  // sure it is never far behind.
  assert.ok(tycoon > shark * 0.8, `tycoon (${tycoon}) should keep up with shark (${shark})`);
});

test('ai: strong levels integrate vertically, weak ones do not', () => {
  const game = league('vertical', 5);
  const by = Object.fromEntries(game.state.companyOrder.map((id) => [game.state.companies[id].ai.level, game.state.companies[id]]));
  assert.equal(buildingCounts(game, by.novice.id).producer, 0);
  assert.ok(buildingCounts(game, by.tycoon.id).producer > 0);
  assert.ok(Object.keys(by.tycoon.brand).length > 0, 'the tycoon builds brands');
  assert.equal(Object.keys(by.novice.ads).length, 0);
});

test('ai: keeps its own house in order', () => {
  const game = league('tidy', 4, ['shark', 'tycoon']);
  for (const co of game.companies()) {
    const problems = diagnose(game, co).filter((d) => d.level === 'bad');
    const shelves = game.buildingsOf(co.id).reduce((n, b) => n + (b.slots ? b.slots.filter(Boolean).length : 0), 0);
    assert.ok(problems.length <= shelves * 0.05 + 2, `${co.name}: ${problems.length} serious problems, e.g. ${JSON.stringify(problems[0])}`);
  }
});

test('ai: the pricing assistant manages shelves a human hands over', () => {
  const game = Game.create(content, { seed: 'assistant', cityCount: 3, player: { name: 'Ja' }, rivals: [], events: false });
  const me = game.human;
  const city = game.cities()[0];
  const store = game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'center' }).building;
  game.exec(me.id, 'setSlot', { building: store, slot: 0, product: 'bread', price: 0.3 });
  game.exec(me.id, 'setSlot', { building: store, slot: 1, product: 'cheese', price: 0.3 });
  game.exec(me.id, 'setSlotAuto', { building: store, slot: 0, auto: true });
  game.run(120);
  const [auto, manual] = game.state.buildings[store].slots;
  assert.ok(auto.price > auto.uc, 'the assistant never sells below cost');
  assert.equal(manual.price, 0.3, 'manual shelves are left alone');
});
