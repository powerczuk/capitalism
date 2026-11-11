// Stock market: prices, stakes, share issues, buybacks and takeovers.

import { flag, html } from '../dom.js';
import { L, t } from '../i18n.js';
import { int, money, pct, price } from '../format.js';
import { icon } from '../icons.js';
import { seriesColor, shareBar } from '../charts.js';
import { chartCard, historySeries } from '../chartCard.js';
import { button, coName, emptyState, heading, pctDelta, pill, stat } from '../components.js';
import { equityOf } from '../../sim/accounting.js';
import { publicFloat, stakeOf } from '../../sim/company.js';
import { holdersOf, marketCap, takeoverCost, tradeCost, tradeProceeds } from '../../sim/stocks.js';

const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2];
const PAYOUTS = [0, 0.1, 0.2, 0.3, 0.5];

function holderParts(app, co) {
  const { game } = app;
  return holdersOf(game, co).map((h) => {
    if (h.id === 'founder') return { label: t('stocks.founder'), value: h.qty, color: seriesColor(co.color) };
    if (h.id === 'public') return { label: t('stocks.public'), value: h.qty, color: 'var(--local)' };
    const holder = game.state.companies[h.id];
    return { label: holder?.name ?? h.id, value: h.qty, color: seriesColor(holder?.color ?? 7) };
  });
}

function myCompany(app) {
  const { game, me, content } = app;
  const S = content.balance.stock;
  const founder = me.shares.founder / me.shares.total;
  const parts = holderParts(app, me);
  const sinceIssue = game.state.day - me.lastIssue;
  const canIssue = sinceIssue >= S.issueCooldown;
  return html`<section class="card">
    <div class="card-head"><h3>${t('stocks.mine')}</h3>${coName(me)}</div>
    <div class="stat-row">
      ${stat({ label: t('kpi.share'), value: price(me.price) })}
      ${stat({ label: t('stocks.cap'), value: money(marketCap(me)), sub: t('stocks.book', { value: money(equityOf(game, me)) }) })}
      ${stat({ label: t('stocks.founder'), value: pct(founder, 1), tone: founder > S.control ? 'good' : '', sub: t(founder > S.control ? 'stocks.safe' : 'stocks.exposed') })}
    </div>
    ${shareBar(parts, { tall: true })}
    <ul class="legend">
      ${parts.map((p) => html`<li><span class="key" style="background:${p.color}"></span>${p.label} <b>${pct(p.value / me.shares.total, 1)}</b></li>`)}
    </ul>
    <div class="form-row">
      ${button(t('stocks.buyback'), 'openTrade', { target: me.id, mode: 'buyback' }, { ic: 'up' })}
      ${button(t('stocks.issue'), 'openTrade', { target: me.id, mode: 'issue' }, { disabled: !canIssue, title: canIssue ? '' : t('err.issueCooldown') })}
      <label class="field inline">
        <span class="field-label">${t('stocks.dividend')}</span>
        <select id="dividend" data-change="setDividend">
          ${PAYOUTS.map((x) => html`<option value="${x}"${flag('selected', Math.abs(me.div - x) < 0.005)}>${x === 0 ? t('stocks.dividend.none') : pct(x)}</option>`)}
        </select>
      </label>
    </div>
    <p class="card-note">${t('stocks.mine.note', { pct: pct(S.control) })}</p>
  </section>`;
}

