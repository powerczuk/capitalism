import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { equityOf } from '../src/sim/accounting.js';
import { publicFloat, stakeOf } from '../src/sim/company.js';
import { holdersOf, takeoverCost, tradeCost } from '../src/sim/stocks.js';

const content = createContent();

function twoCompanies(options = {}) {
  const game = Game.create(content, { seed: 'stocks', cityCount: 3, player: { name: 'Raider' }, rivals: [{ level: 'novice' }], events: false, ...options });
  const me = game.human;
  const target = game.companies().find((c) => !c.human);
  target.ai = null; // passive target
  return { game, me, target };
}

test('shares: structure adds up and trading moves the price', () => {
  const { game, me, target } = twoCompanies();
  const holders = holdersOf(game, target);
  assert.equal(holders.reduce((s, h) => s + h.qty, 0), target.shares.total);
  const price = target.price;
  const cost = tradeCost(game, target, 100_000);
  assert.ok(cost > 100_000 * price, 'large orders pay a premium');
  assert.ok(game.exec(me.id, 'buyShares', { target: target.id, qty: 100_000 }).ok);
  assert.ok(target.price > price);
  assert.equal(stakeOf(target, me.id), 0.1);
  assert.equal(game.exec(me.id, 'buyShares', { target: target.id, qty: 10_000_000 }).error, 'err.noFloat');
  assert.equal(game.exec(me.id, 'buyShares', { target: me.id, qty: 10 }).error, 'err.badTarget');
  const cash = me.cash;
  assert.ok(game.exec(me.id, 'sellShares', { target: target.id, qty: 100_000 }).ok);
  assert.ok(me.cash > cash);
  assert.equal(target.shares.held[me.id], undefined);
  assert.ok(me.m.invest < 0, 'buying and selling at once loses the spread');
});

test('shares: issuing raises cash and dilutes, buying back does the opposite', () => {
  const { game, me } = twoCompanies();
  const founder = () => me.shares.founder / me.shares.total;
  const before = founder();
  const cash = me.cash;
  assert.equal(game.exec(me.id, 'issueShares', { qty: me.shares.total }).error, 'err.issueTooBig');
  assert.ok(game.exec(me.id, 'issueShares', { qty: 200_000 }).ok);
  assert.ok(me.cash > cash && founder() < before);
  assert.equal(game.exec(me.id, 'issueShares', { qty: 1000 }).error, 'err.issueCooldown');
  assert.ok(game.exec(me.id, 'buyback', { qty: 300_000 }).ok);
  assert.ok(founder() > before);
  assert.equal(game.exec(me.id, 'buyback', { qty: publicFloat(me) + 1 }).error, 'err.noFloat');
});

test('takeover: needs control, then merges the target into the buyer', () => {
  const { game, me, target } = twoCompanies();
  me.cash = 5e8;
  const city = game.cities()[0];
  const store = game.exec(target.id, 'build', { type: 'supermarket', city: city.id, district: 'suburb' }).building;
  assert.equal(game.exec(me.id, 'takeover', { target: target.id }).error, 'err.noControl');
  let guard = 0;
  while (stakeOf(target, me.id) <= content.balance.stock.control && guard++ < 50) {
    const qty = Math.min(60_000, publicFloat(target));
    assert.ok(game.exec(me.id, 'buyShares', { target: target.id, qty }).ok);
  }
  assert.ok(stakeOf(target, me.id) > 0.5);
  assert.ok(game.state.news.some((n) => n.k === 'news.stake'));
  const cost = takeoverCost(game, me, target);
  const targetCash = target.cash;
  const cash = me.cash;
  assert.ok(game.exec(me.id, 'takeover', { target: target.id }).ok);
  assert.ok(Math.abs(me.cash - (cash - cost + targetCash)) < 1);
  assert.equal(target.alive, false);
  assert.equal(target.acquiredBy, me.id);
  assert.equal(game.state.buildings[store].co, me.id, 'buildings change owner');
  assert.ok(Number.isFinite(equityOf(game, me)));
  game.run(30); // the merged world keeps running
});

test('takeover: can be switched off in the game settings', () => {
  const { game, me, target } = twoCompanies({ takeovers: false });
  me.cash = 5e8;
  while (stakeOf(target, me.id) <= 0.5) game.exec(me.id, 'buyShares', { target: target.id, qty: Math.min(60_000, publicFloat(target)) });
  assert.equal(game.exec(me.id, 'takeover', { target: target.id }).error, 'err.takeoversDisabled');
});

test('takeover: a human player who is bought out loses the game', () => {
  const game = Game.create(content, { seed: 'prey', cityCount: 3, player: { name: 'Prey' }, rivals: [{ level: 'novice' }], events: false });
  const me = game.human;
  const raider = game.companies().find((c) => !c.human);
  raider.ai = null;
  raider.cash = 5e8;
  while (stakeOf(me, raider.id) <= 0.5) game.exec(raider.id, 'buyShares', { target: me.id, qty: Math.min(60_000, publicFloat(me)) });
  assert.ok(game.exec(raider.id, 'takeover', { target: me.id }).ok);
  game.tick();
  assert.equal(game.state.outcome?.reason, 'takeover');
});

test('dividends: paid from yearly profit to corporate shareholders', () => {
  const { game, me, target } = twoCompanies();
  me.cash = 1e8;
  game.exec(me.id, 'buyShares', { target: target.id, qty: 200_000 });
  assert.equal(game.exec(target.id, 'setDividend', { ratio: 2 }).error, 'err.badValue');
  game.exec(target.id, 'setDividend', { ratio: 0.5 });
  // Give the target a profitable year on paper.
  game.run(359);
  for (const r of target.reports) r.profit = 1_000_000;
  target.m.other += 0;
  game.tick();
  const paid = me.reports.at(-1).divIn + me.m.divIn;
  assert.ok(paid > 0, 'the shareholder received a dividend');
  assert.ok(game.state.news.some((n) => n.k === 'news.dividend'));
});
