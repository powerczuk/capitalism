// Stock market: every company is listed. Prices follow fundamentals
// (book value and earnings) with some noise; companies can trade each
// other's shares, issue new ones, buy their own back, pay dividends and —
// with a controlling stake — take a rival over.

import { fail } from '../engine/game.js';
import { equityOf, trailingProfit } from './accounting.js';
import { dissolveCompany, publicFloat, stakeOf } from './company.js';

const PRICE_HISTORY = 120;

/** What one share ought to be worth. */
export function fundamentalValue(game, co) {
  const S = game.content.balance.stock;
  const book = equityOf(game, co) / co.shares.total;
  if (book <= 0) return 0.05;
  // A company without a track record trades at book value.
  if (co.reports.length < 3) return book;
  const eps = trailingProfit(co) / co.shares.total;
  const pe = S.pe * game.state.economy.index ** 2;
  const earnings = Math.max(-0.5 * book, eps * pe);
  const value = Math.max(0.25 * book, 0.55 * book + 0.45 * earnings);
  return value * (1 + Math.min(0.15, co.div * 0.3));
}

export const marketCap = (co) => co.price * co.shares.total;

/** Cash needed to buy `qty` shares of `target` on the market (large orders move the price). */
export function tradeCost(game, target, qty) {
  const S = game.content.balance.stock;
  return qty * target.price * (1 + (S.tradeImpact * qty) / target.shares.total);
}

/** Cash received for selling `qty` shares of `target`. */
export function tradeProceeds(game, target, qty) {
  const S = game.content.balance.stock;
  return qty * target.price * Math.max(0.5, 1 - (S.tradeImpact * qty) / target.shares.total);
}

/** Price of buying out everybody else once `buyer` controls `target`. */
export function takeoverCost(game, buyer, target) {
  const S = game.content.balance.stock;
  const rest = target.shares.total - (target.shares.held[buyer.id] || 0);
  return rest * target.price * S.takeoverPremium;
}

/** Shareholder structure of a company. */
export function holdersOf(game, co) {
  const total = co.shares.total;
  const out = [{ id: 'founder', qty: co.shares.founder, share: co.shares.founder / total }];
  for (const id in co.shares.held) {
    const qty = co.shares.held[id];
    if (qty > 0) out.push({ id, qty, share: qty / total });
  }
  const pub = publicFloat(co);
  out.push({ id: 'public', qty: pub, share: pub / total });
  return out;
}

const stockEnabled = (game) => game.state.settings.stockMarket !== false;
const validQty = (q) => Number.isInteger(q) && q > 0;

function movePrice(game, co, signedQty) {
  const S = game.content.balance.stock;
  co.price = Math.max(0.01, co.price * (1 + (S.tradeImpact * signedQty) / co.shares.total));
}

function absorb(game, buyer, target) {
  const { state } = game;
  // Net assets move to the buyer.
  for (const b of game.buildingsOf(target.id)) {
    b.co = buyer.id;
    b.no = ++buyer.seq;
  }
  buyer.cash += target.cash;
  buyer.loan += target.loan;
  for (const pid in target.tech) buyer.tech[pid] = Math.max(buyer.tech[pid] ?? 0, target.tech[pid]);
  for (const pid in target.brand) buyer.brand[pid] = Math.max(buyer.brand[pid] ?? 0, target.brand[pid] * 0.8);
  for (const pid in target.sold) buyer.sold[pid] = (buyer.sold[pid] || 0) + target.sold[pid];
  // The target's stakes in third companies move too.
  for (const id of state.companyOrder) {
    const other = state.companies[id];
    if (!other.alive || other === buyer || other === target) continue;
    const qty = other.shares.held[target.id];
    if (qty) other.shares.held[buyer.id] = (other.shares.held[buyer.id] || 0) + qty;
    if (target.basis[id]) buyer.basis[id] = (buyer.basis[id] || 0) + target.basis[id];
  }
  // Shares the target held in the buyer itself are cancelled.
  const selfHeld = buyer.shares.held[target.id];
  if (selfHeld) buyer.shares.total -= selfHeld;
  // Goods on shelves keep their maker: re-label them to the new owner of the brand.
  for (const b of Object.values(state.buildings)) {
    if (!b.slots) continue;
    for (const s of b.slots) if (s && s.by === target.id) s.by = buyer.id;
  }
  game.invalidate();
}

