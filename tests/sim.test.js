import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { assetsOf, creditLimit, equityOf } from '../src/sim/accounting.js';
import { buildCost, upgradeCost } from '../src/sim/construction.js';
import { diagnose } from '../src/sim/diagnostics.js';
import { lineSrc, listSources, quote, SUP } from '../src/sim/supply.js';
import { freePlots } from '../src/sim/world.js';
import { goalStatus } from '../src/sim/goals.js';

const content = createContent();

function newGame(extra = {}) {
  const game = Game.create(content, { seed: 'sim-test', cityCount: 4, player: { name: 'Testowa', color: 2 }, rivals: [], events: false, ...extra });
  return { game, me: game.human, city: game.cities()[0] };
}

const codes = (game, co) => diagnose(game, co).map((d) => d.code);

test('world: cities, a port and every growable resource exist', () => {
  const { game } = newGame();
  const cities = game.cities();
  assert.equal(cities.length, 4);
  assert.ok(cities.some((c) => c.port));
  for (const product of content.products.all()) {
    if (product.type !== 'raw' || !content.recipesFor(product.id).length) continue;
    assert.ok(cities.some((c) => c.res[product.id] != null), `${product.id} occurs somewhere`);
  }
  assert.equal(cities.find((c) => c.res.cocoa != null), undefined, 'cocoa is import-only');
});

test('build: costs money, takes a plot and needs time', () => {
  const { game, me, city } = newGame();
  const cash = me.cash;
  const plots = freePlots(game, city, 'center');
  const cost = buildCost(game, content.buildingTypes.get('supermarket'), city, 'center');
  const r = game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'center' });
  assert.ok(r.ok);
  assert.equal(me.cash, cash - cost);
  assert.equal(freePlots(game, city, 'center'), plots - 1);
  const b = game.state.buildings[r.building];
  assert.equal(game.isReady(b), false);
  assert.equal(equityOf(game, me), cash, 'a building is an asset, not an expense');
  game.run(content.buildingTypes.get('supermarket').buildDays);
  assert.equal(game.isReady(b), true);
});

test('build: validation', () => {
  const { game, me, city } = newGame();
  const fail = (params) => game.exec(me.id, 'build', params).error;
  assert.equal(fail({ type: 'nope', city: city.id, district: 'center' }), 'err.unknownBuilding');
  assert.equal(fail({ type: 'supermarket', city: 'nowhere', district: 'center' }), 'err.unknownCity');
  assert.equal(fail({ type: 'supermarket', city: city.id, district: 'rural' }), 'err.wrongDistrict');
  me.cash = 1000;
  assert.equal(fail({ type: 'supermarket', city: city.id, district: 'center' }), 'err.noCash');
  me.cash = 1e9;
  const noOil = game.cities().find((c) => c.res.oil == null && c.res.iron_ore == null && c.res.coal == null && c.res.sand == null);
  if (noOil) assert.equal(fail({ type: 'mine', city: noOil.id, district: 'rural' }), 'err.noResource');
  let n = 0;
  while (game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'center' }).ok) n++;
  assert.ok(n > 0);
  assert.equal(fail({ type: 'supermarket', city: city.id, district: 'center' }), 'err.noPlots');
});

test('retail: shelves validate products and sell once the store opens', () => {
  const { game, me, city } = newGame();
  const store = game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'residential' }).building;
  const set = (slot, product, extra = {}) => game.exec(me.id, 'setSlot', { building: store, slot, product, ...extra });
  assert.equal(set(0, 'laptop').error, 'err.wrongCategory');
  assert.equal(set(0, 'wheat').error, 'err.badProduct');
  assert.equal(set(99, 'bread').error, 'err.badSlot');
  assert.ok(set(0, 'bread').ok);
  assert.equal(set(1, 'bread').error, 'err.duplicateProduct');
  assert.equal(set(1, 'cheese', { src: 'b999:0' }).error, 'err.badSource');
  assert.ok(set(1, 'cheese').ok);
  const b = game.state.buildings[store];
  assert.equal(b.slots[0].src, 'import', 'imports are the default supplier');

  game.run(20);
  assert.equal(me.m.retail, 0, 'nothing sells while under construction');
  game.run(60);
  assert.ok(b.slots[0].s > 0 && b.slots[1].s > 0, 'both shelves sell');
  assert.ok(me.reports.at(-1).retail > 0);
  assert.ok(b.slots[0].qty > 0, 'stock is replenished');
  assert.equal(b.slots[0].by, 'import');
  assert.ok(codes(game, me).includes('emptyShelves'));
});

