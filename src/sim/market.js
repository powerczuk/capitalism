// The consumer market model — pure functions, no state changes.
//
// For every city and consumer product:
//   1. `baseDemand`  — how many units people want per day
//   2. every shelf selling it gets a *rating*: the appeal of the goods
//      (quality and brand) scaled by how its price compares with normal
//   3. rating → *pull* (rating ^ exponent × store traffic)
//   4. customers split between all shelves and the small local shops in
//      proportion to pull; each shelf is capped by its stock and capacity
//
// The daily simulation (retail.js), the AI and the UI's "what if" hints all
// call the same functions, so forecasts and reality never drift apart.

import { EPS } from '../engine/util.js';
import { modifier } from './world.js';

/** Price consumers consider normal for this product in this city. */
export function refPrice(game, city, product) {
  return product.price * city.wealth ** game.content.balance.retail.wealthPrice;
}

/** Units per day the whole city wants to buy at normal prices. */
export function baseDemand(game, city, product) {
  const { state } = game;
  const incomeElasticity = 1.5 - product.necessity; // staples shrug off recessions, luxuries do not
  const wealthElasticity = 1.2 - product.necessity;
  return (
    (city.pop / 1000) *
    product.demand *
    state.economy.index ** incomeElasticity *
    city.wealth ** wealthElasticity *
    modifier(state, 'demand', product.id)
  );
}

/**
 * How much buyers like the goods themselves, price aside: quality and brand
 * blended by the product's weights (0-100).
 */
export function appeal(product, quality, brand) {
  const w = product.weights;
  return (w.quality * quality + w.brand * brand) / (w.quality + w.brand);
}

/** Price elasticity of demand for a product: staples react sharply to price, luxuries less. */
export function elasticity(R, product) {
  return R.elasticityBase + R.elasticityPrice * product.weights.price;
}

/**
 * Overall rating of an offer: the appeal of the goods scaled by how the price
 * compares with what people consider normal. An ordinary offer scores 35-50;
 * the daily sales of a shelf are proportional to rating ^ exponent.
 */
export function rating(R, product, ref, price, quality, brand) {
  const ratio = Math.min(R.priceRatioMax, ref / Math.max(price, 0.01));
  return Math.max(1, appeal(product, quality, brand)) * ratio ** (elasticity(R, product) / R.exponent);
}

/** How strongly an offer attracts customers. */
export function pullOf(R, ratingValue, factor) {
  return (Math.max(0, ratingValue) / 50) ** R.exponent * factor;
}

/** Brand rating of the goods on a shelf (it belongs to whoever produced them). */
export function brandOf(game, producerId, productId) {
  const B = game.content.balance;
  if (!producerId || producerId === 'import') return B.import.brand;
  const producer = game.state.companies[producerId];
  return producer?.alive ? producer.brand[productId] ?? 0 : B.import.brand;
}

/** The anonymous local shops of a city: mediocre quality, normal price. */
export function localRival(game, city, product, ref = refPrice(game, city, product)) {
  const B = game.content.balance;
  const quality = Math.min(B.local.maxQuality, game.state.economy.tech + B.local.techBonus);
  const brand = B.local.brand;
  const r = rating(B.retail, product, ref, ref, quality, brand);
  return { quality, brand, price: ref, rating: r, pull: pullOf(B.retail, r, city.pop / B.local.popPerShop) };
}

/** Traffic multiplier of a store: district footfall × size. */
export function storePull(game, b) {
  const R = game.content.balance.retail;
  const district = game.content.districts.get(b.district);
  return district.traffic * (R.pullByLevel[b.level - 1] ?? R.pullByLevel.at(-1));
}

/** Units per day one shelf of this store can sell at most. */
export function slotCapacity(game, b, product) {
  const R = game.content.balance.retail;
  const type = game.content.buildingTypes.get(b.type);
  return (type.capacity * (R.capacityByLevel[b.level - 1] ?? R.capacityByLevel.at(-1))) / product.price;
}

export function slotCapacityFor(game, type, level, product) {
  const R = game.content.balance.retail;
  return (type.capacity * (R.capacityByLevel[level - 1] ?? R.capacityByLevel.at(-1))) / product.price;
}

/**
 * Split `demand` between offers. Each offer needs { pull, cap, stock } and
 * receives { potential, units, limited }.
 *  - potential: what it would sell with unlimited stock and capacity
 *  - units:     what it actually sells today
 *  - limited:   'stock' | 'cap' | null — what held it back
 */