export const stocksView = {
  id: 'stocks',
  order: 60,
  icon: 'stocks',
  label: 'nav.stocks',
  render(app) {
    const { game, me, content } = app;
    const S = content.balance.stock;
    const companies = game.companies();
    const { labels, series } = historySeries(game, companies, 'price');
    const takeovers = game.state.settings.takeovers !== false;
    return html`<div class="view">
      ${heading(t('nav.stocks'), takeovers ? '' : pill(t('stocks.takeoversOff')))}
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>${t('company')}</th>
              <th class="num">${t('kpi.share')}</th>
              <th class="num">${t('stocks.change')}</th>
              <th class="num">${t('stocks.cap')}</th>
              <th class="num" title="${t('stocks.founder.hint')}">${t('stocks.founder')}</th>
              <th class="num">${t('stocks.float')}</th>
              ${me ? html`<th class="num">${t('stocks.stake')}</th><th></th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${companies.map((co) => {
              const then = co.pd.length > 1 ? co.pd[Math.max(0, co.pd.length - 31)] : co.price;
              const stake = me ? stakeOf(co, me.id) : 0;
              const mine = me && co === me;
              return html`<tr data-key="stock-${co.id}">
                <td>${coName(co)} ${mine ? pill(t('you')) : ''}</td>
                <td class="num"><b>${price(co.price)}</b></td>
                <td class="num">${pctDelta(co.price / then - 1)}</td>
                <td class="num">${money(marketCap(co))}</td>
                <td class="num">${pct(co.shares.founder / co.shares.total, 0)}</td>
                <td class="num">${pct(publicFloat(co) / co.shares.total, 0)}</td>
                ${me
                  ? html`<td class="num">${mine ? '–' : stake > 0 ? html`<b>${pct(stake, 1)}</b>` : '–'}</td>
                      <td class="num">
                        ${mine
                          ? ''
                          : html`<span class="actions">
                              ${button(t('stocks.buy'), 'openTrade', { target: co.id, mode: 'buy' }, { small: true })}
                              ${stake > 0 ? button(t('stocks.sell'), 'openTrade', { target: co.id, mode: 'sell' }, { small: true }) : ''}
                              ${takeovers && stake > S.control
                                ? button(t('stocks.takeover'), 'takeoverAsk', { target: co.id }, { small: true, variant: 'primary' })
                                : ''}
                            </span>`}
                      </td>`
                  : ''}
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
      ${me ? myCompany(app) : ''}
      ${chartCard(app, { id: 'prices', title: t('chart.prices'), series, labels, fmt: price })}
      ${me && takeovers ? html`<p class="lead small">${t('stocks.rules', { pct: pct(S.control), premium: pct(S.takeoverPremium - 1) })}</p>` : ''}
    </div>`;
  },
};

/** Buy / sell / issue / buy back dialog. */
export function tradeDialog(app, { target, mode, step = 1 }) {
  const { game, me } = app;
  const co = game.state.companies[target];
  if (!co?.alive) return null;
  const total = co.shares.total;
  const float = publicFloat(co);
  const held = co.shares.held[me.id] || 0;
  const limit = mode === 'sell' ? held : mode === 'issue' ? Math.floor(total * app.content.balance.stock.issueMaxShare) : float;
  const options = STEPS.map((f) => Math.min(limit, Math.floor(total * f))).filter((q, i, list) => q > 0 && list.indexOf(q) === i);
  if (mode !== 'issue' && limit > 0 && !options.includes(limit)) options.push(limit);
  const qty = options[Math.min(step, options.length - 1)] ?? 0;
  const amount =
    mode === 'sell' ? tradeProceeds(game, co, qty) : mode === 'issue' ? qty * co.price * (1 - app.content.balance.stock.issueDiscount) : tradeCost(game, co, qty);
  const spending = mode === 'buy' || mode === 'buyback';
  const affordable = !spending || me.cash >= amount;
  const after = mode === 'buy' ? (held + qty) / total : mode === 'sell' ? (held - qty) / total : null;
  const founderAfter = mode === 'buyback' ? me.shares.founder / (total - qty) : mode === 'issue' ? me.shares.founder / (total + qty) : null;
  return html`<div class="modal-head">
      <h2>${t(`trade.${mode}.title`)}</h2>
      <button type="button" class="icon-btn" data-act="closeModal" aria-label="${t('close')}">${icon('close')}</button>
    </div>
    <div class="modal-body">
      <p>${coName(co)} · ${t('kpi.share')} <b>${price(co.price)}</b></p>
      ${options.length === 0
        ? emptyState(t(mode === 'sell' ? 'trade.noShares' : 'trade.noFloat'))
        : html`<div class="seg" role="group" aria-label="${t('trade.size')}">
              ${options.map(
                (q, i) => html`<button type="button" class="seg-btn ${q === qty ? 'on' : ''}" data-act="tradeStep" data-step="${i}">
                  ${pct(q / total, q / total < 0.1 ? 1 : 0)}
                </button>`,
              )}
            </div>
            <dl class="facts-grid">
              <div><dt>${t('trade.shares')}</dt><dd>${int(qty)}</dd></div>
              <div>
                <dt>${t(spending ? 'trade.cost' : 'trade.proceeds')}</dt>
                <dd class="${affordable ? '' : 'bad'}"><b>${money(amount)}</b></dd>
              </div>
              ${after != null ? html`<div><dt>${t('trade.stakeAfter')}</dt><dd>${pct(Math.max(0, after), 1)}</dd></div>` : ''}
              ${founderAfter != null ? html`<div><dt>${t('trade.founderAfter')}</dt><dd>${pct(founderAfter, 1)}</dd></div>` : ''}
              <div><dt>${t('kpi.cash')}</dt><dd>${money(me.cash)}</dd></div>
            </dl>
            <p class="muted small">${t(`trade.${mode}.note`)}</p>`}
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-act="closeModal">${t('cancel')}</button>
      <button type="button" class="btn btn-primary" data-act="tradeGo" data-qty="${qty}"${flag('disabled', qty <= 0 || !affordable)}>${t(`trade.${mode}.go`)}</button>
    </div>`;
}

export const stockActions = {
  openTrade(app, d) {
    app.modal('trade', { target: d.target, mode: d.mode, step: 1 });
  },
  tradeStep(app, d) {
    if (app.ui.modal) app.ui.modal.step = Number(d.step);
  },
  tradeGo(app, d) {
    const { target, mode } = app.ui.modal;
    const qty = Number(d.qty);
    const command = { buy: 'buyShares', sell: 'sellShares', issue: 'issueShares', buyback: 'buyback' }[mode];
    const params = mode === 'buy' || mode === 'sell' ? { target, qty } : { qty };
    if (app.cmd(command, params).ok) {
      app.ui.modal = null;
      app.toast(t(`toast.trade.${mode}`), 'good');
    }
  },
  setDividend(app, d, el) {
    app.cmd('setDividend', { ratio: Number(el.value) });
  },
  takeoverAsk(app, d) {
    const { game, me } = app;
    const target = game.state.companies[d.target];
    if (!target) return;
    app.confirm({
      title: t('takeover.title', { company: target.name }),
      text: t('takeover.text', { cost: money(takeoverCost(game, me, target)), cash: money(me.cash) }),
      ok: t('stocks.takeover'),
      onOk: () => {
        if (app.cmd('takeover', { target: d.target }).ok) app.toast(t('toast.takeover', { company: target.name }), 'good');
      },
    });
  },
};

export { L };