export const stockCommands = [
  {
    id: 'buyShares',
    /** params: { target, qty } — buy shares of another company on the market */
    check(game, co, { target: targetId, qty }) {
      if (!stockEnabled(game)) return fail('err.stockDisabled');
      const target = game.state.companies[targetId];
      if (!target?.alive || target === co) return fail('err.badTarget');
      if (!validQty(qty)) return fail('err.badValue');
      if (qty > publicFloat(target)) return fail('err.noFloat');
      const cost = tradeCost(game, target, qty);
      if (co.cash < cost) return fail('err.noCash', { need: cost });
      return null;
    },
    run(game, co, { target: targetId, qty }) {
      const S = game.content.balance.stock;
      const target = game.state.companies[targetId];
      const before = stakeOf(target, co.id);
      const cost = tradeCost(game, target, qty);
      co.cash -= cost;
      target.shares.held[co.id] = (target.shares.held[co.id] || 0) + qty;
      co.basis[targetId] = (co.basis[targetId] || 0) + cost;
      movePrice(game, target, qty);
      const after = stakeOf(target, co.id);
      for (const mark of [0.1, 0.25, S.control]) {
        if (before <= mark && after > mark) {
          game.news(
            'news.stake',
            { company: co.name, target: target.name, pct: Math.round(after * 100) },
            { tone: target.human ? 'bad' : 'info', co: target.id },
          );
          break;
        }
      }
      return { cost };
    },
  },

  {
    id: 'sellShares',
    /** params: { target, qty } */
    check(game, co, { target: targetId, qty }) {
      const target = game.state.companies[targetId];
      if (!target?.alive || target === co) return fail('err.badTarget');
      if (!validQty(qty) || qty > (target.shares.held[co.id] || 0)) return fail('err.badValue');
      return null;
    },
    run(game, co, { target: targetId, qty }) {
      const target = game.state.companies[targetId];
      const held = target.shares.held[co.id];
      const proceeds = tradeProceeds(game, target, qty);
      const basis = ((co.basis[targetId] || 0) * qty) / held;
      co.cash += proceeds;
      co.m.invest += proceeds - basis;
      co.basis[targetId] = (co.basis[targetId] || 0) - basis;
      if (held - qty <= 0) {
        delete target.shares.held[co.id];
        delete co.basis[targetId];
      } else {
        target.shares.held[co.id] = held - qty;
      }
      movePrice(game, target, -qty);
      return { proceeds };
    },
  },

  {
    id: 'issueShares',
    /** params: { qty } — sell new shares to the public (raises cash, dilutes control) */
    check(game, co, { qty }) {
      const S = game.content.balance.stock;
      if (!stockEnabled(game)) return fail('err.stockDisabled');
      if (!validQty(qty)) return fail('err.badValue');
      if (qty > co.shares.total * S.issueMaxShare) return fail('err.issueTooBig');
      if (game.state.day - co.lastIssue < S.issueCooldown) return fail('err.issueCooldown');
      return null;
    },
    run(game, co, { qty }) {
      const S = game.content.balance.stock;
      const proceeds = qty * co.price * (1 - S.issueDiscount);
      co.cash += proceeds;
      co.shares.total += qty;
      co.lastIssue = game.state.day;
      movePrice(game, co, -qty);
      game.news('news.issue', { company: co.name, qty }, { co: co.id });
      return { proceeds };
    },
  },

  {
    id: 'buyback',
    /** params: { qty } — buy own shares from the public and cancel them */
    check(game, co, { qty }) {
      if (!stockEnabled(game)) return fail('err.stockDisabled');
      if (!validQty(qty)) return fail('err.badValue');
      if (qty > publicFloat(co)) return fail('err.noFloat');
      const cost = tradeCost(game, co, qty);
      if (co.cash < cost) return fail('err.noCash', { need: cost });
      return null;
    },
    run(game, co, { qty }) {
      const cost = tradeCost(game, co, qty);
      co.cash -= cost;
      co.shares.total -= qty;
      movePrice(game, co, qty);
      return { cost };
    },
  },

  {
    id: 'setDividend',
    /** params: { ratio } — share of yearly profit paid out to shareholders (0-0.9) */
    check(game, co, { ratio }) {
      return typeof ratio === 'number' && ratio >= 0 && ratio <= 0.9 ? null : fail('err.badValue');
    },
    run(game, co, { ratio }) {
      co.div = Math.round(ratio * 100) / 100;
      return {};
    },
  },

  {
    id: 'takeover',
    /** params: { target } — buy out a company you control and merge it into yours */
    check(game, co, { target: targetId }) {
      const S = game.content.balance.stock;
      if (!stockEnabled(game) || game.state.settings.takeovers === false) return fail('err.takeoversDisabled');
      const target = game.state.companies[targetId];
      if (!target?.alive || target === co) return fail('err.badTarget');
      if (stakeOf(target, co.id) <= S.control) return fail('err.noControl');
      const cost = takeoverCost(game, co, target);
      if (co.cash < cost) return fail('err.noCash', { need: cost });
      return null;
    },
    run(game, co, { target: targetId }) {
      const { state, content } = game;
      const S = content.balance.stock;
      const target = state.companies[targetId];
      const cost = takeoverCost(game, co, target);
      const targetEquity = equityOf(game, target);
      const payout = target.price * S.takeoverPremium;
      co.cash -= cost;
      // Other corporate shareholders are bought out at the premium price.
      for (const id in target.shares.held) {
        if (id === co.id) continue;
        const holder = state.companies[id];
        if (!holder?.alive) continue;
        const cashIn = target.shares.held[id] * payout;
        holder.cash += cashIn;
        holder.m.invest += cashIn - (holder.basis[targetId] || 0);
      }
      // Paying more (or less) than book value shows up as a one-off item.
      co.m.other += targetEquity - cost - (co.basis[targetId] || 0);
      absorb(game, co, target);
      dissolveCompany(game, target, { keepBuildings: true });
      target.acquiredBy = co.id;
      game.news('news.takeover', { company: co.name, target: target.name }, { tone: target.human ? 'bad' : 'info', co: target.id });
      game.bus.emit('takeover', { buyer: co, target });
      return { cost };
    },
  },
];

