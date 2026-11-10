// Business analysis shared by the AI modules (and by the player's pricing
// assistant): "what would this shelf earn?", "what does it cost to make
// this here?", "where do we still buy from outsiders?".
//
// Everything here is read-only. All forecasts go through the same market
// model the simulation uses (sim/market.js).

import { EPS } from '../engine/util.js';
import { brandOf, forecast, marketSnapshot, slotCapacity, slotCapacityFor, storePull } from '../sim/market.js';
import { importPrice, importQuality, IMPORT, listSources, quote, techOf } from '../sim/supply.js';
import { freightCost, importFreight, modifier, resourceQuality, wageIndex } from '../sim/world.js';
import { buildCost, upkeepOf } from '../sim/construction.js';
import { DAYS_PER_MONTH } from '../engine/calendar.js';

/** Price points (× reference price) tried first by the optimising pricing mode. */
const COARSE_GRID = [0.65, 0.8, 0.95, 1.1, 1.25, 1.4, 1.6, 1.85, 2.15];

/** Monthly fixed costs of a company: upkeep of buildings, ads and research budgets. */
export function fixedCosts(game, co) {
  let total = 0;
  for (const b of game.buildingsOf(co.id)) {
    if (b.ready > game.state.day) continue;
    total += upkeepOf(game, b);
    if (b.labs) for (const lab of b.labs) if (lab) total += lab.budget;
  }
  for (const pid in co.ads) total += co.ads[pid];
  return total;
}

/** Sources that can actually deliver today. */
export function usableSources(game, co, cityId, productId) {
  return listSources(game, co, cityId, productId).filter((s) => s.kind === 'import' || s.ready);
}

/**
 * Choose a shelf price.
 * @param {object} snap market snapshot (sim/market.js)
 * @param {{unitCost:number, quality:number, brand:number, factor:number, cap:number}} offer
 * @param {{mode:string, markup?:number, stance?:number, ignoreKey?:string, ownerId?:string, fine?:boolean}} how
 * @returns {{price:number, units:number, profit:number, rating:number, ownLoss:number}}
 */
export function choosePrice(game, snap, offer, { mode, markup = 0.5, stance = 1, ignoreKey = null, ownerId = null, fine = true }) {
  const ref = snap.ref;
  const floor = offer.unitCost * 1.05;
  const evaluate = (price) => {
    const f = forecast(game, snap, { ...offer, price }, ignoreKey, ownerId);
    return { price, units: f.units, profit: (price - offer.unitCost) * f.units - f.ownLoss, rating: f.rating, ownLoss: f.ownLoss };
  };

  if (mode === 'optimize') {
    // Coarse sweep first, then refine around the best point.
    let best = null;
    const consider = (m) => {
      const price = ref * m;
      if (price < floor) return;
      const result = evaluate(price);
      result.m = m;
      if (!best || result.profit > best.profit) best = result;
    };
    for (const m of COARSE_GRID) consider(m);
    if (!best) return evaluate(Math.max(floor, ref));
    if (fine) {
      const centre = best.m;
      for (const d of [-0.1, -0.05, 0.05, 0.1]) consider(Math.round((centre + d) * 100) / 100);
    }
    if (stance !== 1) {
      // A personality leans the optimum a little towards cheap or premium.
      return evaluate(Math.max(floor, best.price * stance ** 0.5));
    }
    return best;
  }

  if (mode === 'follow') {
    let total = 0;
    let n = 0;
    for (const o of snap.offers) {
      if (o.key === ignoreKey || o.stock <= EPS) continue;
      total += o.price;
      n += 1;
    }
    const target = (n ? (total / n) * 0.98 : ref * 1.05) * stance;
    return evaluate(Math.max(offer.unitCost * 1.15, Math.min(target, ref * 1.8)));
  }

  // costPlus
  const price = Math.min(ref * 1.7, Math.max(ref * 0.75, offer.unitCost * (1 + markup) * stance));
  return evaluate(Math.max(floor, price));
}

