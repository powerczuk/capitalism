// Stores: propose new stores and upgrades of busy ones.

import { DAYS_PER_MONTH } from '../../engine/calendar.js';
import { slotCapacityFor } from '../../sim/market.js';
import { buildCost, upgradeCost } from '../../sim/construction.js';
import { freePlots, wageIndex } from '../../sim/world.js';
import { evaluateStore } from '../analysis.js';

function buildStore(ctx, plan) {
  const built = ctx.act('build', { type: plan.type.id, city: plan.city.id, district: plan.districtId });
  if (!built.ok) return false;
  plan.picks.forEach((pick, i) => {
    const set = ctx.act('setSlot', { building: built.building, slot: i, product: pick.productId, src: pick.src, price: pick.price });
    if (set.ok) ctx.reserveLine(pick.source, pick.units);
  });
  return true;
}

function proposeStores(ctx, budget, projects) {
  const { game, persona } = ctx;
  const { content } = game;
  for (const type of content.buildingTypes.all()) {
    if (type.kind !== 'retail') continue;
    for (const city of game.cities()) {
      for (const districtId of type.districts) {
        if (freePlots(game, city, districtId) <= 0) continue;
        if (buildCost(game, type, city, districtId) > budget) continue;
        const plan = evaluateStore(ctx, type, city, districtId);
        if (!plan.picks.length) continue;
        projects.push({
          kind: 'store',
          cost: plan.cost,
          profitDay: plan.profitDay,
          roi: plan.roi,
          score: plan.roi * persona.w.retail,
          execute: (c) => buildStore(c, plan),
        });
      }
    }
  }
}

function proposeUpgrades(ctx, budget, projects) {
  const { game, co, persona } = ctx;
  const { content, state } = game;
  const B = content.balance;
  for (const b of game.buildingsOf(co.id)) {
    if (b.kind !== 'retail' || !game.isReady(b) || b.up) continue;
    const type = content.buildingTypes.get(b.type);
    if (b.level >= type.maxLevel) continue;
    const cost = upgradeCost(game, b);
    if (cost > budget) continue;
    const shelves = b.slots.filter(Boolean);
    if (!shelves.length) continue;
    let crowded = 0;
    let gain = 0;
    for (const slot of shelves) {
      crowded += slot.cl;
      const product = content.products.get(slot.product);
      const now = slotCapacityFor(game, type, b.level, product);
      const next = slotCapacityFor(game, type, b.level + 1, product);
      const demand = slot.d ?? 0;
      gain += (Math.min(demand, next) - Math.min(demand, now)) * Math.max(0, slot.price - slot.uc);
    }
    if (crowded / shelves.length < 0.5) continue;
    // The extra shelf is assumed to earn about as much as an average one.
    gain += gain / shelves.length;
    const district = content.districts.get(b.district);
    const upkeepDay = (type.upkeep * wageIndex(game, state.cities[b.city]) * district.upkeep * B.building.upkeepPerLevel) / DAYS_PER_MONTH;
    const profitDay = gain * ctx.noise() - upkeepDay;
    const roi = (profitDay * 360) / cost;
    projects.push({
      kind: 'upgrade',
      cost,
      profitDay,
      roi,
      score: roi * persona.w.retail,
      execute: (c) => c.act('upgrade', { building: b.id }).ok,
    });
  }
}

export const storesModule = {
  id: 'stores',
  order: 60,
  propose(ctx, budget) {
    const projects = [];
    if (ctx.profile.projects.includes('store')) proposeStores(ctx, budget, projects);
    if (ctx.profile.projects.includes('upgrade')) proposeUpgrades(ctx, budget, projects);
    return projects;
  },
};
