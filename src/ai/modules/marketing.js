// Marketing: advertising budgets for the company's own-made products.

import { trailingProfit } from '../../sim/accounting.js';
import { ownBrandRevenue } from '../analysis.js';

const STEP = 5_000;

export const marketingModule = {
  id: 'marketing',
  order: 90,
  run(ctx) {
    const { game, co, profile, persona } = ctx;
    const { content } = game;
    const revenue = ownBrandRevenue(game, co);
    const plan = {};
    let total = 0;
    for (const product of content.consumerProducts) {
      const r = revenue[product.id] || 0;
      if (r < 120_000) continue;
      // Spend more where buyers care about the brand.
      const raw = r * profile.adRate * (product.weights.brand / 0.25) * persona.w.ads;
      const budget = Math.min(600_000, Math.round(raw / STEP) * STEP);
      if (budget >= STEP) {
        plan[product.id] = budget;
        total += budget;
      }
    }
    // Advertising must stay affordable: at most about a third of monthly profit.
    const ceiling = Math.max(0, (trailingProfit(co) / 12) * 0.35);
    const scale = total > ceiling ? ceiling / total : 1;
    for (const product of content.consumerProducts) {
      const wanted = Math.floor(((plan[product.id] || 0) * scale) / STEP) * STEP;
      const current = co.ads[product.id] || 0;
      if (wanted !== current) ctx.act('setAds', { product: product.id, budget: wanted });
    }
  },
};