test('retail: a higher price sells fewer units', () => {
  const run = (factor) => {
    const { game, me, city } = newGame();
    const store = game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'suburb' }).building;
    game.exec(me.id, 'setSlot', { building: store, slot: 0, product: 'jam' });
    const slot = game.state.buildings[store].slots[0];
    game.exec(me.id, 'setSlotPrice', { building: store, slot: 0, price: slot.price * factor });
    game.run(120);
    return slot.d;
  };
  assert.ok(run(0.9) > run(1.0));
  assert.ok(run(1.0) > run(1.3));
});

test('production: a factory feeds own stores and beats the import price', () => {
  const { game, me, city } = newGame();
  me.cash = 1e8;
  const store = game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'residential' }).building;
  const plant = game.exec(me.id, 'build', { type: 'factory', city: city.id, district: 'industrial' }).building;
  assert.equal(game.exec(me.id, 'setLine', { building: plant, line: 0, recipe: 'wheat' }).error, 'err.badRecipe');
  assert.ok(game.exec(me.id, 'setLine', { building: plant, line: 0, recipe: 'bread' }).ok);
  assert.ok(game.exec(me.id, 'setSlot', { building: store, slot: 0, product: 'bread', src: lineSrc(plant, 0) }).ok);
  game.run(150);
  const slot = game.state.buildings[store].slots[0];
  const line = game.state.buildings[plant].lines[0];
  assert.equal(slot.by, me.id, 'the shelf carries own-made bread');
  assert.ok(line.made > 0 && line.out > 0);
  const imported = quote(game, me, city.id, 'bread', 'import');
  assert.ok(slot.uc < imported.unitCost, `own bread ${slot.uc} is cheaper than imported ${imported.unitCost}`);
  assert.ok(slot.q > 0);
  assert.ok(me.sold.bread > 0 || me.brand.bread > 0, 'selling own goods builds the brand');
});

test('production: raw recipes need the resource; quality follows the land', () => {
  const { game, me } = newGame();
  me.cash = 1e8;
  const withWheat = game.cities().find((c) => c.res.wheat != null);
  const farm = game.exec(me.id, 'build', { type: 'farm', city: withWheat.id, district: 'rural' }).building;
  assert.ok(game.exec(me.id, 'setLine', { building: farm, line: 0, recipe: 'wheat' }).ok);
  const missing = content.recipes.filter((r) => r.building === 'farm' && withWheat.res[r.output] == null)[0];
  if (missing) assert.equal(game.exec(me.id, 'setLine', { building: farm, line: 1, recipe: missing.id }).error, 'err.noResource');
  game.run(100);
  const line = game.state.buildings[farm].lines[0];
  assert.equal(Math.round(line.q), withWheat.res.wheat);
  assert.equal(line.idle, 'full', 'nobody buys, so the silo fills up');
  assert.ok(codes(game, me).includes('lineNoBuyers'));
});

test('supply: other companies can buy only what is offered for sale', () => {
  const game = Game.create(content, { seed: 'b2b', cityCount: 3, player: { name: 'A' }, rivals: [{ level: 'novice' }], events: false });
  const me = game.human;
  const other = game.companies().find((c) => !c.human);
  other.ai = null; // keep the second company passive for this test
  me.cash = 1e8;
  other.cash = 1e8;
  const city = game.cities()[0];
  const plant = game.exec(me.id, 'build', { type: 'factory', city: city.id, district: 'industrial' }).building;
  game.exec(me.id, 'setLine', { building: plant, line: 0, recipe: 'bread' });
  const store = game.exec(other.id, 'build', { type: 'supermarket', city: city.id, district: 'residential' }).building;
  const src = lineSrc(plant, 0);
  assert.equal(game.exec(other.id, 'setSlot', { building: store, slot: 0, product: 'bread', src }).error, 'err.badSource');
  assert.ok(!listSources(game, other, city.id, 'bread').some((s) => s.src === src));
  game.exec(me.id, 'setLineSale', { building: plant, line: 0, sell: true, price: 0.6 });
  assert.ok(game.exec(other.id, 'setSlot', { building: store, slot: 0, product: 'bread', src }).ok);
  game.run(140);
  assert.ok(me.reports.some((r) => r.b2b > 0), 'the seller books wholesale revenue');
  assert.equal(game.state.buildings[store].slots[0].by, me.id);
  // Withdrawing the offer leaves the customer without a supplier.
  game.exec(me.id, 'setLineSale', { building: plant, line: 0, sell: false });
  game.run(30);
  assert.equal(game.state.buildings[store].slots[0].sup, SUP.INVALID);
  assert.ok(diagnose(game, other).some((d) => d.code === 'shelfBadSource'));
});

