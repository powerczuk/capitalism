// Brand: advertising builds a product's brand rating, time erodes it,
// and products that sell well stay in people's minds on their own.

import { fail } from '../engine/game.js';
import { clamp } from '../engine/util.js';
import { overdraftLimit } from './accounting.js';
import { baseDemand } from './market.js';
import { DAYS_PER_MONTH } from '../engine/calendar.js';

/** Brand points one month of advertising adds at the given budget. */
export function adEffect(game, budget, brand) {
  const B = game.content.balance.brand;
  let pop = 0;
  for (const id of game.state.cityOrder) pop += game.state.cities[id].pop;
  const effective = (budget * B.popRef) / Math.max(pop, 1);
  return B.adGain * Math.sqrt(effective / B.adScale) * (1 - brand / 100);
}

function runMonthly(game) {
  const { state, content } = game;
  const B = content.balance.brand;

  // National demand per product this month (for market-share based organic growth).
  const national = {};
  for (const product of content.consumerProducts) {
    let d = 0;
    for (const id of state.cityOrder) d += baseDemand(game, state.cities[id], product);
    national[product.id] = d * DAYS_PER_MONTH;
  }

  for (const id of state.companyOrder) {
    const co = state.companies[id];
    if (!co.alive) continue;
    const canPay = co.cash > -overdraftLimit(game, co);
    const ids = new Set([...Object.keys(co.brand), ...Object.keys(co.ads), ...Object.keys(co.sold)]);
    for (const pid of ids) {
      let brand = (co.brand[pid] ?? 0) * (1 - B.decay);
      const budget = co.ads[pid] || 0;
      if (budget > 0 && canPay) {
        co.cash -= budget;
        co.m.ads += budget;
        brand += adEffect(game, budget, brand);
      }
      const sold = co.sold[pid] || 0;
      if (sold > 0 && national[pid] > 0) {
        const sharePct = Math.min(100, (100 * sold) / national[pid]);
        brand += B.organic * sharePct * (1 - brand / 100);
      }
      brand = clamp(brand, 0, 100);
      if (brand < 0.05 && !budget) delete co.brand[pid];
      else co.brand[pid] = brand;
    }
    co.sold = {};
  }
}

export const brandSystem = {
  id: 'brand',
  order: 66, // before finance, so the spend lands in the month it belongs to
  monthly: runMonthly,
};

export const brandCommands = [
  {
    id: 'setAds',
    /** params: { product, budget } — monthly advertising budget for one product (0 = stop) */
    check(game, co, { product, budget }) {
      const p = game.content.products.find(product);
      if (!p || p.type !== 'consumer') return fail('err.badProduct');
      if (typeof budget !== 'number' || !(budget >= 0) || budget > game.content.balance.brand.maxBudget) return fail('err.badValue');
      return null;
    },
    run(game, co, { product, budget }) {
      const amount = Math.round(budget);
      if (amount > 0) co.ads[product] = amount;
      else delete co.ads[product];
      return {};
    },
  },
];
