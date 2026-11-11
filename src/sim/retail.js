// Retail: every day the people of each city buy from store shelves.
// The maths lives in market.js; this file applies it to the world.

import { fail } from '../engine/game.js';
import { ema, EPS, isIndex } from '../engine/util.js';
import { allocate, baseDemand, brandOf, localRival, pullOf, rating, refPrice, slotCapacity, storePull } from './market.js';
import { agreeSource, canUseSource, defaultSource, validPrice } from './supply.js';
import { ownBuilding, slotCount, writeOffStock } from './construction.js';

function runRetail(game) {
  const { state, content } = game;
  const R = content.balance.retail;
  const alpha = content.balance.ema;
  const day = state.day;
  const products = content.consumerProducts;

  for (const cityId of state.cityOrder) {
    const city = state.cities[cityId];

    // Bucket the shelves of all open stores by product.
    const buckets = new Map();
    for (const b of game.buildingsIn(cityId)) {
      if (b.kind !== 'retail' || b.ready > day) continue;
      const factor = storePull(game, b);
      for (const s of b.slots) {
        if (!s) continue;
        let list = buckets.get(s.product);
        if (!list) buckets.set(s.product, (list = []));
        list.push({ b, s, factor, pull: 0, cap: 0, stock: 0, potential: 0, units: 0, limited: null });
      }
    }

    for (const product of products) {
      const entries = buckets.get(product.id);
      let mk = city.mk[product.id];
      if (!entries) {
        if (mk) {
          for (const id in mk.u) {
            mk.u[id] *= 1 - alpha;
            if (mk.u[id] < 1e-3) delete mk.u[id];
          }
        }
        continue;
      }
      const ref = refPrice(game, city, product);
      const local = localRival(game, city, product, ref);
      const demand = baseDemand(game, city, product);
      for (const e of entries) {
        const s = e.s;
        const r = rating(R, product, ref, s.price, s.q || local.quality, brandOf(game, s.by, product.id));
        e.pull = pullOf(R, r, e.factor);
        e.cap = slotCapacity(game, e.b, product);
        e.stock = s.qty;
      }
      allocate(R, demand, entries, local.pull);

      if (!mk) mk = city.mk[product.id] = { u: {} };
      const soldBy = {};
      for (const e of entries) {
        const s = e.s;
        const n = e.units;
        s.d = ema(s.d, e.potential, alpha);
        s.s = ema(s.s, n, alpha);
        s.so = ema(s.so, e.limited === 'stock' ? 1 : 0, alpha);
        s.cl = ema(s.cl, e.limited === 'cap' ? 1 : 0, alpha);
        if (n <= EPS) continue;
        const co = state.companies[e.b.co];
        const revenue = n * s.price;
        const cogs = n * s.uc;
        s.qty -= n;
        if (s.qty < EPS) s.qty = 0;
        co.cash += revenue;
        co.m.retail += revenue;
        co.m.cogs += cogs;
        e.b.m.rev += revenue;
        e.b.m.cogs += cogs;
        s.rev += revenue;
        s.cogs += cogs;
        s.units += n;
        soldBy[co.id] = (soldBy[co.id] || 0) + n;
        // Credit the maker of the goods: brand awareness grows with units sold.
        if (s.by && s.by !== 'import') {
          const maker = state.companies[s.by];
          if (maker?.alive) maker.sold[product.id] = (maker.sold[product.id] || 0) + n;
        }
      }
      for (const id in mk.u) {
        mk.u[id] = ema(mk.u[id], soldBy[id] || 0, alpha);
        if (mk.u[id] < 1e-3 && !soldBy[id]) delete mk.u[id];
      }
      for (const id in soldBy) if (!(id in mk.u)) mk.u[id] = soldBy[id] * alpha;
    }
  }
}

export const retailSystem = {
  id: 'retail',
  order: 60,
  daily: runRetail,
};

function ownSlot(game, co, building, index) {
  const b = ownBuilding(game, co, building);
  if (!b || b.kind !== 'retail' || !isIndex(b.slots, index)) return null;
  const slot = b.slots[index];
  return slot ? { b, slot } : null;
}

