// Finance: income statement, balance sheet and the bank.

import { flag, html } from '../dom.js';
import { t } from '../i18n.js';
import { money, monthTick, pct } from '../format.js';
import { meter, seriesColor } from '../charts.js';
import { chartCard } from '../chartCard.js';
import { emptyState, heading, stat, tabs, toneOf } from '../components.js';
import { assetsOf, creditLimit, interestRate } from '../../sim/accounting.js';

const LINES = [
  { key: 'retail', sign: 1 },
  { key: 'b2b', sign: 1 },
  { key: 'cogs', sign: -1 },
  { key: 'gross', derived: (r) => r.retail + r.b2b - r.cogs, strong: true },
  { key: 'opex', sign: -1 },
  { key: 'ads', sign: -1 },
  { key: 'rnd', sign: -1 },
  { key: 'depr', sign: -1 },
  { key: 'interest', sign: -1 },
  { key: 'divIn', sign: 1 },
  { key: 'invest', sign: 1 },
  { key: 'other', sign: 1 },
  { key: 'tax', sign: -1 },
  { key: 'profit', derived: (r) => r.profit, strong: true },
];

const AMOUNTS = [1e6, 2e6, 5e6, 10e6, 25e6, 50e6, 100e6];

function results(app) {
  const { me } = app;
  const months = me.reports.slice(-12);
  if (!months.length) return emptyState(t('finance.noReports'));
  const total = {};
  for (const line of LINES) {
    total[line.key] = months.reduce((s, r) => s + (line.derived ? line.derived(r) : r[line.key] || 0), 0);
  }
  const cell = (line, value) => {
    const shown = line.derived || line.sign > 0 ? value : -value;
    return html`<td class="num ${line.strong ? toneOf(shown) : ''}">${Math.abs(value) < 0.5 ? '–' : money(shown)}</td>`;
  };
  return html`<div class="table-wrap">
    <table class="data statement">
      <thead>
        <tr>
          <th></th>
          <th class="num">${t('finance.sum12')}</th>
          ${[...months].reverse().map((r) => html`<th class="num">${monthTick(r.d)}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${LINES.map(
          (line) => html`<tr class="${line.strong ? 'row-strong' : ''}">
            <th>${t(`ledger.${line.key}`)}</th>
            ${cell(line, total[line.key])}
            ${[...months].reverse().map((r) => cell(line, line.derived ? line.derived(r) : r[line.key] || 0))}
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

function balance(app) {
  const { game, me } = app;
  const a = assetsOf(game, me);
  const rows = [
    ['balance.cash', a.cash],
    ['balance.inventory', a.inventory],
    ['balance.fixed', a.fixed],
    ['balance.invest', a.invest],
  ];
  return html`<div class="grid-2">
    <section class="card">
      <div class="card-head"><h3>${t('balance.assets')}</h3><b>${money(a.total)}</b></div>
      <table class="data">
        <tbody>
          ${rows.map(([key, value]) => html`<tr><th>${t(key)}</th><td class="num">${money(value)}</td><td class="bar-cell">${meter(a.total > 0 ? Math.max(0, value) / a.total : 0)}</td></tr>`)}
        </tbody>
      </table>
    </section>
    <section class="card">
      <div class="card-head"><h3>${t('balance.liabilities')}</h3><b>${money(a.total)}</b></div>
      <table class="data">
        <tbody>
          <tr><th>${t('balance.loan')}</th><td class="num">${money(me.loan)}</td><td class="bar-cell">${meter(a.total > 0 ? me.loan / a.total : 0, { tone: 'warn' })}</td></tr>
          <tr class="row-strong"><th>${t('balance.equity')}</th><td class="num">${money(a.total - me.loan)}</td><td class="bar-cell">${meter(a.total > 0 ? Math.max(0, a.total - me.loan) / a.total : 0, { tone: 'good' })}</td></tr>
        </tbody>
      </table>
      <p class="card-note">${t('balance.note')}</p>
    </section>
  </div>`;
}

function bank(app) {
  const { game, me } = app;
  const limit = creditLimit(game, me);
  const rate = interestRate(game, me);
  const room = Math.max(0, limit - me.loan);
  const amount = Number(app.ui.tabs.loanAmount ?? 5e6);
  return html`<div class="stat-row">
      ${stat({ label: t('bank.loan'), value: money(me.loan), sub: t('bank.limit', { limit: money(limit) }) })}
      ${stat({ label: t('bank.room'), value: money(room) })}
      ${stat({ label: t('bank.rate'), value: pct(rate, 1), sub: t('bank.base', { rate: pct(game.state.economy.interest, 1) }) })}
      ${stat({ label: t('bank.interest'), value: money((me.loan * rate) / 12), sub: t('perMonth') })}
    </div>
    <section class="card">
      <div class="card-head"><h3>${t('bank.title')}</h3></div>
      <div class="goal-bar">${meter(limit > 0 ? me.loan / limit : 0, { tone: me.loan > limit * 0.8 ? 'warn' : 'accent', label: pct(limit > 0 ? me.loan / limit : 0) })}<b>${pct(limit > 0 ? me.loan / limit : 0)}</b></div>
      <div class="form-row">
        <label class="field">
          <span class="field-label">${t('bank.amount')}</span>
          <select id="loan-amount" data-change="loanAmount">
            ${AMOUNTS.map((x) => html`<option value="${x}"${flag('selected', x === amount)}>${money(x)}</option>`)}
          </select>
        </label>
        <button type="button" class="btn btn-primary" data-act="borrow"${flag('disabled', room < amount)}>${t('bank.borrow')}</button>
        <button type="button" class="btn" data-act="repay"${flag('disabled', me.loan <= 0 || me.cash < Math.min(amount, me.loan))}>${t('bank.repay')}</button>
        <button type="button" class="btn btn-ghost" data-act="repayAll"${flag('disabled', me.loan <= 0 || me.cash < me.loan)}>${t('bank.repayAll')}</button>
      </div>
      <p class="card-note">${t('bank.note')}</p>
    </section>`;
}

export const financeView = {
  id: 'finance',
  order: 50,
  icon: 'finance',
  label: 'nav.finance',
  render(app) {
    const { me } = app;
    if (!me) return html`<div class="view">${heading(t('nav.finance'))}${emptyState(t('spectator'))}</div>`;
    const tab = app.ui.tabs.finance ?? 'results';
    const reports = me.reports.slice(-60);
    const labels = reports.map((r) => monthTick(r.d));
    const color = seriesColor(me.color);
    return html`<div class="view">
      ${heading(t('nav.finance'))}
      ${tabs(
        [
          { id: 'results', label: t('finance.results') },
          { id: 'balance', label: t('finance.balance') },
          { id: 'bank', label: t('finance.bank') },
        ],
        tab,
        'tab',
        { group: 'finance' },
      )}
      ${tab === 'results'
        ? html`${results(app)}
            <div class="grid-2">
              ${chartCard(app, { id: 'fin-profit', title: t('chart.profit'), labels, fmt: money, zero: true, area: true, series: [{ name: t('stat.profit'), color, values: reports.map((r) => r.profit) }] })}
              ${chartCard(app, {
                id: 'fin-cash',
                title: t('chart.cashWorth'),
                labels,
                fmt: money,
                zero: true,
                series: [
                  { name: t('kpi.worth'), color, values: reports.map((r) => r.equity) },
                  { name: t('kpi.cash'), color: 'var(--ink-3)', values: reports.map((r) => r.cash) },
                ],
              })}
            </div>`
        : tab === 'balance'
          ? balance(app)
          : bank(app)}
    </div>`;
  },
};

export const financeActions = {
  loanAmount(app, d, el) {
    app.ui.tabs.loanAmount = Number(el.value);
  },
  borrow(app) {
    const amount = Number(app.ui.tabs.loanAmount ?? 5e6);
    if (app.cmd('borrow', { amount }).ok) app.toast(t('toast.borrowed', { amount: money(amount) }), 'good');
  },
  repay(app) {
    const amount = Math.min(Number(app.ui.tabs.loanAmount ?? 5e6), app.me.loan);
    if (app.cmd('repay', { amount }).ok) app.toast(t('toast.repaid', { amount: money(amount) }), 'good');
  },
  repayAll(app) {
    const amount = app.me.loan;
    if (app.cmd('repay', { amount }).ok) app.toast(t('toast.repaid', { amount: money(amount) }), 'good');
  },
};
