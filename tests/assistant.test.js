// The pricing assistant of shelves on "auto": it has to react to supply, to
// demand and to what the competition charges — smoothly, and never below cost.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { MODS } from '../src/mods/index.js';
import { ASSISTANT_STEP, assistantAdvice, supplyOf } from '../src/ai/assistant.js';
import { refPrice, slotCapacity } from '../src/sim/market.js';
import { SUP } from '../src/sim/supply.js';
import { addModifier } from '../src/sim/world.js';

const PRODUCT = 'bread';

/**
 * A town with one store of the player's selling bread on "auto", and a rival
 * that only does what the test tells it to.
 * @param {object} [opts] `content` to play with other rules; `big` for the largest city of the country instead of the smallest
 */
function town({ content = createContent(), seed = 'assistant', big = false } = {}) {
  const game = Game.create(content, { seed, cityCount: 6, player: { name: 'Ja', color: 1 }, rivals: [{ level: 'novice' }], events: false });
  const me = game.human;
  const rival = game.companies().find((c) => c !== me);
  rival.ai = null;
  me.cash = 2e9;
  rival.cash = 2e9;
  const bySize = [...game.cities()].sort((a, b) => a.pop - b.pop);
  const city = big ? bySize.at(-1) : bySize[0];
  const build = (co, district) => {
    const built = game.exec(co.id, 'build', { type: 'supermarket', city: city.id, district });
    assert.ok(built.ok, `build in ${district}: ${built.error}`);
    return built.building;
  };
  const store = build(me, 'residential');
  const w = {
    game,
    content,
    me,
    rival,
    city,
    store,
    build,
    run(days) {
      for (let i = 0; i < days; i++) game.tick();
    },
    get shelf() {
      return game.state.buildings[store].slots[0];
    },
    /** The player's price as a multiple of the usual price. */
    get level() {
      return this.shelf.price / refPrice(game, city, content.products.get(PRODUCT));
    },
    open() {
      this.run(50); // the store is built
      assert.ok(game.exec(me.id, 'setSlot', { building: store, slot: 0, product: PRODUCT }).ok);
      assert.ok(game.exec(me.id, 'setSlotAuto', { building: store, slot: 0, auto: true }).ok);
      this.run(30);
      return this;
    },
  };
  return w;
}

test('assistant: what a shelf can count on selling follows what actually reaches it', () => {
  const cap = 1000;
  assert.deepEqual(supplyOf({ so: 0, s: 400 }, cap), { rate: cap, tight: 0 }, 'a shelf that never runs empty can sell all it can serve');
  assert.deepEqual(supplyOf({ so: 0.6, s: null }, cap), { rate: cap, tight: 0 }, 'nothing is known yet');
  const short = supplyOf({ so: 0.9, s: 300 }, cap);
  assert.ok(short.tight === 1 && Math.abs(short.rate - 309) < 1e-9, `a shelf that is nearly always empty sells what arrives (${short.rate})`);
  let last = cap + 1;
  for (const so of [0.05, 0.1, 0.2, 0.3, 0.5, 1]) {
    const { rate } = supplyOf({ so, s: 300 }, cap);
    assert.ok(rate <= last && rate >= 300, `the emptier the shelf, the less it counts on (${so}: ${rate})`);
    last = rate;
  }
  assert.ok(supplyOf({ so: 1, s: 5000 }, cap).rate <= cap, 'never more than the shelf can serve');
});

test('assistant: demand — the price climbs with a fashion and comes down when it passes', () => {
  // In the biggest city one store cannot serve everybody who wants bread.
  const w = town({ big: true }).open();
  const before = w.level;
  assert.equal(w.shelf.why, 'queue', 'the shelf sells all it can serve, and says so');
  addModifier(w.game, { kind: 'demand', key: PRODUCT, factor: 1.5, days: 40 });
  w.run(1);
  assert.ok(w.level > before * 1.03, `the very next day the price is up (${before.toFixed(3)} → ${w.level.toFixed(3)})`);
  w.run(6);
  const high = w.level;
  assert.ok(high > before * 1.08, `within a week it has followed the demand up (${high.toFixed(3)})`);
  w.run(34 + 14); // the fashion ends after 40 days
  assert.ok(Math.abs(w.level / before - 1) < 0.03, `two weeks after it ended the price is back (${w.level.toFixed(3)} vs ${before.toFixed(3)})`);
});

test('assistant: demand — customers the shelf has room for do not change the price', () => {
  // In the smallest town the shelf is not full: a fashion that still leaves
  // it room brings more sales at the same price, not a dearer loaf.
  const w = town().open();
  const cap = slotCapacity(w.game, w.game.state.buildings[w.store], w.content.products.get(PRODUCT));
  assert.ok(w.shelf.s < cap * 0.9, `the shelf has room to spare (${Math.round(w.shelf.s)} of ${Math.round(cap)})`);
  assert.equal(w.shelf.why, 'alone', 'no other company sells bread here, and the shelf says so');
  const before = w.level;
  const sold = w.shelf.s;
  addModifier(w.game, { kind: 'demand', key: PRODUCT, factor: 1.1, days: 40 });
  w.run(20);
  assert.ok(Math.abs(w.level / before - 1) < 0.02, `the price stays (${before.toFixed(3)} → ${w.level.toFixed(3)})`);
  assert.ok(w.shelf.s > sold * 1.05, `and more is sold (${Math.round(sold)} → ${Math.round(w.shelf.s)})`);
});

