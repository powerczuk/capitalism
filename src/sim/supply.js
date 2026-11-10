// Supply chain: where goods come from and how they move.
//
// A *source* is written as a short string so it can be stored in the state:
//   'import'        the anonymous import market (shipped from the nearest port)
//   'b12:0'         production line 0 of building b12
//
// Every shelf of a store and every input of a production line points at one
// source. Once a day each of them orders what it is missing; lines that
// cannot serve everybody ration their stock (own company first).

import { blend, ema, EPS } from '../engine/util.js';
import { freightCost, importFreight, modifier, resourceQuality, wageIndex } from './world.js';
import { overdraftLimit } from './accounting.js';
import { slotCapacity } from './market.js';

export const IMPORT = 'import';

export const lineSrc = (buildingId, lineIndex) => `${buildingId}:${lineIndex}`;

export function parseSrc(src) {
  if (!src || typeof src !== 'string') return null;
  if (src === IMPORT) return { kind: 'import' };
  const i = src.lastIndexOf(':');
  if (i <= 0) return null;
  const line = Number(src.slice(i + 1));
  return Number.isInteger(line) ? { kind: 'line', building: src.slice(0, i), line } : null;
}

/** Supply status codes stored on shelves and line inputs (`sup`). */
export const SUP = { OK: 0, NONE: 1, INVALID: 2, NO_FUNDS: 3, SHORT: 4 };

// ---------------------------------------------------------------------------
// Technology and import terms
// ---------------------------------------------------------------------------

/** A company's technology level for a product (never far behind the world). */
export function techOf(game, co, productId) {
  const B = game.content.balance;
  return Math.max(co.tech[productId] ?? B.economy.startTech, game.state.economy.tech - B.research.diffusion);
}

export function importPrice(game, product) {
  return product.cost * game.content.balance.import.markup * modifier(game.state, 'importPrice', product.id);
}

export function importQuality(game, product) {
  const B = game.content.balance;
  return product.type === 'raw' ? B.import.rawQuality : Math.min(90, game.state.economy.tech + B.import.techBonus);
}

// ---------------------------------------------------------------------------
// Resolving and quoting sources
// ---------------------------------------------------------------------------

/** The production line behind a source string, if it currently makes `productId`. */
export function resolveLine(game, src, productId) {
  const parsed = parseSrc(src);
  if (!parsed || parsed.kind !== 'line') return null;
  const building = game.state.buildings[parsed.building];
  const line = building?.lines?.[parsed.line];
  if (!line) return null;
  const recipe = game.content.recipes.find(line.recipe);
  if (!recipe || recipe.output !== productId) return null;
  return { building, line, recipe, index: parsed.line };
}

/**
 * Expected unit cost and quality of what a line produces, judged from the
 * stock in its input stores or — when empty — from quotes of its suppliers.
 */
export function lineEstimate(game, building, line, depth = 0) {
  const { content, state } = game;
  const recipe = content.recipes.get(line.recipe);
  const output = content.products.get(recipe.output);
  const city = state.cities[building.city];
  const co = state.companies[building.co];
  const processing = recipe.cost * wageIndex(game, city) * modifier(state, 'procCost', '*');
  if (recipe.raw) {
    return { uc: processing, q: resourceQuality(city, output.id) ?? 0 };
  }
  let cost = 0;
  let qualitySum = 0;
  let weightSum = 0;
  for (const id in recipe.inputs) {
    const per = recipe.inputs[id];
    const product = content.products.get(id);
    const inp = line.inputs[id];
    let uc;
    let q;
    if (inp && inp.qty > EPS) {
      uc = inp.uc;
      q = inp.q;
    } else {
      const qt = inp && depth < 4 ? quote(game, co, city.id, id, inp.src, depth + 1) : null;
      uc = qt ? qt.unitCost : importPrice(game, product) + importFreight(game, city.id, product);
      q = qt ? qt.quality : importQuality(game, product);
    }
    cost += per * uc;
    const weight = per * product.cost;
    qualitySum += q * weight;
    weightSum += weight;
  }
  const tech = techOf(game, co, output.id);
  const inputQuality = weightSum > 0 ? qualitySum / weightSum : tech;
  return {
    uc: cost + processing,
    q: output.techShare * tech + (1 - output.techShare) * inputQuality,
  };
}

/**
 * Units per day a line can really make right now: its nominal rate, unless
 * it is starved of inputs — then only what it has been managing lately.
 */
export function linePace(line, recipe) {
  return line.idle === 'inputs' && line.made != null ? line.made : recipe.rate;
}

/**
 * What `buyer` would get from a source, delivered to `cityId`.
 * Returns null when the source is unusable (gone, wrong product, not for sale).
 */