test('upgrade and demolish', () => {
  const { game, me, city } = newGame();
  me.cash = 1e8;
  const id = game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'residential' }).building;
  const b = game.state.buildings[id];
  assert.equal(game.exec(me.id, 'upgrade', { building: id }).error, 'err.underConstruction');
  game.run(45);
  const slots = b.slots.length;
  const cost = upgradeCost(game, b);
  const cash = me.cash;
  assert.ok(game.exec(me.id, 'upgrade', { building: id }).ok);
  assert.ok(Math.abs(cash - cost - me.cash) < 1);
  assert.equal(game.exec(me.id, 'upgrade', { building: id }).error, 'err.alreadyUpgrading');
  game.run(content.balance.building.upgradeDays + 1);
  assert.equal(b.level, 2);
  assert.equal(b.slots.length, slots + 1);
  game.exec(me.id, 'rename', { building: id, name: '  Mój sklep  ' });
  assert.equal(b.name, 'Mój sklep');
  const before = me.cash;
  assert.ok(game.exec(me.id, 'demolish', { building: id }).ok);
  assert.ok(me.cash > before, 'part of the value is recovered');
  assert.equal(game.state.buildings[id], undefined);
});

test('finance: loans, interest, tax and monthly reports', () => {
  const { game, me } = newGame();
  const limit = creditLimit(game, me);
  assert.equal(game.exec(me.id, 'borrow', { amount: limit * 2 }).error, 'err.creditLimit');
  assert.ok(game.exec(me.id, 'borrow', { amount: 5_000_000 }).ok);
  assert.equal(me.loan, 5_000_000);
  game.run(30);
  const report = me.reports[0];
  assert.ok(report.interest > 0);
  assert.equal(report.tax, 0, 'no tax on a loss');
  assert.ok(me.lossCarry > 0);
  assert.ok(game.exec(me.id, 'repay', { amount: 9e9 }).ok, 'repaying more than owed just clears the loan');
  assert.equal(me.loan, 0);
  assert.equal(game.exec(me.id, 'repay', { amount: 1 }).error, 'err.noLoan');
  const a = assetsOf(game, me);
  assert.ok(Math.abs(a.total - me.cash) < 1e-6);
});

test('finance: a company that cannot pay its bills goes bankrupt and the player loses', () => {
  const { game, me, city } = newGame();
  for (let i = 0; i < 3; i++) game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'suburb' });
  me.cash = -30_000_000;
  game.run(content.balance.bankruptcy.graceDays + 5);
  assert.equal(me.alive, false);
  assert.equal(me.bankrupt, true);
  assert.equal(game.buildingsOf(me.id).length, 0);
  assert.deepEqual(game.state.outcome && { result: game.state.outcome.result, reason: game.state.outcome.reason }, { result: 'lost', reason: 'bankrupt' });
  assert.ok(game.state.news.some((n) => n.k === 'news.bankrupt'));
});

test('brand and research change what the company can offer', () => {
  const { game, me, city } = newGame();
  me.cash = 1e9;
  assert.equal(game.exec(me.id, 'setAds', { product: 'wheat', budget: 1000 }).error, 'err.badProduct');
  assert.ok(game.exec(me.id, 'setAds', { product: 'bread', budget: 100_000 }).ok);
  const lab = game.exec(me.id, 'build', { type: 'lab', city: city.id, district: 'industrial' }).building;
  assert.equal(game.exec(me.id, 'setLab', { building: lab, lab: 0, product: 'wheat', budget: 50_000 }).error, 'err.badProduct');
  assert.ok(game.exec(me.id, 'setLab', { building: lab, lab: 0, product: 'smartphone', budget: 200_000 }).ok);
  game.run(360);
  assert.ok(me.brand.bread > 20, `brand grew to ${me.brand.bread}`);
  assert.ok(me.tech.smartphone > content.balance.economy.startTech + 5, `tech grew to ${me.tech.smartphone}`);
  const year = me.reports.slice(-12);
  assert.ok(year.every((r) => r.ads === 100_000));
  assert.ok(year.some((r) => r.rnd === 200_000));
  game.exec(me.id, 'setAds', { product: 'bread', budget: 0 });
  assert.equal(me.ads.bread, undefined);
});

test('goals: reaching the target wins the game; play can continue afterwards', () => {
  const { game, me } = newGame({ goal: 'worth50' });
  assert.ok(goalStatus(game).progress < 1);
  me.cash = 60_000_000;
  game.run(10);
  assert.equal(game.state.outcome?.result, 'won');
  assert.ok(game.exec(me.id, 'continuePlay').ok);
  assert.equal(game.state.outcome, null);
  assert.equal(game.state.settings.goal, 'sandbox');
});
