// Research: laboratories raise a company's technology level for a product,
// which raises the quality of everything it manufactures from then on.

import { fail } from '../engine/game.js';
import { isIndex } from '../engine/util.js';
import { overdraftLimit } from './accounting.js';
import { labCount, ownBuilding } from './construction.js';
import { techOf } from './supply.js';

/** Tech points one month of research adds at the given total budget. */
export function researchGain(game, budget, tech) {
  const G = game.content.balance.research;
  return G.gain * Math.sqrt(budget / G.budgetScale) * Math.max(0, 1 - tech / 100) ** G.exponent;
}

function runMonthly(game) {
  const { state } = game;
  // Several labs on the same product pool their budgets (with diminishing returns).
  const budgets = new Map(); // companyId → { productId: budget }
  for (const b of Object.values(state.buildings)) {
    if (b.kind !== 'research' || b.ready > state.day) continue;
    for (const lab of b.labs) {
      if (!lab) continue;
      let m = budgets.get(b.co);
      if (!m) budgets.set(b.co, (m = {}));
      m[lab.product] = (m[lab.product] || 0) + lab.budget;
    }
  }
  for (const [companyId, perProduct] of budgets) {
    const co = state.companies[companyId];
    if (!co.alive || co.cash < -overdraftLimit(game, co)) continue;
    for (const pid in perProduct) {
      const budget = perProduct[pid];
      co.cash -= budget;
      co.m.rnd += budget;
      const tech = techOf(game, co, pid);
      co.tech[pid] = Math.min(100, tech + researchGain(game, budget, tech));
    }
  }
}

export const researchSystem = {
  id: 'research',
  order: 68, // before finance closes the month
  monthly: runMonthly,
};

function ownLabBuilding(game, co, building) {
  const b = ownBuilding(game, co, building);
  return b && b.kind === 'research' ? b : null;
}

export const researchCommands = [
  {
    id: 'setLab',
    /** params: { building, lab, product, budget } — assign a lab team to a product */
    check(game, co, { building, lab, product, budget }) {
      const { content } = game;
      const b = ownLabBuilding(game, co, building);
      if (!b) return fail('err.notYours');
      const type = content.buildingTypes.get(b.type);
      if (!Number.isInteger(lab) || lab < 0 || lab >= labCount(type, b.level)) return fail('err.badSlot');
      const p = content.products.find(product);
      if (!p || p.type === 'raw') return fail('err.badProduct');
      const G = content.balance.research;
      if (typeof budget !== 'number' || !(budget >= 1) || budget > G.maxBudget) return fail('err.badValue');
      return null;
    },
    run(game, co, { building, lab, product, budget }) {
      game.state.buildings[building].labs[lab] = { product, budget: Math.round(budget) };
      return {};
    },
  },
  {
    id: 'clearLab',
    /** params: { building, lab } */
    check(game, co, { building, lab }) {
      const b = ownLabBuilding(game, co, building);
      return b && isIndex(b.labs, lab) && b.labs[lab] ? null : fail('err.notYours');
    },
    run(game, co, { building, lab }) {
      game.state.buildings[building].labs[lab] = null;
      return {};
    },
  },
];