/**
 * The best way for a company to sell one product from a (real or planned) store.
 * @param {object} ctx AI context (controller.js)
 * @param {{cityId:string, factor:number, cap:number}} store traffic factor and shelf capacity
 * @param {string} productId
 * @param {object} [opts]
 * @param {string} [opts.ignoreKey] existing shelf to leave out of the forecast
 * @param {string} [opts.currentSrc] the shelf's present source (its own flow counts as available)
 * @param {number} [opts.currentFlow]
 * @param {(source: object) => boolean} [opts.only] restrict the sources considered
 * @param {boolean} [opts.unlimited] ignore how much the sources can still deliver
 * @returns {null | {productId, src, source, price, units, profitDay, rating, tried: Map<string, number>}}
 */
export function shelfOption(
  ctx,
  store,
  productId,
  { ignoreKey = null, currentSrc = null, currentFlow = 0, fine = false, only = null, unlimited = false } = {},
) {
  const { game, co, profile } = ctx;
  const snap = ctx.snapshot(store.cityId, productId);
  let sources = ctx.sources(store.cityId, productId);
  if (only) sources = sources.filter(only);
  if (!sources.length) return null;
  const room = (s) => (unlimited ? Infinity : ctx.lineFree(s) + (s.src === currentSrc ? currentFlow : 0));
  if (!profile.qualityAware && !unlimited) {
    // Less able managers just take the cheapest supplier with enough goods.
    const roomy = sources.filter((s) => room(s) >= store.cap * 0.25);
    sources = (roomy.length ? roomy : sources).slice(0, 1);
  }
  let best = null;
  const tried = new Map(); // src → profit per day (lets callers compare with their current supplier)
  for (const source of sources) {
    const available = room(source);
    if (available < store.cap * 0.05) continue;
    const offer = {
      unitCost: source.unitCost,
      quality: source.quality,
      brand: brandOf(game, source.by, productId),
      factor: store.factor,
      cap: Math.min(store.cap, available),
    };
    const result = choosePrice(game, snap, offer, {
      mode: profile.pricing,
      markup: ctx.markup,
      stance: ctx.persona.w.price,
      ignoreKey,
      ownerId: profile.cannibalAware ? co.id : null,
      fine,
    });
    // Own factories get a small bonus: they also keep the lines busy.
    const score = result.profit * (source.own ? 1.05 : 1);
    tried.set(source.src, result.profit);
    if (!best || score > best.score) {
      best = { productId, src: source.src, source, price: result.price, units: result.units, profitDay: result.profit, rating: result.rating, score };
    }
  }
  if (best) best.tried = tried;
  return best;
}

/**
 * Recommended price for an existing shelf (used by the AI pricing module and
 * by the human player's pricing assistant).
 * @returns {null | {price:number, units:number, profit:number}}
 */
export function shelfPrice(game, co, b, index, { mode = 'optimize', markup = 0.5, stance = 1, cannibal = true } = {}) {
  const slot = b.slots[index];
  if (!slot) return null;
  const product = game.content.products.get(slot.product);
  const q = slot.qty > EPS && slot.uc > 0 ? null : quote(game, co, b.city, slot.product, slot.src);
  const unitCost = q ? q.unitCost : slot.uc;
  if (!(unitCost > 0)) return null;
  const snap = marketSnapshot(game, b.city, slot.product);
  let cap = slotCapacity(game, b, product);
  // A shelf that keeps running empty should not be priced for demand it cannot serve.
  if (slot.so > 0.4 && slot.s != null) cap = Math.min(cap, Math.max(slot.s * 1.1, cap * 0.05));
  const offer = {
    unitCost,
    quality: q ? q.quality : slot.q,
    brand: brandOf(game, q ? q.by : slot.by, slot.product),
    factor: storePull(game, b),
    cap,
  };
  return choosePrice(game, snap, offer, {
    mode,
    markup,
    stance,
    ignoreKey: `${b.id}:${index}`,
    ownerId: cannibal ? co.id : null,
    fine: true,
  });
}