export function quote(game, buyer, cityId, productId, src, depth = 0) {
  const { content } = game;
  const product = content.products.find(productId);
  if (!product) return null;
  const parsed = parseSrc(src);
  if (!parsed) return null;

  if (parsed.kind === 'import') {
    if (!product.importable) return null;
    const price = importPrice(game, product);
    const freight = importFreight(game, cityId, product);
    return {
      src: IMPORT,
      kind: 'import',
      own: false,
      seller: null,
      by: IMPORT,
      price,
      freight,
      unitCost: price + freight,
      quality: importQuality(game, product),
      stock: Infinity,
      rate: Infinity,
      free: Infinity,
    };
  }

  const r = resolveLine(game, src, productId);
  if (!r) return null;
  const own = r.building.co === buyer.id;
  if (!own && !r.line.sell) return null;
  const seller = game.state.companies[r.building.co];
  if (!seller?.alive) return null;
  const freight = freightCost(game, r.building.city, cityId, product);
  const est = r.line.qty > EPS && r.line.uc > 0 ? { uc: r.line.uc, q: r.line.q } : lineEstimate(game, r.building, r.line, depth);
  const price = own ? est.uc : r.line.price;
  return {
    src,
    kind: 'line',
    own,
    seller: seller.id,
    by: seller.id,
    building: r.building,
    line: r.line,
    price,
    freight,
    unitCost: price + freight,
    quality: est.q,
    stock: r.line.qty,
    rate: r.recipe.rate,
    free: Math.max(0, linePace(r.line, r.recipe) - (r.line.out ?? 0)), // spare units per day
    ready: r.building.ready <= game.state.day,
  };
}

/** Every source `buyer` could use for a product in a city, cheapest first. */
export function listSources(game, buyer, cityId, productId) {
  const out = [];
  const imp = quote(game, buyer, cityId, productId, IMPORT);
  if (imp) out.push(imp);
  const recipes = game.content.recipes;
  for (const b of game.producers()) {
    for (let i = 0; i < b.lines.length; i++) {
      const line = b.lines[i];
      if (!line || recipes.get(line.recipe).output !== productId) continue;
      if (b.co !== buyer.id && !line.sell) continue;
      const q = quote(game, buyer, cityId, productId, lineSrc(b.id, i));
      if (q) out.push(q);
    }
  }
  return out.sort((a, b) => a.unitCost - b.unitCost);
}

/** A sensible default source: own production if any, otherwise the cheapest offer. */
export function defaultSource(game, buyer, cityId, productId) {
  const sources = listSources(game, buyer, cityId, productId);
  const own = sources.find((s) => s.own);
  return (own ?? sources[0])?.src ?? null;
}

/** May `buyer` use this source for this product? (validation for commands) */
export function canUseSource(game, buyer, productId, src) {
  const parsed = parseSrc(src);
  if (!parsed) return false;
  const product = game.content.products.find(productId);
  if (!product) return false;
  if (parsed.kind === 'import') return !!product.importable;
  const r = resolveLine(game, src, productId);
  return !!r && (r.building.co === buyer.id || r.line.sell);
}

// ---------------------------------------------------------------------------
// Stock targets
// ---------------------------------------------------------------------------

/** How much a shelf wants to have in stock. */
export function slotTarget(game, b, slot, product) {
  const R = game.content.balance.retail;
  const cap = slotCapacity(game, b, product);
  const flow = Math.min(cap, Math.max(slot.d ?? cap * 0.5, slot.s ?? 0));
  return Math.max(cap * 0.25, flow * R.stockDays);
}

/** How much of one input a production line wants to have in stock. */
export function inputTarget(game, line, recipe, per) {
  const P = game.content.balance.production;
  const pace = line.made ?? recipe.rate;
  return per * Math.max(recipe.rate * 1.2, pace * P.inputDays);
}

// ---------------------------------------------------------------------------
// Daily deliveries
// ---------------------------------------------------------------------------

function receive(ref, qty, unitCost, quality) {
  ref.q = blend(ref.qty, ref.q, qty, quality);
  ref.uc = blend(ref.qty, ref.uc, qty, unitCost);
  ref.qty += qty;
}

