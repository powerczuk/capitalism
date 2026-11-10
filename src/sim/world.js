// The world: cities on a map, their natural resources, temporary modifiers
// (effects of news events) and the geography helpers everything else uses.

import { clamp } from '../engine/util.js';

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

/** Distance in km between two cities. */
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Freight cost in $ per unit of `product` between two cities. */
export function freightCost(game, fromCityId, toCityId, product) {
  const F = game.content.balance.freight;
  const { cities } = game.state;
  const km = fromCityId === toCityId ? F.localKm : Math.max(F.localKm, distance(cities[fromCityId], cities[toCityId]));
  return product.weight * km * F.perKm;
}

/** The port city closest to `cityId` (imports are shipped from there). */
export function nearestPort(game, cityId) {
  const { cities, cityOrder } = game.state;
  const here = cities[cityId];
  let best = null;
  let bestKm = Infinity;
  for (const id of cityOrder) {
    const c = cities[id];
    if (!c.port) continue;
    const km = distance(here, c);
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  return best ?? here;
}

export function importFreight(game, cityId, product) {
  return freightCost(game, nearestPort(game, cityId).id, cityId, product);
}

/** Cost-of-labour index of a city (1 = national average). */
export function wageIndex(game, city) {
  return city.wealth * modifier(game.state, 'wage', city.id);
}

/** Land price index of a city: bigger and richer cities cost more to build in. */
export function landIndex(city) {
  return 0.55 + 0.45 * city.wealth * Math.sqrt(city.pop / 1e6);
}

/** Number of building plots a district offers in a city. */
export function plotsOf(content, city, districtId) {
  const d = content.districts.get(districtId);
  return d.plots.base + Math.round(city.pop / d.plots.per);
}

export function usedPlots(game, cityId, districtId) {
  let n = 0;
  for (const b of game.buildingsIn(cityId)) if (b.district === districtId) n++;
  return n;
}

export function freePlots(game, city, districtId) {
  return plotsOf(game.content, city, districtId) - usedPlots(game, city.id, districtId);
}

/** Quality (0-100) of a natural resource in a city, or null when it does not occur there. */
export function resourceQuality(city, productId) {
  return city.res[productId] ?? null;
}

// ---------------------------------------------------------------------------
// Modifiers — temporary multipliers created by world events
// ---------------------------------------------------------------------------

/**
 * Combined multiplier of all active modifiers of a kind.
 * A modifier with key '*' applies to every key of that kind.
 */
export function modifier(state, kind, key) {
  let f = 1;
  const list = state.modifiers;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.kind === kind && (m.key === key || m.key === '*')) f *= m.f;
  }
  return f;
}

/**
 * @param {{kind: string, key?: string, factor: number, days: number, source?: string}} def
 */
export function addModifier(game, { kind, key = '*', factor, days, source = null }) {
  const m = { kind, key, f: factor, until: game.state.day + days, src: source };
  game.state.modifiers.push(m);
  return m;
}

// ---------------------------------------------------------------------------
// World generation
// ---------------------------------------------------------------------------

function generateCities(game) {
  const { state, content, rng } = game;
  const W = content.balance.world;
  const archetypes = content.cityArchetypes.all();
  const count = clamp(Math.round(state.settings.cityCount ?? 4), 2, archetypes.length);
  state.settings.cityCount = count;

  const usedNames = new Set();
  const placed = [];
  for (let i = 0; i < count; i++) {
    const arch = archetypes[i];
    const names = arch.names.filter((n) => !usedNames.has(n));
    const name = rng.pick(names.length ? names : arch.names);
    usedNames.add(name);

    // Rejection-sample a position inside the archetype's zone, away from other cities.
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 200; attempt++) {
      x = rng.range(arch.zone.x[0], arch.zone.x[1]) * W.width;
      y = rng.range(arch.zone.y[0], arch.zone.y[1]) * W.height;
      const minDist = W.minCityDistance * (attempt < 120 ? 1 : 0.6);
      if (placed.every((c) => Math.hypot(c.x - x, c.y - y) >= minDist)) break;
    }

    const city = {
      id: game.newId('c'),
      name,
      arch: arch.id,
      x: Math.round(x),
      y: Math.round(y),
      pop: Math.round(rng.range(arch.pop[0], arch.pop[1]) / 1000) * 1000,
      wealth: Math.round(rng.range(arch.wealth[0], arch.wealth[1]) * 100) / 100,
      growth: Math.round(rng.range(arch.growth[0], arch.growth[1]) * 1000) / 1000,
      port: !!arch.port,
      res: {},
      mk: {},
    };
    placed.push(city);
    state.cities[city.id] = city;
    state.cityOrder.push(city.id);
  }

  // Every country needs a harbour: promote the northernmost city if none exists.
  if (!placed.some((c) => c.port)) {
    placed.reduce((a, b) => (a.y < b.y ? a : b)).port = true;
  }

  // Natural resources. `product.occurs` maps archetype id (or '*') → [chance, qMin, qMax].
  for (const product of content.products.all()) {
    if (product.type !== 'raw' || !content.recipesFor(product.id).length) continue;
    const occurs = product.occurs || { '*': [0.4, 40, 70] };
    const spec = (city) => occurs[city.arch] ?? occurs['*'] ?? [0, 40, 60];
    for (const city of placed) {
      const [chance, lo, hi] = spec(city);
      if (rng.chance(chance)) city.res[product.id] = Math.round(rng.range(lo, hi));
    }
    if (!placed.some((c) => c.res[product.id] != null)) {
      // Guarantee at least one deposit, in the most plausible city.
      const best = [...placed].sort((a, b) => spec(b)[0] - spec(a)[0] || a.id.localeCompare(b.id))[0];
      const [, lo, hi] = spec(best)[0] > 0 ? spec(best) : [0, 40, 65];
      best.res[product.id] = Math.round(rng.range(lo, hi));
    }
  }
}

export const worldSystem = {
  id: 'world',
  order: 5,
  setup(game) {
    generateCities(game);
  },
  daily(game) {
    const { state } = game;
    // Drop expired modifiers so effects end on the announced day.
    if (state.modifiers.length && state.modifiers.some((m) => m.until <= state.day)) {
      state.modifiers = state.modifiers.filter((m) => m.until > state.day);
    }
  },
};
