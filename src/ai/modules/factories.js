// Production projects: make in-house what the company buys from outside.
//
// One generic planner serves both factories (kind 'factory') and raw-material
// sites such as farms, mines and forests (kind 'raw'):
//   1. look at what the company buys from outsiders, per product
//   2. for every recipe that makes it and every city, estimate what one
//      production line there would earn (money saved; for able managers also
//      the sales won or lost through different quality and brand)
//   3. turn the line plans into projects: a free line in an existing building,
//      or a new building running its best lines

import { clamp, roundSig } from '../../engine/util.js';
import { DAYS_PER_MONTH } from '../../engine/calendar.js';
import { appeal } from '../../sim/market.js';
import { buildCost, lineCount } from '../../sim/construction.js';
import { importPrice, linePace } from '../../sim/supply.js';
import { freePlots, wageIndex } from '../../sim/world.js';
import { avgFreight, recipeEstimate } from '../analysis.js';

const MIN_LINE_PROFIT = 300; // $ per day — below this a line is not worth a manager's attention

/** Free capacity (units/day) of the company's own lines that already make a product. */
function ownSpare(ctx, productId) {
  const { game, co } = ctx;
  let spare = 0;
  for (const b of game.buildingsOf(co.id)) {
    if (b.kind !== 'producer') continue;
    for (const line of b.lines) {
      if (!line) continue;
      const recipe = game.content.recipes.get(line.recipe);
      if (recipe.output !== productId) continue;
      // Lines still under construction count in full: their output is already spoken for.
      const pace = game.isReady(b) ? linePace(line, recipe) : recipe.rate;
      spare += Math.max(0, pace - (line.out ?? 0));
    }
  }
  return spare;
}

/** What other companies buy from outside — potential wholesale customers. */
function outsideDemand(ctx, productId) {
  let total = 0;
  for (const other of ctx.game.companies()) {
    if (other !== ctx.co) total += other.buy[productId] || 0;
  }
  return total;
}

function wholesalePrice(ctx, product, unitCost) {
  return roundSig(Math.max(unitCost * 1.1, Math.min(unitCost * 1.3, importPrice(ctx.game, product) * 0.93)), 3);
}

/** Daily profit of one line of `recipe` in `city` (before the building's upkeep). */
function lineProfit(ctx, recipe, product, city, estimate, need, own, market) {
  const { game, co, profile } = ctx;
  const R = game.content.balance.retail;
  const served = Math.min(own * 1.25, recipe.rate);
  let profit = 0;
  if (need && served > 0) {
    const delivered = estimate.uc + avgFreight(game, city.id, need.byCity, product);
    if (product.type === 'consumer' && need.price > 0) {
      // Own goods replace what is on the shelves now. Able managers know
      // that different quality and an unknown brand change how much sells.
      let volume = 1;
      if (profile.qualityAware) {
        const before = appeal(product, need.quality, need.brand);
        // Companies that advertise count on the brand they are about to build.
        const brand = Math.max(co.brand[product.id] ?? 0, profile.adRate > 0 ? 18 + 350 * profile.adRate * ctx.persona.w.ads : 0);
        const after = appeal(product, estimate.q, brand);
        volume = clamp((after / Math.max(before, 1)) ** R.exponent, 0.2, 3);
      }
      profit += served * (volume * (need.price - delivered) - (need.price - need.cost));
    } else {
      profit += served * (need.cost - delivered);
      // Better inputs lift the quality of whatever is made from them.
      if (profile.qualityAware) profit += served * product.cost * 0.01 * (estimate.q - need.quality);
    }
  }
  if (market > 0 && estimate.uc * 1.12 < importPrice(game, product)) {
    const extra = Math.min(recipe.rate - served, market * 0.4);
    if (extra > 0) profit += 0.5 * extra * (wholesalePrice(ctx, product, estimate.uc) - estimate.uc);
  }
  return profit * ctx.noise();
}

function setLine(ctx, buildingId, lineIndex, plan) {
  return ctx.act('setLine', {
    building: buildingId,
    line: lineIndex,
    recipe: plan.recipe.id,
    sources: plan.estimate.sources,
    sell: ctx.profile.b2b,
    price: wholesalePrice(ctx, plan.product, plan.estimate.uc),
  }).ok;
}

/**
 * @param {'factory'|'raw'} kind
 * @param {number} personaWeight appetite multiplier of the personality
 */