export function allocate(R, demand, offers, localPull) {
  let total = localPull;
  for (const o of offers) total += o.pull;
  if (total <= 0) {
    for (const o of offers) {
      o.potential = 0;
      o.units = 0;
      o.limited = null;
    }
    return;
  }
  let unserved = 0;
  let openPull = 0;
  for (const o of offers) {
    o.potential = (demand * o.pull) / total;
    const limit = Math.min(o.cap, o.stock);
    if (o.potential > limit + EPS) {
      o.units = Math.max(0, limit);
      o.limited = o.stock < o.cap ? 'stock' : 'cap';
      unserved += o.potential - o.units;
    } else {
      o.units = o.potential;
      o.limited = null;
      openPull += o.pull;
    }
  }
  if (unserved > EPS && openPull > 0) {
    // Shoppers who met an empty shelf or a queue try the other stores;
    // some give up and go to the local shops.
    const extra = unserved * R.redistribute;
    const pool = openPull + localPull;
    for (const o of offers) {
      if (o.limited) continue;
      const room = Math.min(o.cap, o.stock) - o.units;
      const add = Math.min((extra * o.pull) / pool, room);
      if (add > 0) o.units += add;
    }
  }
}

/**
 * Snapshot of one city/product market: every shelf with its rating and pull.
 * Shelves of stores still under construction are ignored.
 */
export function marketSnapshot(game, cityId, productId) {
  const { state, content } = game;
  const R = content.balance.retail;
  const city = state.cities[cityId];
  const product = content.products.get(productId);
  const ref = refPrice(game, city, product);
  const local = localRival(game, city, product, ref);
  const offers = [];
  for (const b of game.buildingsIn(cityId)) {
    if (b.kind !== 'retail' || b.ready > state.day) continue;
    const factor = storePull(game, b);
    for (let i = 0; i < b.slots.length; i++) {
      const s = b.slots[i];
      if (!s || s.product !== productId) continue;
      const brand = brandOf(game, s.by, productId);
      const quality = s.qty > EPS ? s.q : s.q || local.quality;
      const r = rating(R, product, ref, s.price, quality, brand);
      offers.push({
        key: `${b.id}:${i}`,
        building: b,
        index: i,
        slot: s,
        co: b.co,
        price: s.price,
        quality,
        brand,
        rating: r,
        pull: pullOf(R, r, factor),
        cap: slotCapacity(game, b, product),
        stock: s.qty,
      });
    }
  }
  return { city, product, ref, demand: baseDemand(game, city, product), local, offers };
}

/**
 * Forecast for a hypothetical offer in a market snapshot.
 *
 * Same maths as `allocate`, written as two passes without temporary objects
 * because the AI calls it thousands of times. Rivals are assumed to keep
 * their shelves stocked — a cautious forecast.
 *
 * @param {object} snap result of `marketSnapshot`
 * @param {{price:number, quality:number, brand:number, factor:number, cap:number}} offer
 * @param {string} [ignoreKey] shelf to leave out (when re-pricing an existing shelf)
 * @param {string} [ownerId] when given, also estimates how much profit the new
 *   offer takes away from this company's other shelves in the same market
 * @returns {{units:number, potential:number, share:number, rating:number, limited:string|null, ownLoss:number}}
 */
export function forecast(game, snap, offer, ignoreKey = null, ownerId = null) {
  const R = game.content.balance.retail;
  const { offers, demand } = snap;
  const localPull = snap.local.pull;
  const r = rating(R, snap.product, snap.ref, offer.price, offer.quality, offer.brand);
  const myPull = pullOf(R, r, offer.factor);

  let others = 0;
  for (let i = 0; i < offers.length; i++) if (offers[i].key !== ignoreKey) others += offers[i].pull;
  const total = localPull + others + myPull;
  if (!(total > 0) || !(demand > 0)) return { units: 0, potential: 0, share: 0, rating: r, limited: null, ownLoss: 0 };

  // Rivals that cannot serve all their customers send some of them on.
  let unserved = 0;
  let openPull = 0;
  let ownLoss = 0;
  const totalBefore = localPull + others;
  for (let i = 0; i < offers.length; i++) {
    const o = offers[i];
    if (o.key === ignoreKey) continue;
    const potential = (demand * o.pull) / total;
    if (potential > o.cap) unserved += potential - o.cap;
    else openPull += o.pull;
    if (ownerId && o.co === ownerId) {
      const before = Math.min(o.cap, (demand * o.pull) / totalBefore);
      const after = Math.min(o.cap, potential);
      if (before > after) ownLoss += (before - after) * Math.max(0, o.price - o.slot.uc);
    }
  }

  const potential = (demand * myPull) / total;
  let units;
  let limited = null;
  if (potential > offer.cap) {
    units = offer.cap;
    limited = 'cap';
  } else {
    units = potential;
    if (unserved > EPS) {
      const extra = unserved * R.redistribute;
      units += Math.min((extra * myPull) / (openPull + myPull + localPull), offer.cap - potential);
    }
  }
  return { units, potential, share: units / demand, rating: r, limited, ownLoss };
}