test('assistant: competition — a rival with room to spare pulls the price down, a dear one lets it up', () => {
  const w = town();
  const theirs = ['residential', 'suburb', 'center'].map((district) => w.build(w.rival, district));
  w.open();
  const alone = w.level;
  const ref = () => refPrice(w.game, w.city, w.content.products.get(PRODUCT));
  const rivalAt = (m) => {
    for (const id of theirs) {
      const has = w.game.state.buildings[id].slots[0];
      const done = has
        ? w.game.exec(w.rival.id, 'setSlotPrice', { building: id, slot: 0, price: ref() * m })
        : w.game.exec(w.rival.id, 'setSlot', { building: id, slot: 0, product: PRODUCT, price: ref() * m });
      assert.ok(done.ok, done.error);
    }
  };
  rivalAt(1);
  w.run(1);
  const first = w.level;
  assert.ok(first < alone * 0.97, `the day after the rival opens, the price is down (${alone.toFixed(3)} → ${first.toFixed(3)})`);
  w.run(10);
  const facing = w.level;
  assert.equal(w.shelf.why, 'rival', 'and the shelf says it is priced against the competition');
  rivalAt(0.75);
  w.run(3);
  const undercut = w.level;
  assert.ok(undercut < facing * 0.985, `a cheaper rival pulls it down further (${facing.toFixed(3)} → ${undercut.toFixed(3)})`);
  rivalAt(1.6);
  w.run(10);
  assert.ok(w.level > facing * 1.02, `a dear rival lets it rise again (${undercut.toFixed(3)} → ${w.level.toFixed(3)})`);
  assert.ok(w.level < alone * 1.02, 'though not above what it was with no rival at all');
});

/**
 * A town whose rules let only so much stay on the player's shelf after the
 * day's deliveries (`w.limit`), and can mark the supplier as short.
 */
function shortTown() {
  const knob = { limit: Infinity, store: null, status: null };
  const shortMod = {
    id: 'assistant-test-short-supply',
    install(c) {
      c.systems.register({
        id: 'assistant-test-short-supply',
        order: 55, // after supply (50), before retail (60)
        daily(game) {
          const slot = game.state.buildings[knob.store]?.slots?.[0];
          if (!slot) return;
          if (slot.qty > knob.limit) slot.qty = knob.limit;
          if (knob.status != null) slot.sup = knob.status;
        },
      });
    },
  };
  const w = town({ content: createContent({ mods: [...MODS, shortMod] }) });
  knob.store = w.store;
  w.knob = knob;
  return w;
}

test('assistant: supply — when an own line cannot fill the shelf the price rises until demand fits, and falls when supply is back', () => {
  const w = shortTown();
  // the shelf is fed by a line of the player's own factory
  const plant = w.game.exec(w.me.id, 'build', { type: 'factory', city: w.city.id, district: 'industrial' }).building;
  w.run(90);
  const recipe = w.content.recipesFor(PRODUCT).find((r) => r.building === 'factory');
  assert.ok(w.game.exec(w.me.id, 'setLine', { building: plant, line: 0, recipe: recipe.id }).ok);
  w.run(20);
  assert.ok(w.game.exec(w.me.id, 'setSlot', { building: w.store, slot: 0, product: PRODUCT, src: `${plant}:0` }).ok);
  assert.ok(w.game.exec(w.me.id, 'setSlotAuto', { building: w.store, slot: 0, auto: true }).ok);
  w.run(30);
  const plenty = w.level;
  assert.notEqual(w.shelf.why, 'short');
  const cap = slotCapacity(w.game, w.game.state.buildings[w.store], w.content.products.get(PRODUCT));
  w.knob.limit = cap * 0.35; // a third of what the shelf could sell arrives
  w.run(3);
  assert.ok(w.shelf.so > 0.2, 'the shelf starts running empty');
  w.run(25);
  const scarce = w.level;
  assert.equal(w.shelf.why, 'short', 'the shelf says supply is what holds the price');
  assert.ok(scarce > plenty * 1.1, `the price has risen (${plenty.toFixed(3)} → ${scarce.toFixed(3)})`);
  // …to about where customers ask for what arrives, not three times as much
  assert.ok(w.shelf.d < w.knob.limit * 1.35, `demand at the shelf (${Math.round(w.shelf.d)}) is near what reaches it (${Math.round(w.knob.limit)})`);
  w.knob.limit = Infinity;
  w.run(40);
  assert.ok(Math.abs(w.level / plenty - 1) < 0.04, `with supply back the price returns (${w.level.toFixed(3)} vs ${plenty.toFixed(3)})`);
  assert.notEqual(w.shelf.why, 'short');
});