export const retailCommands = [
  {
    id: 'setSlot',
    /** params: { building, slot, product, src?, price? } — put a product on a shelf */
    check(game, co, { building, slot: index, product: productId, src, price }) {
      const { content } = game;
      const b = ownBuilding(game, co, building);
      if (!b || b.kind !== 'retail') return fail('err.notYours');
      const type = content.buildingTypes.get(b.type);
      if (!Number.isInteger(index) || index < 0 || index >= slotCount(type, b.level)) return fail('err.badSlot');
      const product = content.products.find(productId);
      if (!product || product.type !== 'consumer') return fail('err.badProduct');
      if (!type.categories.includes(product.category)) return fail('err.wrongCategory');
      if (b.slots.some((s, i) => s && i !== index && s.product === productId)) return fail('err.duplicateProduct');
      if (src != null && !canUseSource(game, co, productId, src)) return fail('err.badSource');
      if (price != null && !validPrice(price)) return fail('err.badPrice');
      return null;
    },
    run(game, co, { building, slot: index, product: productId, src, price }) {
      const { state, content } = game;
      const b = state.buildings[building];
      const product = content.products.get(productId);
      let slot = b.slots[index];
      if (slot && slot.product !== productId) {
        writeOffStock(game, co, slot.qty, slot.uc);
        slot = null;
      }
      if (!slot) {
        slot = {
          product: productId,
          src: null,
          price: refPrice(game, state.cities[b.city], product),
          auto: false, // let the pricing assistant manage the price
          qty: 0,
          q: 0, // quality of the stock
          uc: 0, // unit cost of the stock
          by: null, // who produced the stock ('import' or a company id)
          d: null, // smoothed potential demand per day
          s: null, // smoothed units sold per day
          so: 0, // how often the shelf ran empty (0-1)
          cl: 0, // how often the shelf hit its capacity (0-1)
          sup: 0, // supply status code (see SUP in supply.js)
          rev: 0, // this month
          cogs: 0,
          units: 0,
          last: null, // last closed month
        };
        agreeSource(game, co, slot, productId, defaultSource(game, co, b.city, productId));
        b.slots[index] = slot;
      }
      if (src !== undefined) agreeSource(game, co, slot, productId, src);
      if (price != null) slot.price = price;
      return {};
    },
  },

  {
    id: 'clearSlot',
    /** params: { building, slot } */
    check(game, co, { building, slot }) {
      return ownSlot(game, co, building, slot) ? null : fail('err.notYours');
    },
    run(game, co, { building, slot }) {
      const found = ownSlot(game, co, building, slot);
      writeOffStock(game, co, found.slot.qty, found.slot.uc);
      found.b.slots[slot] = null;
      return {};
    },
  },

  {
    id: 'setSlotPrice',
    /** params: { building, slot, price } */
    check(game, co, { building, slot, price }) {
      if (!ownSlot(game, co, building, slot)) return fail('err.notYours');
      return validPrice(price) ? null : fail('err.badPrice');
    },
    run(game, co, { building, slot, price }) {
      ownSlot(game, co, building, slot).slot.price = price;
      return {};
    },
  },

  {
    id: 'setSlotSource',
    /** params: { building, slot, src } — src null disconnects the shelf */
    check(game, co, { building, slot, src }) {
      const found = ownSlot(game, co, building, slot);
      if (!found) return fail('err.notYours');
      if (src != null && !canUseSource(game, co, found.slot.product, src)) return fail('err.badSource');
      return null;
    },
    run(game, co, { building, slot, src }) {
      const found = ownSlot(game, co, building, slot).slot;
      agreeSource(game, co, found, found.product, src);
      return {};
    },
  },

  {
    id: 'setSlotAuto',
    /** params: { building, slot, auto } — hand pricing of this shelf to the assistant */
    check(game, co, { building, slot }) {
      return ownSlot(game, co, building, slot) ? null : fail('err.notYours');
    },
    run(game, co, { building, slot, auto }) {
      ownSlot(game, co, building, slot).slot.auto = !!auto;
      return {};
    },
  },
];
