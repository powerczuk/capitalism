// Read-only statistics derived from the state (used by goals, the AI and the UI).

import { baseDemand } from './market.js';

/**
 * National consumer market at reference prices.
 * @returns {{total: number, by: Record<string, number>}} $ per day: whole market and per company
 */
export function nationalRetail(game) {
  const { state, content } = game;
  const by = {};
  let total = 0;
  for (const cityId of state.cityOrder) {
    const city = state.cities[cityId];
    for (const product of content.consumerProducts) {
      total += baseDemand(game, city, product) * product.price;
      const mk = city.mk[product.id];
      if (!mk) continue;
      for (const id in mk.u) by[id] = (by[id] || 0) + mk.u[id] * product.price;
    }
  }
  return { total, by };
}

/** Share (0-1) of the national consumer market a company serves. */
export function retailShare(game, companyId) {
  const { total, by } = nationalRetail(game);
  return total > 0 ? (by[companyId] || 0) / total : 0;
}

/**
 * One product across the country.
 * @returns {{demand: number, by: Record<string, number>, cities: Array<{city: object, demand: number, by: Record<string, number>}>}}
 * units per day: demand and smoothed sales per company
 */
export function productMarket(game, productId) {
  const { state, content } = game;
  const product = content.products.get(productId);
  const out = { demand: 0, by: {}, cities: [] };
  for (const cityId of state.cityOrder) {
    const city = state.cities[cityId];
    const demand = baseDemand(game, city, product);
    const by = { ...(city.mk[productId]?.u || {}) };
    out.demand += demand;
    for (const id in by) out.by[id] = (out.by[id] || 0) + by[id];
    out.cities.push({ city, demand, by });
  }
  return out;
}

/** Number of buildings of each kind a company owns. */
export function buildingCounts(game, companyId) {
  const counts = { retail: 0, producer: 0, research: 0, total: 0 };
  for (const b of game.buildingsOf(companyId)) {
    counts[b.kind] += 1;
    counts.total += 1;
  }
  return counts;
}
