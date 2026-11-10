// Pricing: shelf prices and wholesale prices of production lines.

import { EPS, roundSig } from '../../engine/util.js';
import { importPrice, lineEstimate } from '../../sim/supply.js';
import { shelfPrice } from '../analysis.js';

function priceShelves(ctx) {
  const { game, co, profile, persona, rng } = ctx;
  for (const b of game.buildingsOf(co.id)) {
    if (b.kind !== 'retail' || !game.isReady(b)) continue;
    for (let i = 0; i < b.slots.length; i++) {
      const slot = b.slots[i];
      if (!slot) continue;
      const result = shelfPrice(game, co, b, i, {
        mode: profile.pricing,
        markup: ctx.markup,
        stance: persona.w.price,
        cannibal: profile.cannibalAware,
      });
      if (!result) continue;
      // Imperfect managers do not hit the ideal price exactly.
      let price = result.price * (profile.noise > 0 ? rng.noise(profile.noise * 0.25, 0.7) : 1);
      const unitCost = slot.qty > EPS ? slot.uc : 0;
      if (unitCost > 0) price = Math.max(price, unitCost * 1.03);
      price = roundSig(price, 3);
      if (Math.abs(price - slot.price) / slot.price > 0.01) {
        ctx.act('setSlotPrice', { building: b.id, slot: i, price });
      }
    }
  }
}

function priceLines(ctx) {
  const { game, co, profile } = ctx;
  const { content } = game;
  for (const b of game.buildingsOf(co.id)) {
    if (b.kind !== 'producer') continue;
    for (let i = 0; i < b.lines.length; i++) {
      const line = b.lines[i];
      if (!line || !line.sell) continue;
      const recipe = content.recipes.get(line.recipe);
      const product = content.products.get(recipe.output);
      const unitCost = line.qty > EPS && line.uc > 0 ? line.uc : lineEstimate(game, b, line).uc;
      const ceiling = importPrice(game, product) * 0.95; // must beat the import market
      let margin = 0.25;
      if (profile.rank >= 4) {
        // Sharp players price by how busy the line is.
        const load = (line.out ?? 0) / recipe.rate;
        margin = load > 0.9 ? 0.45 : load < 0.4 ? 0.12 : 0.25;
      }
      let price = Math.min(Math.max(unitCost * (1 + margin), unitCost * 1.08), Math.max(ceiling, unitCost * 1.08));
      price = roundSig(price, 3);
      if (Math.abs(price - line.price) / line.price > 0.01) {
        ctx.act('setLineSale', { building: b.id, line: i, price });
      }
    }
  }
}

export const pricingModule = {
  id: 'pricing',
  order: 50,
  run(ctx) {
    priceShelves(ctx);
    priceLines(ctx);
  },
};