/** Shelf description of an existing store, for `shelfOption`. */
export function storeShelf(game, b, product) {
  return { cityId: b.city, factor: storePull(game, b), cap: slotCapacity(game, b, product) };
}

/**
 * Value a new store of `type` in a district: which products it would carry
 * and what it would earn.
 */
export function evaluateStore(ctx, type, city, districtId) {
  const { game } = ctx;
  const { content } = game;
  const district = content.districts.get(districtId);
  const factor = district.traffic * content.balance.retail.pullByLevel[0];
  const options = [];
  for (const product of content.consumerProducts) {
    if (!type.categories.includes(product.category)) continue;
    const option = shelfOption(ctx, { cityId: city.id, factor, cap: slotCapacityFor(game, type, 1, product) }, product.id);
    if (option && option.profitDay > 0) {
      option.score = option.profitDay * ctx.catWeight(product);
      options.push(option);
    }
  }
  options.sort((a, b) => b.score - a.score);
  const picks = options.slice(0, type.slots);
  let gross = 0;
  for (const p of picks) gross += p.profitDay;
  const upkeepDay = (type.upkeep * wageIndex(game, city) * district.upkeep) / DAYS_PER_MONTH;
  const cost = buildCost(game, type, city, districtId);
  const profitDay = gross * ctx.noise() - upkeepDay;
  return { kind: 'store', type, city, districtId, picks, cost, profitDay, roi: (profitDay * 360) / cost };
}

/**
 * Expected unit cost and quality of running a recipe in a city, using the
 * best inputs the company can get there.
 * @returns {null | {uc:number, q:number, sources:Record<string,string>}}
 */
export function recipeEstimate(ctx, recipe, city) {
  const { game, co, profile } = ctx;
  const { content, state } = game;
  const output = content.products.get(recipe.output);
  const processing = recipe.cost * wageIndex(game, city) * modifier(state, 'procCost', '*');
  if (recipe.raw) {
    const q = resourceQuality(city, output.id);
    return q == null ? null : { uc: processing, q, sources: {} };
  }
  let cost = 0;
  let qualitySum = 0;
  let weightSum = 0;
  const sources = {};
  for (const id in recipe.inputs) {
    const per = recipe.inputs[id];
    const product = content.products.get(id);
    const candidates = ctx.sources(city.id, id);
    if (!candidates.length) return null;
    let best = candidates[0];
    if (profile.qualityAware) {
      // A better input is worth paying a little more for.
      const value = (s) => s.unitCost * (1 - 0.004 * (s.quality - 50));
      for (const s of candidates) if (value(s) < value(best)) best = s;
    }
    sources[id] = best.src;
    cost += per * best.unitCost;
    const weight = per * product.cost;
    qualitySum += best.quality * weight;
    weightSum += weight;
  }
  const tech = techOf(game, co, output.id);
  const inputQuality = weightSum > 0 ? qualitySum / weightSum : tech;
  return {
    uc: cost + processing,
    q: output.techShare * tech + (1 - output.techShare) * inputQuality,
    sources,
  };
}

/**
 * Everything the company currently buys from outside (imports or rivals),
 * per product: daily volume, average delivered cost and who consumes it.
 * @returns {Map<string, {units:number, cost:number, quality:number, price:number, brand:number, byCity:Map<string,number>, refs:Array}>}
 */
