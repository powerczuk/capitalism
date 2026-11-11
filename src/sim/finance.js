// Finance: running costs, interest, monthly book closing, loans, bankruptcy.

import { fail } from '../engine/game.js';
import { assetsOf, creditLimit, interestRate, newLedger, overdraftLimit, pretaxOf, profitOf } from './accounting.js';
import { dissolveCompany } from './company.js';
import { upkeepOf } from './construction.js';
import { DAYS_PER_MONTH, DAYS_PER_YEAR } from '../engine/calendar.js';

const MAX_REPORTS = 240; // 20 years of monthly history

export function bankrupt(game, co) {
  game.news('news.bankrupt', { company: co.name }, { tone: 'bad', co: co.id });
  dissolveCompany(game, co);
  co.bankrupt = true;
  game.bus.emit('bankrupt', co);
}

function runDaily(game) {
  const { state, content } = game;
  const L = content.balance.loan;
  const day = state.day;

  for (const b of Object.values(state.buildings)) {
    if (b.ready > day) continue;
    const cost = upkeepOf(game, b) / DAYS_PER_MONTH;
    const co = state.companies[b.co];
    co.cash -= cost;
    co.m.opex += cost;
    b.m.opex += cost;
  }

  for (const id of state.companyOrder) {
    const co = state.companies[id];
    if (!co.alive) continue;
    if (co.loan > 0) {
      const interest = (co.loan * interestRate(game, co)) / DAYS_PER_YEAR;
      co.cash -= interest;
      co.m.interest += interest;
    }
    if (co.cash < 0) {
      const interest = (-co.cash * (state.economy.interest + L.spread + L.penalty)) / DAYS_PER_YEAR;
      co.cash -= interest;
      co.m.interest += interest;
      const assets = assetsOf(game, co);
      const insolvent = assets.total - co.loan < 0 || co.cash < -overdraftLimit(game, co);
      if (insolvent) {
        co.negDays += 1;
        if (co.negDays === 30) game.news('news.distress', { company: co.name }, { tone: 'bad', co: co.id });
        if (co.negDays >= content.balance.bankruptcy.graceDays) bankrupt(game, co);
      } else {
        co.negDays = Math.max(0, co.negDays - 1);
      }
    } else if (co.negDays > 0) {
      co.negDays = Math.max(0, co.negDays - 2);
    }
  }
}

function runMonthly(game) {
  const { state, content } = game;
  const D = content.balance.building;
  const day = state.day;

  for (const b of Object.values(state.buildings)) {
    const co = state.companies[b.co];
    if (b.ready <= day) {
      const floor = b.cost * D.bookFloor;
      const depreciation = Math.min(b.cost * D.depreciation, Math.max(0, b.book - floor));
      b.book -= depreciation;
      co.m.depr += depreciation;
    }
    const profit = b.m.rev - b.m.cogs - b.m.opex;
    b.last = { rev: Math.round(b.m.rev), profit: Math.round(profit) };
    b.hist.push(Math.round(profit));
    if (b.hist.length > 24) b.hist.shift();
    b.m = { rev: 0, cogs: 0, opex: 0 };
    if (b.slots) {
      for (const s of b.slots) {
        if (!s) continue;
        s.last = { rev: Math.round(s.rev), profit: Math.round(s.rev - s.cogs), units: Math.round(s.units) };
        s.rev = 0;
        s.cogs = 0;
        s.units = 0;
      }
    }
    if (b.lines) {
      for (const line of b.lines) {
        if (!line) continue;
        line.last = { rev: Math.round(line.rev) };
        line.rev = 0;
      }
    }
  }

  for (const id of state.companyOrder) {
    const co = state.companies[id];
    if (!co.alive) continue;
    // Income tax on the month's profit; losses reduce future tax bills.
    const pretax = pretaxOf(co.m);
    const taxable = pretax - (co.lossCarry || 0);
    if (taxable > 0) {
      const tax = taxable * content.balance.tax.rate;
      co.cash -= tax;
      co.m.tax += tax;
      co.lossCarry = 0;
    } else {
      co.lossCarry = Math.max(0, -taxable);
    }
    const assets = assetsOf(game, co);
    const report = { d: day };
    for (const key in co.m) report[key] = Math.round(co.m[key]);
    report.profit = Math.round(profitOf(co.m));
    report.cash = Math.round(co.cash);
    report.loan = Math.round(co.loan);
    report.assets = Math.round(assets.total);
    report.equity = Math.round(assets.total - co.loan);
    report.price = Math.round(co.price * 1000) / 1000;
    co.reports.push(report);
    if (co.reports.length > MAX_REPORTS) co.reports.shift();
    co.m = newLedger();
  }
}

export const financeSystem = {
  id: 'finance',
  order: 70,
  daily: runDaily,
  monthly: runMonthly,
};

const validAmount = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;

export const financeCommands = [
  {
    id: 'borrow',
    /** params: { amount } */
    check(game, co, { amount }) {
      if (!validAmount(amount)) return fail('err.badValue');
      if (co.loan + amount > creditLimit(game, co) + 1) return fail('err.creditLimit');
      return null;
    },
    run(game, co, { amount }) {
      co.loan += amount;
      co.cash += amount;
      return {};
    },
  },
  {
    id: 'repay',
    /** params: { amount } — capped at the outstanding loan */
    check(game, co, { amount }) {
      if (!validAmount(amount)) return fail('err.badValue');
      if (co.loan <= 0) return fail('err.noLoan');
      if (co.cash < Math.min(amount, co.loan)) return fail('err.noCash', { need: Math.min(amount, co.loan) });
      return null;
    },
    run(game, co, { amount }) {
      const paid = Math.min(amount, co.loan);
      co.loan -= paid;
      co.cash -= paid;
      if (co.loan < 0.01) co.loan = 0;
      return { paid };
    },
  },
];
