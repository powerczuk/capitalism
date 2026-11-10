import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { allocate, appeal, forecast, marketSnapshot, pullOf, rating, refPrice } from '../src/sim/market.js';

const content = createContent();
const R = content.balance.retail;
const bread = content.products.get('bread');
const handbag = content.products.get('handbag');

test('rating: cheaper, better and better-known goods rate higher', () => {
  const base = rating(R, bread, 1, 1, 40, 10);
  assert.ok(rating(R, bread, 1, 0.8, 40, 10) > base);
  assert.ok(rating(R, bread, 1, 1.2, 40, 10) < base);
  assert.ok(rating(R, bread, 1, 1, 60, 10) > base);
  assert.ok(rating(R, bread, 1, 1, 40, 50) > base);
  // Dumping below half the reference price gains nothing more.
  assert.equal(rating(R, bread, 1, 0.4, 40, 10), rating(R, bread, 1, 0.5, 40, 10));
});

test('rating: staples are more price-sensitive than luxuries', () => {
  const drop = (product) => rating(R, product, 1, 1.3, 40, 20) / rating(R, product, 1, 1, 40, 20);
  assert.ok(drop(bread) < drop(handbag));
  // …and brand matters more for a handbag than for bread.
  const lift = (product) => appeal(product, 40, 60) / appeal(product, 40, 10);
  assert.ok(lift(handbag) > lift(bread));
});

test('allocate: never sells more than demand, stock or capacity', () => {
  const offers = [
    { pull: 2, cap: 100, stock: 1000 },
    { pull: 1, cap: 1000, stock: 30 },
    { pull: 1, cap: 1000, stock: 1000 },
  ];
  allocate(R, 600, offers, 1);
  const sold = offers.reduce((s, o) => s + o.units, 0);
  assert.ok(sold <= 600 + 1e-9);
  assert.equal(offers[0].units, 100);
  assert.equal(offers[0].limited, 'cap');
  assert.equal(offers[1].units, 30);
  assert.equal(offers[1].limited, 'stock');
  assert.equal(offers[2].limited, null);
  // The unconstrained store picks up part of the customers the others turned away.
  assert.ok(offers[2].units > offers[2].potential);
  assert.ok(offers[2].units <= 1000);
});

test('allocate: with no constraints, shares follow pull', () => {
  const offers = [
    { pull: 3, cap: 1e9, stock: 1e9 },
    { pull: 1, cap: 1e9, stock: 1e9 },
  ];
  allocate(R, 1000, offers, 1);
  assert.ok(Math.abs(offers[0].units - 600) < 1e-9);
  assert.ok(Math.abs(offers[1].units - 200) < 1e-9);
});

function worldWithStore() {
  const game = Game.create(content, { seed: 'market', cityCount: 3, player: { name: 'T' }, rivals: [] });
  const me = game.human;
  me.cash = 1e9;
  const city = game.cities()[0];
  const built = game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'residential' });
  game.exec(me.id, 'setSlot', { building: built.building, slot: 0, product: 'bread' });
  game.run(80);
  return { game, me, city, store: game.state.buildings[built.building] };
}

test('forecast: agrees with what the simulation then does', () => {
  const { game, city, store } = worldWithStore();
  const slot = store.slots[0];
  const snap = marketSnapshot(game, city.id, 'bread');
  const offer = snap.offers[0];
  const f = forecast(game, snap, { price: slot.price, quality: offer.quality, brand: offer.brand, factor: offer.pull / pullOf(R, offer.rating, 1), cap: offer.cap }, offer.key);
  game.tick();
  const soldToday = slot.units; // month-to-date after one more day… compare with the smoothed figure instead
  assert.ok(soldToday > 0);
  assert.ok(Math.abs(f.units - slot.s) / slot.s < 0.05, `forecast ${f.units} vs actual ${slot.s}`);
});

test('forecast: a lower price sells more, a second own store cannibalises the first', () => {
  const { game, me, city, store } = worldWithStore();
  const snap = marketSnapshot(game, city.id, 'bread');
  const ref = refPrice(game, city, bread);
  const base = { quality: 40, brand: 10, factor: 1, cap: 1e9 };
  const cheap = forecast(game, snap, { ...base, price: ref * 0.8 });
  const dear = forecast(game, snap, { ...base, price: ref * 1.2 });
  assert.ok(cheap.units > dear.units);
  const aware = forecast(game, snap, { ...base, price: ref }, null, me.id);
  assert.ok(aware.ownLoss >= 0);
  assert.ok(store.slots.length > 0);

  // A sibling shelf that is not capacity-bound loses customers to the new one.
  const open = {
    product: bread,
    ref: 1,
    demand: 1000,
    local: { pull: 1 },
    offers: [{ key: 'b1:0', co: me.id, pull: 1, cap: 1e9, price: 1, slot: { uc: 0.5 } }],
  };
  const lost = forecast(game, open, { price: 1, quality: 40, brand: 10, factor: 1, cap: 1e9 }, null, me.id);
  assert.ok(lost.ownLoss > 0);
  assert.equal(forecast(game, open, { price: 1, quality: 40, brand: 10, factor: 1, cap: 1e9 }, null, 'someone-else').ownLoss, 0);
});
