// The simulation rules as one plugin: systems (what happens every day/month)
// and commands (what a company may do). The order numbers of the systems
// define the daily pipeline:
//
//   world(5) → companies(8) → economy(10) → worldEvents(20) → construction(30)
//   → production(40) → supply(50) → retail(60) → brand(66) → research(68)
//   → finance(70) → stocks(80) → [ai(90)] → goals(95)

import { BALANCE } from './balance.js';
import { worldSystem } from './world.js';
import { companySystem } from './company.js';
import { economySystem } from './economy.js';
import { worldEventSystem } from './worldEvents.js';
import { constructionCommands, constructionSystem } from './construction.js';
import { productionCommands, productionSystem } from './production.js';
import { supplySystem } from './supply.js';
import { retailCommands, retailSystem } from './retail.js';
import { financeCommands, financeSystem } from './finance.js';
import { brandCommands, brandSystem } from './brand.js';
import { researchCommands, researchSystem } from './research.js';
import { stockCommands, stockSystem } from './stocks.js';
import { goalCommands, goalSystem } from './goals.js';

export const simPlugin = {
  id: 'sim',
  install(content) {
    content.tune(BALANCE);
    content.systems.registerAll([
      worldSystem,
      companySystem,
      economySystem,
      worldEventSystem,
      constructionSystem,
      productionSystem,
      supplySystem,
      retailSystem,
      financeSystem,
      brandSystem,
      researchSystem,
      stockSystem,
      goalSystem,
    ]);
    content.commands.registerAll([
      ...constructionCommands,
      ...productionCommands,
      ...retailCommands,
      ...financeCommands,
      ...brandCommands,
      ...researchCommands,
      ...stockCommands,
      ...goalCommands,
    ]);
  },
};
