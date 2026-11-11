import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { assetsOf, creditLimit, equityOf } from '../src/sim/accounting.js';
import { buildCost, upgradeCost } from '../src/sim/construction.js';
import { diagnose } from '../src/sim/diagnostics.js';
import { importPrice, lineSrc, listSources, quote, SUP } from '../src/sim/supply.js';
import { freePlots, plotsOf } from '../src/sim/world.js';
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

test('build: every building gets a numbered plot of its district', () => {
  const { game, me, city } = newGame();
  me.cash = 1e9;
  const build = (params) => game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'residential', ...params });
  const lotOf = (result) => game.state.buildings[result.building].lot;
  const plots = plotsOf(content, city, 'residential');
  assert.equal(lotOf(build()), 0, 'the best free plot by default');
  assert.equal(lotOf(build({ lot: 3 })), 3, 'or the one that was asked for');
  assert.equal(build({ lot: 3 }).error, 'err.lotTaken');
  for (const lot of [-1, 1.5, plots, '2', NaN]) assert.equal(build({ lot }).error, 'err.badLot', String(lot));
  const second = build();
  assert.equal(lotOf(second), 1);
  // Another district numbers its plots separately.
  assert.equal(lotOf(game.exec(me.id, 'build', { type: 'supermarket', city: city.id, district: 'center' })), 0);
  // A demolished building frees its plot.
  assert.ok(game.exec(me.id, 'demolish', { building: second.building }).ok);
  assert.equal(lotOf(build()), 1);
  // Games saved before plots were numbered get them on loading, oldest building first.
  const data = JSON.parse(JSON.stringify(game.save()));
  for (const b of Object.values(data.state.buildings)) delete b.lot;
  const loaded = Game.load(content, data);
  const lots = Object.values(loaded.state.buildings)
    .filter((b) => b.district === 'residential')
    .map((b) => b.lot)
    .sort();
  assert.deepEqual(lots, [0, 1, 2]);
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

test('supply: a supplier cannot rewrite the bill after the deal', () => {
  const game = Game.create(content, { seed: 'bill', cityCount: 3, player: { name: 'Seller' }, rivals: [{ level: 'novice' }], events: false });
  const me = game.human;
  const other = game.companies().find((c) => !c.human);
  other.ai = null;
  me.cash = 1e8;
  other.cash = 1e8;
  const city = game.cities()[0];
  const plant = game.exec(me.id, 'build', { type: 'factory', city: city.id, district: 'industrial' }).building;
  game.exec(me.id, 'setLine', { building: plant, line: 0, recipe: 'bread', sell: true, price: 0.6 });
  const store = game.exec(other.id, 'build', { type: 'supermarket', city: city.id, district: 'residential' }).building;
  const src = lineSrc(plant, 0);
  assert.ok(game.exec(other.id, 'setSlot', { building: store, slot: 0, product: 'bread', src }).ok);
  const slot = game.state.buildings[store].slots[0];
  const line = game.state.buildings[plant].lines[0];
  const market = importPrice(game, content.products.get('bread'));
  assert.ok(Math.abs(slot.cap - 0.6 * (1 + content.balance.wholesale.tolerance)) < 1e-9, 'the customer agreed to the price it saw');
  game.run(120);
  assert.equal(slot.by, me.id);

  // Absurd prices are not prices at all…
  for (const price of [1e7, 1e308, Infinity, NaN, -1, 0, '7', true]) {
    assert.equal(game.exec(me.id, 'setLineSale', { building: plant, line: 0, price }).error, 'err.badPrice', String(price));
  }
  // …and a merely outrageous one stops the deliveries instead of emptying the customer's account.
  assert.ok(game.exec(me.id, 'setLineSale', { building: plant, line: 0, price: 60_000 }).ok);
  const cash = other.cash;
  const revenue = line.rev;
  slot.qty = 0; // the shelf is empty and would order a full load
  game.run(3);
  assert.equal(slot.sup, SUP.PRICE);
  assert.equal(line.rev, revenue, 'nothing was sold at the new price');
  assert.ok(other.cash > cash - 1e6, `the customer lost ${Math.round(cash - other.cash)}`);
  assert.ok(diagnose(game, other).some((d) => d.code === 'shelfPriceUp'));

  // A rise within the agreed margin, or up to what imports cost anyway, goes through.
  assert.ok(game.exec(me.id, 'setLineSale', { building: plant, line: 0, price: 0.66 }).ok);
  slot.qty = 0;
  game.run(2);
  assert.notEqual(slot.sup, SUP.PRICE);
  assert.ok(market > slot.cap, 'bread is imported for more than the agreed ceiling');
  assert.ok(game.exec(me.id, 'setLineSale', { building: plant, line: 0, price: market * 0.99 }).ok);
  slot.qty = 0;
  game.run(2);
  assert.notEqual(slot.sup, SUP.PRICE, 'the going market price needs no new handshake');
  assert.ok(game.exec(me.id, 'setLineSale', { building: plant, line: 0, price: market * 1.3 }).ok);
  slot.qty = 0;
  game.run(2);
  assert.equal(slot.sup, SUP.PRICE);

  // Choosing the same supplier again accepts its new price.
  assert.ok(game.exec(other.id, 'setSlotSource', { building: store, slot: 0, src }).ok);
  slot.qty = 0;
  game.run(2);
  assert.notEqual(slot.sup, SUP.PRICE);
  assert.ok(Math.abs(slot.cap - market * 1.3 * (1 + content.balance.wholesale.tolerance)) < 1e-9);

  // Own lines and imports carry no agreed price.
  assert.ok(game.exec(other.id, 'setSlotSource', { building: store, slot: 0, src: 'import' }).ok);
  assert.equal(slot.cap, null);
});

test('ai: a supplier that raises its price loses the AI customer at once', () => {
  const game = Game.create(content, { seed: 'gouge', cityCount: 3, player: { name: 'Seller' }, rivals: [{ level: 'manager', persona: 'merchant' }], events: false });
  const me = game.human;
  const other = game.companies().find((c) => !c.human);
  me.cash = 1e8;
  const city = game.cities()[0];
  const plant = game.exec(me.id, 'build', { type: 'factory', city: city.id, district: 'industrial' }).building;
  game.exec(me.id, 'setLine', { building: plant, line: 0, recipe: 'bread', sell: true, price: 0.5 });
  const src = lineSrc(plant, 0);
  // Give the AI a bread shelf on the player's line, then let it run its own business for a while.
  const store = game.exec(other.id, 'build', { type: 'supermarket', city: city.id, district: 'residential' }).building;
  game.run(80);
  assert.ok(game.exec(other.id, 'setSlot', { building: store, slot: 0, product: 'bread', src }).ok);
  game.run(30);
  const shelves = () =>
    game
      .buildingsOf(other.id)
      .flatMap((b) => b.slots || [])
      .filter((s) => s && s.src === src);
  assert.ok(shelves().length > 0, 'the AI buys the cheap bread');
  assert.ok(game.exec(me.id, 'setLineSale', { building: plant, line: 0, price: 50_000 }).ok);
  const cash = other.cash;
  game.run(4);
  assert.equal(shelves().length, 0, 'every shelf moved to another source');
  assert.ok(other.cash > cash - 2e6, 'and the AI did not pay the new price');
  game.run(60);
  assert.equal(other.alive, true);
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
