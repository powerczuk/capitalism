// Rivals, news feed and the guide.

import { html } from '../dom.js';
import { L, t } from '../i18n.js';
import { dateStr, money, pct, price } from '../format.js';
import { seriesColor, shareBar } from '../charts.js';
import { chartCard, historySeries } from '../chartCard.js';
import { coName, dot, emptyState, heading, pill, toneOf } from '../components.js';
import { newsText, newsTone } from '../news.js';
import { equityOf } from '../../sim/accounting.js';
import { buildingCounts, nationalRetail } from '../../sim/stats.js';

function companyCard(app, co) {
  const { game, content } = app;
  const level = co.ai ? content.difficulties.find(co.ai.level) : null;
  const persona = co.ai ? content.personalities.find(co.ai.persona) : null;
  const last12 = co.reports.slice(-12);
  const revenue = last12.reduce((s, r) => s + r.retail + r.b2b, 0);
  const profit = last12.reduce((s, r) => s + r.profit, 0);
  const counts = buildingCounts(game, co.id);
  if (!co.alive) {
    const buyer = co.acquiredBy ? game.state.companies[co.acquiredBy] : null;
    return html`<li class="card rival rival-gone" data-key="rival-${co.id}">
      <div class="card-head"><h3>${coName(co)}</h3>${pill(t(co.bankrupt ? 'rivals.bankrupt' : 'rivals.takenOver'), 'bad')}</div>
      <p class="card-note">${co.bankrupt ? t('rivals.bankrupt.text', { date: dateStr(co.ended) }) : t('rivals.takenOver.text', { date: dateStr(co.ended), buyer: buyer?.name ?? '?' })}</p>
    </li>`;
  }
  return html`<li class="card rival" data-key="rival-${co.id}">
    <div class="card-head">
      <h3>${coName(co)}</h3>
      ${co.human ? pill(t('you'), 'good') : html`<span>${pill(L(level?.name))} ${pill(`${persona?.icon ?? ''} ${L(persona?.name)}`)}</span>`}
    </div>
    ${co.human ? '' : html`<p class="card-note">${L(persona?.desc)} ${L(level?.desc)}</p>`}
    <dl class="facts-grid">
      <div><dt>${t('kpi.worth')}</dt><dd><b>${money(equityOf(game, co))}</b></dd></div>
      <div><dt>${t('kpi.share')}</dt><dd>${price(co.price)}</dd></div>
      <div><dt>${t('rivals.revenue')}</dt><dd>${money(revenue)}</dd></div>
      <div><dt>${t('rivals.profit')}</dt><dd class="${toneOf(profit)}">${money(profit)}</dd></div>
      <div><dt>${t('kind.retail')}</dt><dd>${counts.retail}</dd></div>
      <div><dt>${t('rivals.plants')}</dt><dd>${counts.producer} + ${counts.research}</dd></div>
    </dl>
  </li>`;
}

export const rivalsView = {
  id: 'rivals',
  order: 80,
  icon: 'rivals',
  label: 'nav.rivals',
  render(app) {
    const { game } = app;
    const all = game.state.companyOrder.map((id) => game.state.companies[id]);
    const alive = all.filter((c) => c.alive);
    const ranked = [...alive].sort((a, b) => equityOf(game, b) - equityOf(game, a));
    const retail = nationalRetail(game);
    const parts = alive.map((co) => ({ label: co.name, value: retail.by[co.id] || 0, color: seriesColor(co.color) }));
    const served = parts.reduce((s, p) => s + p.value, 0);
    parts.push({ label: t('local.shops'), value: Math.max(0, retail.total - served), color: 'var(--local)' });
    const { labels, series } = historySeries(game, alive, (r) => r.retail + r.b2b);
    return html`<div class="view">
      ${heading(t('nav.rivals'))}
      <section class="card">
        <div class="card-head"><h3>${t('rivals.retailShare')}</h3></div>
        ${shareBar(parts, { tall: true })}
        <ul class="legend">
          ${alive.map((co) => html`<li>${dot(co)}${co.name} <b>${pct((retail.by[co.id] || 0) / retail.total, 1)}</b></li>`)}
          <li><span class="dot dot-local"></span>${t('local.shops')} <b>${pct(Math.max(0, retail.total - served) / retail.total, 1)}</b></li>
        </ul>
      </section>
      <ul class="rival-grid">
        ${ranked.map((co) => companyCard(app, co))} ${all.filter((c) => !c.alive).map((co) => companyCard(app, co))}
      </ul>
      ${chartCard(app, { id: 'revenue', title: t('chart.revenue'), series, labels, fmt: money, zero: true })}
    </div>`;
  },
};

export const newsView = {
  id: 'news',
  order: 90,
  icon: 'news',
  label: 'nav.news',
  render(app) {
    const { game } = app;
    const items = [...game.state.news].reverse();
    return html`<div class="view narrow">
      ${heading(t('nav.news'))}
      ${items.length === 0
        ? emptyState(t('news.none'))
        : html`<ul class="news-list">
            ${items.map(
              (n) => html`<li class="news-item news-${newsTone(n)}">
                <time>${dateStr(n.d)}</time><span>${newsText(game, n)}</span>
              </li>`,
            )}
          </ul>`}
    </div>`;
  },
};

const GUIDE_SECTIONS = ['start', 'stores', 'prices', 'supply', 'factories', 'quality', 'brand', 'money', 'stocks', 'rivals', 'keys'];

export const guideView = {
  id: 'guide',
  order: 100,
  icon: 'guide',
  label: 'nav.guide',
  render() {
    return html`<div class="view narrow prose">
      ${heading(t('nav.guide'))}
      <p class="lead">${t('guide.lead')}</p>
      ${GUIDE_SECTIONS.map(
        (id) => html`<section>
          <h3>${t(`guide.${id}.title`)}</h3>
          ${t(`guide.${id}.text`)
            .split('\n')
            .map((paragraph) => html`<p>${paragraph}</p>`)}
        </section>`,
      )}
    </div>`;
  },
};
