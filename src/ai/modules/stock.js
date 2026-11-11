// Stock market: defend against raiders, buy back cheap shares and — for the
// most dangerous level — stalk and take over weaker rivals.

import { equityOf } from '../../sim/accounting.js';
import { publicFloat, stakeOf } from '../../sim/company.js';
import { fundamentalValue, marketCap, takeoverCost, tradeCost } from '../../sim/stocks.js';

const MIN_LOT = 1000;

/** Largest number of shares of `target` that `cash` buys (price impact included). */
function affordable(game, target, cash, limit) {
  const lot = Math.max(1, Math.min(MIN_LOT, limit)); // the last shares needed may be fewer than a lot
  let qty = Math.min(limit, Math.floor(cash / (target.price * 1.05)));
  while (qty >= lot && tradeCost(game, target, qty) > cash) qty = Math.floor(qty * 0.9);
  return qty >= lot ? qty : 0;
}

function finishTakeovers(ctx, rivals) {
  const { game, co } = ctx;
  const S = game.content.balance.stock;
  for (const target of rivals) {
    if (stakeOf(target, co.id) <= S.control) continue;
    if (ctx.fund(takeoverCost(game, co, target)) && ctx.act('takeover', { target: target.id }).ok) return true;
  }
  return false;
}

/** Shares of `co` in the hands of its largest corporate shareholder. */
function largestStake(co, rivals) {
  let held = 0;
  for (const other of rivals) held = Math.max(held, co.shares.held[other.id] || 0);
  return held;
}

/**
 * Would cancelling `qty` shares leave the company out of a raider's reach?
 * A buyback shrinks the share count, so every stake grows with it — the
 * founder's and the raider's alike.
 */
function safeAfterBuyback(game, co, rivals, qty) {
  const S = game.content.balance.stock;
  const total = co.shares.total - qty;
  if (co.shares.founder / total > S.control) return true;
  // Otherwise nobody may be able to cross the line: not now, not with what is left on the market.
  return (largestStake(co, rivals) + publicFloat(co) - qty) / total <= S.control;
}

/**
 * A raider is circling: put the company out of reach with a buyback. Only one
 * that gets all the way there helps — a smaller one would hand the raider a
 * bigger stake for free.
 */
function defend(ctx, rivals) {
  const { game, co } = ctx;
  const S = game.content.balance.stock;
  if (largestStake(co, rivals) / co.shares.total < 0.15 || co.shares.founder / co.shares.total > S.control) return false;
  const qty = Math.min(publicFloat(co), Math.floor(co.shares.total - co.shares.founder / S.control) + 1);
  if (qty < 1 || !safeAfterBuyback(game, co, rivals, qty)) return false;
  return ctx.fund(tradeCost(game, co, qty)) && ctx.act('buyback', { qty }).ok;
}

function choosePrey(ctx, rivals) {
  const { game, co, persona } = ctx;
  const S = game.content.balance.stock;
  const means = Math.max(0, ctx.freeCash()) + ctx.borrowRoom();
  const mine = equityOf(game, co);
  let best = null;
  for (const target of rivals) {
    if (target.shares.founder / target.shares.total >= S.control) continue; // founder keeps control
    const price = marketCap(target) * S.takeoverPremium * 1.1; // rough cost of the whole operation
    const worth = equityOf(game, target);
    // Only clearly weaker companies that the market undervalues are worth a raid.
    if (price > means * persona.w.finance || worth < price * 0.8 || mine < worth * 2.5) continue;
    const bargain = worth / price;
    if (!best || bargain > best.bargain) best = { target, bargain };
  }
  return best?.target ?? null;
}

function hunt(ctx, rivals) {
  const { game, co, mem } = ctx;
  const S = game.content.balance.stock;
  let prey = mem.prey ? game.state.companies[mem.prey] : null;
  if (!prey?.alive) {
    prey = game.state.day > 1080 ? choosePrey(ctx, rivals) : null; // let everyone get established first
    mem.prey = prey?.id ?? null;
  }
  if (!prey) return false;
  const held = prey.shares.held[co.id] || 0;
  const need = Math.floor(prey.shares.total * S.control) + 1 - held;
  if (need <= 0) return false; // control reached: finishTakeovers() closes the deal
  const float = publicFloat(prey);
  if (float < need) {
    mem.prey = null; // not enough shares on the market — look elsewhere
    return false;
  }
  const tranche = Math.min(need, Math.floor(prey.shares.total * 0.08));
  const cash = Math.max(0, ctx.freeCash()) + ctx.borrowRoom();
  const qty = affordable(game, prey, cash, tranche);
  if (!qty) return false;
  return ctx.fund(tradeCost(game, prey, qty)) && ctx.act('buyShares', { target: prey.id, qty }).ok;
}

function buyBackCheap(ctx, rivals) {
  const { game, co } = ctx;
  const S = game.content.balance.stock;
  if (co.price > fundamentalValue(game, co) * 0.75) return false;
  const spare = ctx.freeCash() - ctx.reserve() * 2;
  if (spare <= 0) return false;
  const qty = affordable(game, co, spare * 0.5, Math.floor(publicFloat(co) * 0.2));
  // Never shrink the share count so far that a shareholder ends up in control.
  if (qty > 0 && largestStake(co, rivals) / (co.shares.total - qty) > S.control) return false;
  return qty > 0 && ctx.act('buyback', { qty }).ok;
}

/** Sell holdings that are not part of a takeover when cash runs short. */
function raiseCash(ctx, rivals) {
  const { co, mem } = ctx;
  if (co.cash > ctx.reserve() * 0.5) return false;
  for (const target of rivals) {
    const held = target.shares.held[co.id] || 0;
    if (held > 0 && target.id !== mem.prey) return ctx.act('sellShares', { target: target.id, qty: held }).ok;
  }
  return false;
}

export const stockModule = {
  id: 'stock',
  order: 110,
  run(ctx) {
    const { game, co, profile } = ctx;
    const settings = game.state.settings;
    if (settings.stockMarket === false) return;
    const rivals = game.companies().filter((c) => c !== co);
    const takeovers = settings.takeovers !== false;
    if (takeovers && finishTakeovers(ctx, rivals)) return;
    if (defend(ctx, rivals)) return;
    if (raiseCash(ctx, rivals)) return;
    if (profile.rank < 3) return; // weaker levels only defend themselves
    if (takeovers && profile.raider && hunt(ctx, rivals)) return;
    buyBackCheap(ctx, rivals);
  },
};
