// Book-keeping helpers: the monthly ledger, asset valuation and credit terms.
//
// Accounting model (kept deliberately simple, but consistent):
//  - goods are an asset until sold; a sale books revenue and cost of goods sold
//  - buildings are an asset that depreciates slowly
//  - loans and share issues/buybacks move cash but are not income or expense

import { EPS } from '../engine/util.js';

/** Income-statement lines accumulated during the current month. */
export const LEDGER_KEYS = ['retail', 'b2b', 'cogs', 'opex', 'ads', 'rnd', 'depr', 'interest', 'divIn', 'invest', 'other', 'tax'];

export const newLedger = () => ({
  retail: 0, // sales to consumers
  b2b: 0, // sales to other companies
  cogs: 0, // cost of the goods sold
  opex: 0, // upkeep and wages of buildings
  ads: 0, // advertising
  rnd: 0, // research
  depr: 0, // depreciation of buildings
  interest: 0, // interest paid
  divIn: 0, // dividends received
  invest: 0, // realised gains/losses on shares
  other: 0, // write-offs and one-off items (negative = loss)
  tax: 0, // income tax
});

export const revenueOf = (m) => m.retail + m.b2b;

/** Profit before income tax. */
export const pretaxOf = (m) =>
  m.retail + m.b2b - m.cogs - m.opex - m.ads - m.rnd - m.depr - m.interest + m.divIn + m.invest + m.other;

/** Net profit (after tax). */
export const profitOf = (m) => pretaxOf(m) - m.tax;

/** Value at cost of everything stored in a building. */
export function inventoryValue(b) {
  let v = 0;
  if (b.slots) {
    for (const s of b.slots) if (s && s.qty > EPS) v += s.qty * s.uc;
  }
  if (b.lines) {
    for (const line of b.lines) {
      if (!line) continue;
      if (line.qty > EPS) v += line.qty * line.uc;
      for (const id in line.inputs) {
        const inp = line.inputs[id];
        if (inp.qty > EPS) v += inp.qty * inp.uc;
      }
    }
  }
  return v;
}

/** Market value of the shares a company holds in other companies. */
export function investmentsOf(game, co) {
  let v = 0;
  const { companies, companyOrder } = game.state;
  for (const id of companyOrder) {
    const other = companies[id];
    if (!other.alive || other === co) continue;
    const qty = other.shares.held[co.id];
    if (qty) v += qty * other.price;
  }
  return v;
}

/** @returns {{cash:number, inventory:number, fixed:number, invest:number, total:number}} */
export function assetsOf(game, co) {
  let inventory = 0;
  let fixed = 0;
  for (const b of game.buildingsOf(co.id)) {
    inventory += inventoryValue(b);
    fixed += b.book;
  }
  const invest = investmentsOf(game, co);
  return { cash: co.cash, inventory, fixed, invest, total: co.cash + inventory + fixed + invest };
}

/** Net worth: assets minus debt. */
export function equityOf(game, co) {
  return assetsOf(game, co).total - co.loan;
}

/**
 * Profit of the last `months` closed months, scaled to a full year.
 * Returns 0 until three months of history exist (too noisy before that).
 */
export function trailingProfit(co, months = 12) {
  const n = Math.min(months, co.reports.length);
  if (n < 3) return 0;
  let total = 0;
  for (let i = co.reports.length - n; i < co.reports.length; i++) total += co.reports[i].profit;
  return (total * 12) / n;
}

/** Revenue of the last `months` closed months, scaled to a full year. */
export function trailingRevenue(co, months = 12) {
  const n = Math.min(months, co.reports.length);
  if (n < 1) return 0;
  let total = 0;
  for (let i = co.reports.length - n; i < co.reports.length; i++) total += co.reports[i].retail + co.reports[i].b2b;
  return (total * 12) / n;
}

/** The most the bank lends to this company in total. */
export function creditLimit(game, co) {
  const L = game.content.balance.loan;
  const equity = Math.max(0, equityOf(game, co));
  return Math.max(L.base, L.equityFactor * equity + L.profitFactor * Math.max(0, trailingProfit(co)));
}

/** Annual interest rate this company pays on its loan. */
export function interestRate(game, co) {
  const L = game.content.balance.loan;
  const limit = creditLimit(game, co);
  const leverage = limit > 0 ? Math.min(1.5, co.loan / limit) : 1;
  return game.state.economy.interest + L.spread + L.leverageSpread * leverage;
}

/** How far the account may be overdrawn before suppliers stop delivering. */
export function overdraftLimit(game, co) {
  const L = game.content.balance.loan;
  return Math.max(L.overdraftMin, L.overdraftShare * assetsOf(game, co).total);
}

/** Take money out of the company's account and book it on a ledger line. */
export function pay(co, amount, key) {
  co.cash -= amount;
  if (key) co.m[key] += amount;
}
