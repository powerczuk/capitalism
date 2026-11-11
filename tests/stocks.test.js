import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContent, Game } from '../src/setup.js';
import { earnedWorthOf, equityOf, pretaxOf } from '../src/sim/accounting.js';
import { publicFloat, stakeOf } from '../src/sim/company.js';
import { bankrupt } from '../src/sim/finance.js';
import { goalStatus } from '../src/sim/goals.js';
import { dividendPremium, fundamentalValue, holdersOf, takeoverCost, tradeCost } from '../src/sim/stocks.js';

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

test('dividends: a promise alone does not lift the share price, a payment does', () => {
  const { game, target } = twoCompanies();
  game.run(100); // three monthly reports: the valuation now looks beyond book value
  const base = fundamentalValue(game, target);
  assert.ok(game.exec(target.id, 'setDividend', { ratio: 0.5 }).ok);
  assert.equal(fundamentalValue(game, target), base, 'declared but never paid');
  game.run(259);
  for (const r of target.reports) r.profit = 1_000_000; // a profitable year on paper
  game.tick(); // year end: the dividend is paid
  assert.equal(target.paid, 0.5);
  assert.equal(dividendPremium(target), 0.15);
  game.exec(target.id, 'setDividend', { ratio: 0 });
  assert.equal(dividendPremium(target), 0, 'withdrawing the promise ends the premium');
  game.exec(target.id, 'setDividend', { ratio: 0.5 });
  assert.equal(dividendPremium(target), 0.15);
  game.run(360); // a year without profit: nothing to pay out
  assert.equal(target.paid, 0);
  assert.equal(dividendPremium(target), 0, 'so does a year without a payment');
});

test('bankruptcy: shareholders write off what they paid for the shares', () => {
  const { game, me, target } = twoCompanies();
  me.cash = 1e8;
  const { cost } = game.exec(me.id, 'buyShares', { target: target.id, qty: 100_000 });
  assert.ok(Math.abs(me.basis[target.id] - cost) < 1e-6);
  bankrupt(game, target);
  assert.equal(target.alive, false);
  assert.equal(me.basis[target.id], undefined);
  assert.ok(Math.abs(me.m.invest + cost) < 1e-6, 'the loss shows up in the income statement');
});

test('takeover: other shareholders are paid out once, with no second write-off', () => {
  const game = Game.create(content, { seed: 'three', cityCount: 3, player: { name: 'Raider' }, rivals: [{ level: 'novice' }, { level: 'novice' }], events: false });
  const me = game.human;
  const [target, third] = game.companies().filter((c) => !c.human);
  target.ai = null;
  third.ai = null;
  me.cash = 5e8;
  third.cash = 1e8;
  const paid = game.exec(third.id, 'buyShares', { target: target.id, qty: 50_000 }).cost;
  while (stakeOf(target, me.id) <= 0.5) game.exec(me.id, 'buyShares', { target: target.id, qty: Math.min(60_000, publicFloat(target)) });
  const payout = 50_000 * target.price * content.balance.stock.takeoverPremium;
  const cash = third.cash;
  assert.ok(game.exec(me.id, 'takeover', { target: target.id }).ok);
  assert.ok(Math.abs(third.cash - cash - payout) < 1e-6);
  assert.ok(Math.abs(third.m.invest - (payout - paid)) < 1e-6, 'gain = payout minus purchase cost, booked once');
  assert.equal(third.basis[target.id], undefined);
});

test('goals: money raised by issuing shares is not earned worth', () => {
  const S = content.balance.stock;
  const game = Game.create(content, { seed: 'print', cityCount: 3, player: { name: 'Printer' }, rivals: [], events: false, goal: 'worth50' });
  const me = game.human;
  const earned = earnedWorthOf(game, me);
  let issues = 0;
  for (let i = 0; i < 12; i++) {
    if (game.exec(me.id, 'issueShares', { qty: Math.floor(me.shares.total * S.issueMaxShare) }).ok) issues += 1;
    game.run(S.issueCooldown);
  }
  assert.ok(issues >= 10);
  assert.ok(equityOf(game, me) > 50e6, 'the cash pile itself is past the target');
  assert.ok(Math.abs(earnedWorthOf(game, me) - earned) < 1e-3, 'but nothing was earned');
  assert.equal(game.state.outcome, null, 'so the goal is not reached');
  assert.ok(goalStatus(game).progress < 0.5);
  // Buying shares back returns that money and changes nothing either.
  assert.ok(game.exec(me.id, 'buyback', { qty: 100_000 }).ok);
  assert.ok(Math.abs(earnedWorthOf(game, me) - earned) < 1e-3);
});

test('takeover: the buyer’s books add up, also when the target held shares', () => {
  const game = Game.create(content, { seed: 'books', cityCount: 3, player: { name: 'Raider' }, rivals: [{ level: 'novice' }, { level: 'novice' }], events: false });
  const me = game.human;
  const [target, third] = game.companies().filter((c) => !c.human);
  target.ai = null;
  third.ai = null;
  me.cash = 5e8;
  // The target owns a slice of the buyer itself and of a third company.
  assert.ok(game.exec(target.id, 'buyShares', { target: me.id, qty: 50_000 }).ok);
  assert.ok(game.exec(target.id, 'buyShares', { target: third.id, qty: 30_000 }).ok);
  while (stakeOf(target, me.id) <= 0.5) game.exec(me.id, 'buyShares', { target: target.id, qty: Math.min(60_000, publicFloat(target)) });

  // Without buildings a company is worth its cash, less debt, plus what it paid for shares.
  const books = () => me.cash - me.loan + Object.values(me.basis).reduce((a, b) => a + b, 0);
  const before = books();
  const profit = pretaxOf(me.m);
  const shares = me.shares.total;
  assert.ok(game.exec(me.id, 'takeover', { target: target.id }).ok);
  assert.equal(me.shares.total, shares - 50_000, 'own shares that came back are cancelled');
  assert.equal(third.shares.held[me.id], 30_000, 'the stake in the third company moves to the buyer');
  assert.ok(Math.abs(me.basis[third.id] - 30_000 * third.price) < 1e-6, 'at what it is worth today');
  assert.ok(Math.abs(books() - before - (pretaxOf(me.m) - profit)) < 1e-4, 'the one-off item explains the whole change');
});
