// Example mod: coffee.
//
// A complete, working plugin that shows the main extension points:
//   - a new raw material that cannot be produced here (import only)
//   - a new consumer product and the recipe that makes it
//   - a new world event with its own news text in two languages
//
// It is enabled in ./index.js. Remove it from that list and the game runs
// without coffee — nothing else refers to it.

import { addModifier } from '../sim/world.js';

export const coffeeMod = {
  id: 'mod-coffee',

  install(content) {
    // 1. Products. A raw material without a recipe is import-only.
    content.products.register({
      id: 'coffee_beans',
      type: 'raw',
      icon: '🫘',
      cost: 2.2,
      weight: 1,
      name: { pl: 'Ziarna kawy', en: 'Coffee beans' },
    });
    content.products.register({
      id: 'coffee',
      type: 'consumer',
      category: 'food', // sold wherever food is sold
      icon: '☕',
      spend: 34, // $ per 1000 inhabitants per day
      weights: { price: 0.3, quality: 0.35, brand: 0.35 },
      necessity: 0.6,
      techShare: 0.35,
      weight: 0.4,
      name: { pl: 'Kawa', en: 'Coffee' },
    });

    // 2. Recipe. Cost and price of the product are derived from it.
    content.recipes.register({
      id: 'coffee',
      building: 'factory',
      output: 'coffee',
      inputs: { coffee_beans: 0.6 },
      cost: 0.5,
    });

    // 3. A world event, using a temporary modifier.
    content.worldEvents.register({
      id: 'coffeeFrost',
      weight: 1,
      cooldown: 1080,
      fire(game) {
        const months = game.rng.int(6, 10);
        addModifier(game, { kind: 'importPrice', key: 'coffee_beans', factor: 1.45, days: months * 30, source: 'coffeeFrost' });
        game.news('news.event.coffeeFrost', { months }, { tone: 'bad' });
      },
    });

    // 4. Texts used by this mod.
    content.translate('pl', {
      'news.event.coffeeFrost': 'Przymrozki na plantacjach: ziarna kawy droższe o 45% przez {months} mies.',
    });
    content.translate('en', {
      'news.event.coffeeFrost': 'Frost on the plantations: coffee beans cost 45% more for {months} months.',
    });
  },
};