test('assistant: supply — an outside supplier that cannot keep up is named, but the price is not driven up', () => {
  // Suppliers share out what they have by the size of the orders, and a
  // dearer shelf orders less: raising the price would only shrink the share.
  const w = shortTown().open(); // fed by imports, as far as the rules know
  const plenty = w.level;
  const cap = slotCapacity(w.game, w.game.state.buildings[w.store], w.content.products.get(PRODUCT));
  w.knob.limit = cap * 0.35;
  w.knob.status = SUP.SHORT; // …and the supplier reports that it could not deliver everything
  w.run(30);
  assert.ok(w.shelf.so > 0.5, 'the shelf keeps running empty');
  assert.equal(w.shelf.why, 'starved', 'the shelf says the supplier is the trouble');
  assert.ok(Math.abs(w.level / plenty - 1) < 0.04, `the price is held (${plenty.toFixed(3)} → ${w.level.toFixed(3)})`);
});

test('assistant: it moves a step a day, never sells near cost, and leaves manual shelves alone', () => {
  const w = town();
  const theirs = w.build(w.rival, 'residential');
  w.open();
  const ref = refPrice(w.game, w.city, w.content.products.get(PRODUCT));
  // a second shelf, priced by hand
  assert.ok(w.game.exec(w.me.id, 'setSlot', { building: w.store, slot: 1, product: 'cheese', price: 123.45 }).ok);
  const prices = [w.shelf.price];
  w.game.exec(w.rival.id, 'setSlot', { building: theirs, slot: 0, product: PRODUCT, price: ref * 0.5 });
  for (let day = 0; day < 20; day++) {
    w.run(1);
    prices.push(w.shelf.price);
    if (day === 9) addModifier(w.game, { kind: 'demand', key: PRODUCT, factor: 3, days: 5 });
  }
  for (let i = 1; i < prices.length; i++) {
    const change = Math.abs(prices[i] / prices[i - 1] - 1);
    assert.ok(change <= ASSISTANT_STEP + 0.006, `day ${i}: the price moved ${(change * 100).toFixed(1)} % in one day`);
    assert.ok(Number.isFinite(prices[i]) && prices[i] >= w.shelf.uc * 1.049, `day ${i}: ${prices[i]} is above cost (${w.shelf.uc})`);
  }
  assert.equal(w.game.state.buildings[w.store].slots[1].price, 123.45, 'a shelf priced by hand keeps its price');
  assert.equal(w.game.state.buildings[w.store].slots[1].why, undefined);
  assert.equal(w.game.state.buildings[theirs].slots[0].price, ref * 0.5, "nobody touches the rival's price");
});

test('assistant: its notes say what it did, survive a save, and go when the shelf is taken back', () => {
  const w = town().open();
  const slot = w.shelf;
  assert.ok(slot.aim > 0 && typeof slot.why === 'string', 'the shelf knows where its price is heading and why');
  addModifier(w.game, { kind: 'demand', key: PRODUCT, factor: 1.4, days: 30 });
  w.run(2);
  assert.ok(slot.moved >= w.game.state.day - 2 && slot.from > 0 && slot.from < slot.price, 'the last change is on record');
  const advice = assistantAdvice(w.game, w.me, w.game.state.buildings[w.store], 0);
  assert.ok(advice.target > 0 && ['short', 'starved', 'queue', 'rival', 'alone'].includes(advice.cause));

  const loaded = Game.load(w.content, JSON.parse(JSON.stringify(w.game.save())));
  const kept = loaded.state.buildings[w.store].slots[0];
  assert.deepEqual([kept.aim, kept.why, kept.from, kept.moved], [slot.aim, slot.why, slot.from, slot.moved], 'a saved game keeps them');
  loaded.tick();
  w.game.tick();
  assert.equal(loaded.state.buildings[w.store].slots[0].price, w.shelf.price, 'and carries on exactly as the game it was saved from');

  assert.ok(w.game.exec(w.me.id, 'setSlotAuto', { building: w.store, slot: 0, auto: false }).ok);
  const price = w.shelf.price;
  assert.deepEqual([w.shelf.aim, w.shelf.why, w.shelf.from, w.shelf.moved], [undefined, undefined, undefined, undefined]);
  w.run(10);
  assert.equal(w.shelf.price, price, 'a shelf taken back from the assistant keeps the price it was left with');
});

test('assistant: computer players are not helped by it', () => {
  const content = createContent();
  const game = Game.create(content, { seed: 'assistant-ai', cityCount: 4, player: null, rivals: [{ level: 'tycoon' }, { level: 'novice' }], events: false });
  game.run(200);
  for (const b of Object.values(game.state.buildings)) {
    for (const slot of b.slots ?? []) if (slot) assert.equal(slot.aim, undefined, 'no shelf of a computer player carries the assistant’s notes');
  }
});