export function proposeProduction(ctx, budget, kind, personaWeight) {
  const { game, co, profile } = ctx;
  const { content, state } = game;
  const needs = ctx.needs();

  // Products worth looking at: what we buy ourselves, plus — for wholesalers —
  // what the rest of the market imports in bulk.
  const productIds = new Set(needs.keys());
  if (profile.b2b && personaWeight >= 1.2) {
    for (const other of game.companies()) {
      if (other === co) continue;
      for (const pid in other.buy) productIds.add(pid);
    }
  }

  // 1. Line plans: (recipe, city) → expected daily profit.
  const plans = [];
  for (const productId of productIds) {
    const product = content.products.get(productId);
    const need = needs.get(productId);
    for (const recipe of content.recipesFor(productId)) {
      if (recipe.raw !== (kind === 'raw')) continue;
      const own = need ? Math.max(0, need.units - ownSpare(ctx, productId)) : 0;
      const market = profile.b2b ? outsideDemand(ctx, productId) : 0;
      if (own < recipe.rate * 0.12 && market < recipe.rate * 0.5) continue;
      for (const city of game.cities()) {
        const estimate = recipeEstimate(ctx, recipe, city);
        if (!estimate) continue;
        const profitDay = lineProfit(ctx, recipe, product, city, estimate, need, own, market);
        if (profitDay >= MIN_LINE_PROFIT) plans.push({ recipe, product, city, estimate, profitDay });
      }
    }
  }
  if (!plans.length) return [];
  plans.sort((a, b) => b.profitDay - a.profitDay);

  const projects = [];

  // 2a. Free lines in buildings the company already has.
  for (const b of game.buildingsOf(co.id)) {
    if (b.kind !== 'producer') continue;
    const type = content.buildingTypes.get(b.type);
    const limit = lineCount(type, b.level);
    const free = b.lines.findIndex((line, i) => !line && i < limit);
    if (free < 0) continue;
    const making = new Set(b.lines.filter(Boolean).map((line) => content.recipes.get(line.recipe).output));
    const plan = plans.find((p) => p.recipe.building === b.type && p.city.id === b.city && !making.has(p.product.id));
    if (!plan) continue;
    projects.push({
      kind,
      cost: 0,
      profitDay: plan.profitDay,
      roi: 9,
      score: 9 * personaWeight,
      execute: (c) => setLine(c, b.id, free, plan),
    });
  }

  // 2b. New buildings, each running its best lines from day one.
  const typeIds = new Set(plans.map((p) => p.recipe.building));
  for (const typeId of typeIds) {
    const type = content.buildingTypes.get(typeId);
    for (const city of game.cities()) {
      const local = [];
      const seen = new Set();
      for (const p of plans) {
        if (p.recipe.building !== typeId || p.city !== city || seen.has(p.product.id)) continue;
        seen.add(p.product.id);
        local.push(p);
        if (local.length >= type.lines) break;
      }
      if (!local.length) continue;
      for (const districtId of type.districts) {
        if (freePlots(game, city, districtId) <= 0) continue;
        const cost = buildCost(game, type, city, districtId);
        if (cost > budget) continue;
        const district = content.districts.get(districtId);
        let profitDay = -(type.upkeep * wageIndex(game, city) * district.upkeep) / DAYS_PER_MONTH;
        for (const p of local) profitDay += p.profitDay;
        const roi = (profitDay * 360) / cost;
        if (roi <= 0) continue;
        projects.push({
          kind,
          cost,
          profitDay,
          roi,
          score: roi * personaWeight,
          execute: (c) => {
            const built = c.act('build', { type: typeId, city: city.id, district: districtId });
            if (!built.ok) return false;
            local.forEach((plan, i) => setLine(c, built.building, i, plan));
            return true;
          },
        });
      }
    }
  }
  return projects;
}

export const factoriesModule = {
  id: 'factories',
  order: 70,
  propose(ctx, budget) {
    if (!ctx.profile.projects.includes('factory')) return [];
    return proposeProduction(ctx, budget, 'factory', ctx.persona.w.industry);
  },
};

export const rawMaterialsModule = {
  id: 'rawMaterials',
  order: 80,
  propose(ctx, budget) {
    if (!ctx.profile.projects.includes('raw')) return [];
    return proposeProduction(ctx, budget, 'raw', ctx.persona.w.raw);
  },
};