export const stockSystem = {
  id: 'stocks',
  order: 80,

  daily(game) {
    const { state, content, rng } = game;
    const S = content.balance.stock;
    for (const id of state.companyOrder) {
      const co = state.companies[id];
      if (!co.alive) continue;
      const target = fundamentalValue(game, co);
      const next = co.price + (target - co.price) * S.reversion + co.price * rng.normal(0, S.volatility);
      co.price = Math.max(0.01, next);
      co.pd.push(Math.round(co.price * 1000) / 1000);
      if (co.pd.length > PRICE_HISTORY) co.pd.shift();
    }
  },

  yearly(game) {
    const { state } = game;
    for (const id of state.companyOrder) {
      const co = state.companies[id];
      if (!co.alive || !(co.div > 0)) continue;
      let profit = 0;
      for (const r of co.reports.slice(-12)) profit += r.profit;
      const total = profit * co.div;
      if (total <= 0 || co.cash < total) continue;
      const perShare = total / co.shares.total;
      co.cash -= total;
      for (const holderId in co.shares.held) {
        const holder = state.companies[holderId];
        if (!holder?.alive) continue;
        const amount = co.shares.held[holderId] * perShare;
        holder.cash += amount;
        holder.m.divIn += amount;
      }
      game.news('news.dividend', { company: co.name, perShare: Math.round(perShare * 100) / 100 }, { tone: 'good', co: co.id });
    }
  },
};