export function externalNeeds(ctx) {
  const { game, co } = ctx;
  const { content, state } = game;
  const needs = new Map();
  const add = (productId, cityId, perDay, unitCost, quality, ref, price = 0, brand = 0) => {
    if (perDay <= EPS) return;
    let n = needs.get(productId);
    if (!n) needs.set(productId, (n = { units: 0, costSum: 0, qualitySum: 0, priceSum: 0, brandSum: 0, byCity: new Map(), refs: [] }));
    n.units += perDay;
    n.costSum += perDay * unitCost;
    n.qualitySum += perDay * quality;
    n.priceSum += perDay * price;
    n.brandSum += perDay * brand;
    n.byCity.set(cityId, (n.byCity.get(cityId) || 0) + perDay);
    n.refs.push(ref);
  };
  const isOwn = (src, productId) => {
    if (!src || src === IMPORT) return false;
    const q = quote(game, co, state.cityOrder[0], productId, src);
    return !!q && q.own;
  };
  for (const b of game.buildingsOf(co.id)) {
    if (b.kind === 'retail') {
      b.slots.forEach((slot, i) => {
        if (!slot || isOwn(slot.src, slot.product)) return;
        const product = content.products.get(slot.product);
        const cap = slotCapacity(game, b, product);
        const perDay = slot.s ?? cap * 0.4;
        const q = slot.qty > EPS ? null : quote(game, co, b.city, slot.product, slot.src || IMPORT);
        const unitCost = slot.qty > EPS ? slot.uc : q?.unitCost ?? importPrice(game, product) + importFreight(game, b.city, product);
        const quality = slot.qty > EPS ? slot.q : q?.quality ?? importQuality(game, product);
        const brand = brandOf(game, slot.qty > EPS ? slot.by : q?.by ?? IMPORT, slot.product);
        add(slot.product, b.city, perDay, unitCost, quality, { kind: 'slot', b, index: i, ref: slot, perDay }, slot.price, brand);
      });
    } else if (b.kind === 'producer') {
      b.lines.forEach((line, i) => {
        if (!line) return;
        const recipe = content.recipes.get(line.recipe);
        const pace = line.made ?? recipe.rate * 0.5;
        for (const id in recipe.inputs) {
          const inp = line.inputs[id];
          if (isOwn(inp.src, id)) continue;
          const product = content.products.get(id);
          const perDay = Math.max(pace, recipe.rate * 0.25) * recipe.inputs[id];
          const q = inp.qty > EPS ? null : quote(game, co, b.city, id, inp.src || IMPORT);
          const unitCost = inp.qty > EPS ? inp.uc : q?.unitCost ?? importPrice(game, product) + importFreight(game, b.city, product);
          const quality = inp.qty > EPS ? inp.q : q?.quality ?? importQuality(game, product);
          add(id, b.city, perDay, unitCost, quality, { kind: 'input', b, index: i, input: id, ref: inp, perDay });
        }
      });
    }
  }
  for (const n of needs.values()) {
    n.cost = n.costSum / n.units;
    n.quality = n.qualitySum / n.units;
    n.price = n.priceSum / n.units; // average shelf price (0 for production inputs)
    n.brand = n.brandSum / n.units;
  }
  return needs;
}

/** Average freight per unit from a city to a set of consumers ({cityId → units}). */
export function avgFreight(game, fromCityId, byCity, product) {
  let units = 0;
  let cost = 0;
  for (const [cityId, n] of byCity) {
    units += n;
    cost += n * freightCost(game, fromCityId, cityId, product);
  }
  return units > 0 ? cost / units : 0;
}

/**
 * Monthly revenue of each own-made product sold on the company's shelves
 * (including shelves that were just switched to an own factory).
 */
export function ownBrandRevenue(game, co) {
  const out = {};
  const ownLine = (slot) => {
    const line = slot.src && slot.src !== IMPORT ? quote(game, co, game.state.cityOrder[0], slot.product, slot.src) : null;
    return !!line?.own;
  };
  for (const b of game.buildingsOf(co.id)) {
    if (b.kind !== 'retail') continue;
    for (const slot of b.slots) {
      if (!slot || (slot.by !== co.id && !ownLine(slot))) continue;
      const rev = slot.last ? slot.last.rev : (slot.s ?? 0) * slot.price * DAYS_PER_MONTH;
      out[slot.product] = (out[slot.product] || 0) + rev;
    }
  }
  return out;
}