function runSupply(game) {
  const { state, content } = game;
  const day = state.day;
  const alpha = content.balance.ema;
  const byLine = new Map(); // source string → requests
  const bought = new Map(); // company id → { productId: units bought outside today }
  const lineOut = new Map(); // line → [units out, units to other companies]
  const fundsCache = new Map();

  const hasFunds = (co) => {
    let ok = fundsCache.get(co.id);
    if (ok === undefined) {
      ok = co.cash > -overdraftLimit(game, co);
      fundsCache.set(co.id, ok);
    }
    return ok;
  };
  const noteBought = (co, productId, qty) => {
    let m = bought.get(co.id);
    if (!m) bought.set(co.id, (m = {}));
    m[productId] = (m[productId] || 0) + qty;
  };

  const request = (b, co, ref, productId, want, isSlot) => {
    const src = ref.src;
    if (!src) {
      ref.sup = SUP.NONE;
      return;
    }
    if (src === IMPORT) {
      const product = content.products.get(productId);
      if (!product.importable) {
        ref.sup = SUP.INVALID;
        return;
      }
      if (!hasFunds(co)) {
        ref.sup = SUP.NO_FUNDS;
        return;
      }
      const unitCost = importPrice(game, product) + importFreight(game, b.city, product);
      co.cash -= want * unitCost;
      receive(ref, want, unitCost, importQuality(game, product));
      if (isSlot) ref.by = IMPORT;
      ref.sup = SUP.OK;
      noteBought(co, productId, want);
      return;
    }
    const key = `${src}|${productId}`;
    let list = byLine.get(key);
    if (!list) byLine.set(key, (list = []));
    list.push({ b, co, ref, src, productId, want, isSlot });
  };

  for (const b of Object.values(state.buildings)) {
    if (b.ready > day) continue;
    const co = state.companies[b.co];
    if (b.kind === 'retail') {
      for (const slot of b.slots) {
        if (!slot) continue;
        const want = slotTarget(game, b, slot, content.products.get(slot.product)) - slot.qty;
        if (want > EPS) request(b, co, slot, slot.product, want, true);
        else if (slot.src) slot.sup = SUP.OK;
        else slot.sup = SUP.NONE;
      }
    } else if (b.kind === 'producer') {
      for (const line of b.lines) {
        if (!line) continue;
        const recipe = content.recipes.get(line.recipe);
        for (const id in recipe.inputs) {
          const inp = line.inputs[id];
          const want = inputTarget(game, line, recipe, recipe.inputs[id]) - inp.qty;
          if (want > EPS) request(b, co, inp, id, want, false);
          else if (inp.src) inp.sup = SUP.OK;
          else inp.sup = SUP.NONE;
        }
      }
    }
  }

  for (const requests of byLine.values()) {
    const { src, productId } = requests[0];
    const r = resolveLine(game, src, productId);
    const seller = r ? state.companies[r.building.co] : null;
    if (!r || !seller?.alive) {
      for (const q of requests) q.ref.sup = SUP.INVALID;
      continue;
    }
    const product = content.products.get(productId);
    const { line, building } = r;
    let available = building.ready <= day ? line.qty : 0;

    // Own company is served first, then outside customers share the rest.
    for (const pass of [true, false]) {
      const group = requests.filter((q) => (q.co.id === seller.id) === pass);
      if (!group.length) continue;
      let wanted = 0;
      for (const q of group) {
        if (!pass && !line.sell) q.ref.sup = SUP.INVALID;
        else if (!pass && !hasFunds(q.co)) q.ref.sup = SUP.NO_FUNDS;
        else {
          q.active = true;
          wanted += q.want;
        }
      }
      if (wanted <= EPS) continue;
      const ratio = Math.min(1, available / wanted);
      for (const q of group) {
        if (!q.active) continue;
        const qty = q.want * ratio;
        if (qty <= EPS) {
          q.ref.sup = SUP.SHORT;
          continue;
        }
        const freight = freightCost(game, building.city, q.b.city, product);
        if (pass) {
          q.co.cash -= qty * freight;
          receive(q.ref, qty, line.uc + freight, line.q);
        } else {
          const value = qty * line.price;
          q.co.cash -= value + qty * freight;
          receive(q.ref, qty, line.price + freight, line.q);
          seller.cash += value;
          seller.m.b2b += value;
          seller.m.cogs += qty * line.uc;
          building.m.rev += value;
          building.m.cogs += qty * line.uc;
          line.rev += value;
          noteBought(q.co, productId, qty);
        }
        if (q.isSlot) q.ref.by = seller.id;
        q.ref.sup = ratio < 0.999 ? SUP.SHORT : SUP.OK;
        const out = lineOut.get(line) ?? [0, 0];
        out[0] += qty;
        if (!pass) out[1] += qty;
        lineOut.set(line, out);
      }
      available -= wanted * ratio;
      line.qty = Math.max(0, line.qty - wanted * ratio);
    }
  }

  // Moving averages: outflow of every line, outside purchases of every company.
  for (const b of Object.values(state.buildings)) {
    if (b.kind !== 'producer' || b.ready > day) continue;
    for (const line of b.lines) {
      if (!line) continue;
      const out = lineOut.get(line);
      line.out = ema(line.out, out ? out[0] : 0, alpha);
      line.ext = ema(line.ext, out ? out[1] : 0, alpha);
    }
  }
  for (const id of state.companyOrder) {
    const co = state.companies[id];
    if (!co.alive) continue;
    const today = bought.get(id);
    for (const pid in co.buy) {
      co.buy[pid] = ema(co.buy[pid], today?.[pid] ?? 0, alpha);
      if (co.buy[pid] < 1e-3 && !today?.[pid]) delete co.buy[pid];
    }
    if (today) {
      for (const pid in today) if (!(pid in co.buy)) co.buy[pid] = today[pid] * alpha;
    }
  }
}

export const supplySystem = {
  id: 'supply',
  order: 50,
  daily: runSupply,
};
