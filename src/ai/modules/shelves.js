// Shelves: decide what to sell on empty store shelves.

import { shelfOption, storeShelf } from '../analysis.js';

/** Fill the empty shelves of one store. Returns the number of shelves set. */
export function fillShelves(ctx, b) {
  const { game, mem } = ctx;
  const { content, state } = game;
  const type = content.buildingTypes.get(b.type);
  let changed = 0;
  for (let i = 0; i < b.slots.length; i++) {
    if (b.slots[i]) continue;
    const taken = new Set(b.slots.filter(Boolean).map((s) => s.product));
    const options = [];
    for (const product of content.consumerProducts) {
      if (!type.categories.includes(product.category) || taken.has(product.id)) continue;
      if (mem.banned?.[`${b.id}:${product.id}`] > state.day) continue;
      const option = shelfOption(ctx, storeShelf(game, b, product), product.id);
      if (!option || option.profitDay <= 0) continue;
      option.score = option.profitDay * ctx.catWeight(product) * ctx.noise();
      options.push(option);
    }
    options.sort((x, y) => y.score - x.score);
    const pick = ctx.pick(options);
    if (!pick) break;
    const result = ctx.act('setSlot', { building: b.id, slot: i, product: pick.productId, src: pick.src, price: pick.price });
    if (result.ok) {
      changed += 1;
      ctx.reserveLine(pick.source, pick.units);
      ctx.touchMarket(b.city, pick.productId);
    }
  }
  return changed;
}

export const shelvesModule = {
  id: 'shelves',
  order: 40,
  eager: true,
  run(ctx) {
    for (const b of ctx.game.buildingsOf(ctx.co.id)) {
      if (b.kind === 'retail' && b.slots.includes(null)) fillShelves(ctx, b);
    }
  },
};
