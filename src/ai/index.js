// Computer players as a plugin.
//
//   difficulty.js     how *well* an AI plays (4 levels)
//   personalities.js  what an AI *likes* to do (6 characters)
//   modules/          behaviour modules — one file per area of the business
//   controller.js     gives each AI company its turn and runs due modules
//   analysis.js       the business maths the modules (and the UI) share
//   assistant.js      the pricing assistant of the human player's "auto" shelves
//
// To teach the AI a new trick, register another module:
//   content.aiModules.register({ id: 'myModule', order: 55, run(ctx) {...} })
// and give it a cadence in the difficulty levels that should use it.

import { DIFFICULTIES } from './difficulty.js';
import { PERSONALITIES } from './personalities.js';
import { runCompany } from './controller.js';
import { runAssistant } from './assistant.js';
import { financeModule } from './modules/finance.js';
import { pruneModule } from './modules/prune.js';
import { sourcingModule } from './modules/sourcing.js';
import { shelvesModule } from './modules/shelves.js';
import { pricingModule } from './modules/pricing.js';
import { storesModule } from './modules/stores.js';
import { factoriesModule, rawMaterialsModule } from './modules/factories.js';
import { marketingModule } from './modules/marketing.js';
import { researchModule } from './modules/research.js';
import { stockModule } from './modules/stock.js';
import { investModule } from './modules/invest.js';

export const aiSystem = {
  id: 'ai',
  order: 90,
  daily(game) {
    const { state, content } = game;
    const modules = (content._aiModuleList ??= [...content.aiModules.all()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50)));
    for (const id of state.companyOrder) {
      const co = state.companies[id];
      if (co.alive && co.ai) runCompany(game, co, modules);
    }
    // the human player's shelves on "auto" are looked after every day (see assistant.js)
    runAssistant(game, game.human);
  },
};

export const aiPlugin = {
  id: 'ai',
  install(content) {
    content.difficulties.registerAll(DIFFICULTIES);
    content.personalities.registerAll(PERSONALITIES);
    content.aiModules.registerAll([
      financeModule,
      pruneModule,
      sourcingModule,
      shelvesModule,
      pricingModule,
      storesModule,
      factoriesModule,
      rawMaterialsModule,
      marketingModule,
      researchModule,
      stockModule,
      investModule,
    ]);
    content.systems.register(aiSystem);
  },
};
