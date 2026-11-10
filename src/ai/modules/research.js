// Research: build a lab when own-made products earn enough to justify it,
// and point the lab teams at the products where quality pays best.

import { buildCost } from '../../sim/construction.js';
import { techOf } from '../../sim/supply.js';
import { freePlots } from '../../sim/world.js';
import { ownBrandRevenue } from '../analysis.js';

/**
 * Consumer products ranked by how much better technology would earn.
 * Own-made goods count in full; high-tech goods the company only resells
 * count for half — mastering them is the way into making them.
 */
function targets(ctx) {
  const { game, co } = ctx;
  const { content } = game;
  const revenue = ownBrandRevenue(game, co);
  for (const b of game.buildingsOf(co.id)) {
    if (b.kind !== 'retail') continue;
    for (const slot of b.slots) {
      if (!slot || slot.by === co.id || !slot.last) continue;
      if (content.products.get(slot.product).techShare >= 0.6 && content.recipesFor(slot.product).length) {
        revenue[slot.product] = (revenue[slot.product] || 0) + slot.last.rev * 0.5;
      }
    }
  }
  const out = [];
  for (const pid in revenue) {
    if (revenue[pid] < 60_000) continue;
    const product = content.products.get(pid);
    const tech = techOf(game, co, pid);
    out.push({
      productId: pid,
      revenue: revenue[pid],
      value: revenue[pid] * product.weights.quality * product.techShare * (1 - tech / 100),
    });
  }
  return out.sort((a, b) => b.value - a.value);
}

const labBuildings = (ctx) => ctx.game.buildingsOf(ctx.co.id).filter((b) => b.kind === 'research');

export const researchModule = {
  id: 'research',
  order: 100,

  run(ctx) {
    const { game, profile, persona } = ctx;
    const G = game.content.balance.research;
    const list = targets(ctx);
    let next = 0;
    for (const b of labBuildings(ctx)) {
      for (let i = 0; i < b.labs.length; i++) {
        const target = list[next++];
        const lab = b.labs[i];
        if (!target) {
          if (lab) ctx.act('clearLab', { building: b.id, lab: i });
          continue;
        }
        const raw = target.revenue * profile.rndRate * persona.w.rnd;
        const budget = Math.min(G.maxBudget, 300_000, Math.max(30_000, Math.round(raw / 10_000) * 10_000));
        if (!lab || lab.product !== target.productId || Math.abs(lab.budget - budget) / budget > 0.2) {
          ctx.act('setLab', { building: b.id, lab: i, product: target.productId, budget });
        }
      }
    }
  },

  propose(ctx, budget) {
    const { game, profile, persona } = ctx;
    if (!profile.projects.includes('lab') || labBuildings(ctx).length) return [];
    const type = game.content.buildingTypes.filter((t) => t.kind === 'research')[0];
    if (!type) return [];
    const list = targets(ctx).slice(0, type.labs);
    let value = 0;
    for (const t of list) value += t.value;
    if (value <= 0) return [];
    // Cheapest suitable plot in the country — a lab works anywhere.
    let site = null;
    for (const city of game.cities()) {
      for (const districtId of type.districts) {
        if (freePlots(game, city, districtId) <= 0) continue;
        const cost = buildCost(game, type, city, districtId);
        if (cost <= budget && (!site || cost < site.cost)) site = { city, districtId, cost };
      }
    }
    if (!site) return [];
    // Rule of thumb: research pays back slowly but for good — a year of it is
    // taken to be worth about half of the monthly "value at stake", every month.
    const yearly = value * 12 * 0.5 * persona.w.rnd - type.upkeep * 12;
    const roi = yearly / site.cost;
    return [
      {
        kind: 'lab',
        cost: site.cost,
        profitDay: yearly / 360,
        roi,
        score: roi,
        execute: (c) => c.act('build', { type: type.id, city: site.city.id, district: site.districtId }).ok,
      },
    ];
  },
};
