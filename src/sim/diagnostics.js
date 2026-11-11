// Diagnostics: a list of things that need the owner's attention.
// The UI shows them as alerts; texts are looked up by `code` (i18n key
// `diag.<code>`), so this module stays language-free.

import { EPS } from '../engine/util.js';
import { creditLimit } from './accounting.js';
import { SUP } from './supply.js';

/**
 * @returns {Array<{level:'bad'|'warn'|'info', code:string, building?:string, slot?:number, line?:number, product?:string, input?:string, n?:number, company?:string, pct?:number, days?:number}>}
 */
export function diagnose(game, co) {
  const { state, content } = game;
  const out = [];
  const buildings = game.buildingsOf(co.id);

  if (co.cash < 0) out.push({ level: 'bad', code: 'cashNegative' });
  if (co.negDays > 0) {
    out.push({ level: 'bad', code: 'distress', days: Math.max(0, content.balance.bankruptcy.graceDays - co.negDays) });
  }
  if (co.loan > creditLimit(game, co) * 1.001) out.push({ level: 'warn', code: 'overCredit' });

  // Somebody is buying the company up.
  for (const holderId in co.shares.held) {
    const pct = (100 * co.shares.held[holderId]) / co.shares.total;
    const holder = state.companies[holderId];
    if (pct >= 10 && holder?.alive) {
      out.push({ level: pct >= 25 ? 'bad' : 'warn', code: 'raider', company: holder.name, pct: Math.round(pct) });
    }
  }

  if (!buildings.length) out.push({ level: 'info', code: 'noBuildings' });

  for (const b of buildings) {
    if (b.ready > state.day) continue;

    if (b.kind === 'retail') {
      const empty = b.slots.filter((s) => !s).length;
      if (empty) out.push({ level: empty === b.slots.length ? 'warn' : 'info', code: 'emptyShelves', building: b.id, n: empty });
      b.slots.forEach((slot, i) => {
        if (!slot) return;
        const at = { building: b.id, slot: i, product: slot.product };
        if (!slot.src) out.push({ level: 'bad', code: 'shelfNoSource', ...at });
        else if (slot.sup === SUP.INVALID) out.push({ level: 'bad', code: 'shelfBadSource', ...at });
        else if (slot.sup === SUP.PRICE) out.push({ level: 'bad', code: 'shelfPriceUp', ...at });
        else if (slot.sup === SUP.NO_FUNDS) out.push({ level: 'bad', code: 'shelfNoFunds', ...at });
        else if (slot.so > 0.5) out.push({ level: 'warn', code: 'shelfShort', ...at });
        if (slot.qty > EPS && slot.price < slot.uc) out.push({ level: 'warn', code: 'shelfBelowCost', ...at });
        else if (slot.last && slot.last.profit < 0 && slot.last.units > 0) out.push({ level: 'warn', code: 'shelfLoss', ...at });
        if (slot.cl > 0.6) out.push({ level: 'info', code: 'shelfCapacity', ...at });
      });
    } else if (b.kind === 'producer') {
      const used = b.lines.filter(Boolean).length;
      if (!used) out.push({ level: 'warn', code: 'plantEmpty', building: b.id });
      b.lines.forEach((line, i) => {
        if (!line) return;
        const recipe = content.recipes.get(line.recipe);
        const at = { building: b.id, line: i, product: recipe.output };
        let inputProblem = false;
        for (const id in line.inputs) {
          const inp = line.inputs[id];
          const where = { ...at, input: id };
          if (!inp.src) out.push({ level: 'bad', code: 'inputNoSource', ...where });
          else if (inp.sup === SUP.INVALID) out.push({ level: 'bad', code: 'inputBadSource', ...where });
          else if (inp.sup === SUP.PRICE) out.push({ level: 'bad', code: 'inputPriceUp', ...where });
          else if (inp.sup === SUP.NO_FUNDS) out.push({ level: 'bad', code: 'inputNoFunds', ...where });
          else if (inp.sup === SUP.SHORT && line.idle === 'inputs') out.push({ level: 'warn', code: 'inputShort', ...where });
          else continue;
          inputProblem = true;
        }
        if (!inputProblem && line.idle === 'full' && (line.out ?? 0) < recipe.rate * 0.05) {
          out.push({ level: 'warn', code: 'lineNoBuyers', ...at });
        }
      });
    } else if (b.kind === 'research') {
      if (!b.labs.some(Boolean)) out.push({ level: 'info', code: 'labEmpty', building: b.id });
    }
  }

  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
