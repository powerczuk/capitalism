// Production: farms, mines and factories turn inputs into goods.
//
// A producer building has a few *lines*. Each line runs one recipe, keeps a
// small store of every input (filled by supply.js) and an output store that
// own buildings and — if the owner allows it — other companies draw from.

import { fail } from '../engine/game.js';
import { blend, ema, EPS, isIndex, roundSig } from '../engine/util.js';
import { modifier, resourceQuality, wageIndex } from './world.js';
import { agreeSource, canUseSource, defaultSource, techOf, validPrice } from './supply.js';
import { lineCount, ownBuilding, writeOffLine } from './construction.js';

function runLine(game, b, co, city, line, wage, procMod) {
  const { content, state } = game;
  const P = content.balance.production;
  const recipe = content.recipes.get(line.recipe);
  const output = content.products.get(recipe.output);

  let rate = recipe.rate;
  if (recipe.raw) rate *= modifier(state, 'yield', city.id);
  const room = recipe.rate * P.outputDays - line.qty;
  let n = Math.min(rate, room);
  let short = false;
  if (n > EPS) {
    for (const id in recipe.inputs) {
      const possible = line.inputs[id].qty / recipe.inputs[id];
      if (possible < n) {
        n = possible;
        short = true;
      }
    }
  }

  if (n > EPS) {
    let inputCost = 0;
    let qualitySum = 0;
    let weightSum = 0;
    for (const id in recipe.inputs) {
      const per = recipe.inputs[id];
      const inp = line.inputs[id];
      const used = n * per;
      inputCost += used * inp.uc;
      const weight = per * content.products.get(id).cost;
      qualitySum += inp.q * weight;
      weightSum += weight;
      inp.qty -= used;
      if (inp.qty < EPS) inp.qty = 0;
    }
    const processing = recipe.cost * wage * procMod;
    let quality;
    if (recipe.raw) {
      quality = resourceQuality(city, output.id) ?? 0;
    } else {
      const tech = techOf(game, co, output.id);
      const inputQuality = weightSum > 0 ? qualitySum / weightSum : tech;
      quality = output.techShare * tech + (1 - output.techShare) * inputQuality;
    }
    co.cash -= n * processing; // wages and energy are capitalised into the stock value
    line.q = blend(line.qty, line.q, n, quality);
    line.uc = blend(line.qty, line.uc, n, inputCost / n + processing);
    line.qty += n;
    line.idle = short ? 'inputs' : null;
  } else {
    n = 0;
    line.idle = room <= EPS ? 'full' : 'inputs';
  }
  line.made = ema(line.made, n, content.balance.ema);
}

export const productionSystem = {
  id: 'production',
  order: 40,
  daily(game) {
    const { state } = game;
    const procMod = modifier(state, 'procCost', '*');
    for (const b of Object.values(state.buildings)) {
      if (b.kind !== 'producer' || b.ready > state.day) continue;
      const co = state.companies[b.co];
      const city = state.cities[b.city];
      const wage = wageIndex(game, city);
      for (const line of b.lines) if (line) runLine(game, b, co, city, line, wage, procMod);
    }
  },
};

function ownLine(game, co, building, index) {
  const b = ownBuilding(game, co, building);
  if (!b || b.kind !== 'producer' || !isIndex(b.lines, index)) return null;
  const line = b.lines[index];
  return line ? { b, line } : null;
}

export const productionCommands = [
  {
    id: 'setLine',
    /** params: { building, line, recipe, sources?: {productId: src}, sell?: boolean, price?: number } */
    check(game, co, { building, line: index, recipe: recipeId, sources, price }) {
      const { content, state } = game;
      const b = ownBuilding(game, co, building);
      if (!b || b.kind !== 'producer') return fail('err.notYours');
      const type = content.buildingTypes.get(b.type);
      if (!Number.isInteger(index) || index < 0 || index >= lineCount(type, b.level)) return fail('err.badSlot');
      const recipe = content.recipes.find(recipeId);
      if (!recipe || recipe.building !== b.type) return fail('err.badRecipe');
      if (recipe.raw && resourceQuality(state.cities[b.city], recipe.output) == null) return fail('err.noResource');
      if (price != null && !validPrice(price)) return fail('err.badPrice');
      for (const id in sources || {}) {
        if (!Object.hasOwn(recipe.inputs, id)) return fail('err.badSource');
        if (sources[id] != null && !canUseSource(game, co, id, sources[id])) return fail('err.badSource');
      }
      return null;
    },
    run(game, co, { building, line: index, recipe: recipeId, sources, sell, price }) {
      const { content, state } = game;
      const b = state.buildings[building];
      const recipe = content.recipes.get(recipeId);
      const output = content.products.get(recipe.output);
      let line = b.lines[index];
      if (line && line.recipe !== recipe.id) {
        writeOffLine(game, co, line);
        line = null;
      }
      if (!line) {
        line = {
          recipe: recipe.id,
          inputs: {},
          qty: 0, // output stock
          q: 0, // quality of the output stock
          uc: 0, // unit cost of the output stock
          sell: false, // offered to other companies?
          price: roundSig(output.cost * 1.15, 3),
          made: null, // smoothed units produced per day
          out: null, // smoothed units leaving per day
          ext: null, // … of which to other companies
          rev: 0, // outside revenue this month
          last: null,
          idle: null, // 'inputs' | 'full' | null — why the line stood still
        };
        for (const id in recipe.inputs) {
          line.inputs[id] = { src: null, qty: 0, q: 0, uc: 0, sup: 0 };
          agreeSource(game, co, line.inputs[id], id, defaultSource(game, co, b.city, id));
        }
        b.lines[index] = line;
      }
      for (const id in sources || {}) agreeSource(game, co, line.inputs[id], id, sources[id]);
      if (sell != null) line.sell = !!sell;
      if (price != null) line.price = price;
      return {};
    },
  },

  {
    id: 'clearLine',
    /** params: { building, line } */
    check(game, co, { building, line }) {
      return ownLine(game, co, building, line) ? null : fail('err.notYours');
    },
    run(game, co, { building, line }) {
      const found = ownLine(game, co, building, line);
      writeOffLine(game, co, found.line);
      found.b.lines[line] = null;
      return {};
    },
  },

  {
    id: 'setLineSource',
    /** params: { building, line, input, src } — src null disconnects the input */
    check(game, co, { building, line, input, src }) {
      const found = ownLine(game, co, building, line);
      if (!found) return fail('err.notYours');
      if (typeof input !== 'string' || !Object.hasOwn(found.line.inputs, input)) return fail('err.badSource');
      if (src != null && !canUseSource(game, co, input, src)) return fail('err.badSource');
      return null;
    },
    run(game, co, { building, line, input, src }) {
      agreeSource(game, co, ownLine(game, co, building, line).line.inputs[input], input, src);
      return {};
    },
  },

  {
    id: 'setLineSale',
    /** params: { building, line, sell?: boolean, price?: number } */
    check(game, co, { building, line, price }) {
      if (!ownLine(game, co, building, line)) return fail('err.notYours');
      if (price != null && !validPrice(price)) return fail('err.badPrice');
      return null;
    },
    run(game, co, { building, line, sell, price }) {
      const found = ownLine(game, co, building, line).line;
      if (sell != null) found.sell = !!sell;
      if (price != null) found.price = price;
      return {};
    },
  },
];
