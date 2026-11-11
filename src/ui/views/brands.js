// Brand & technology: advertising budgets and research progress per product.

import { flag, html } from '../dom.js';
import { L, t } from '../i18n.js';
import { money, pct, score } from '../format.js';
import { button, buildingLabel, emptyState, heading, productName, rated, stat } from '../components.js';
import { adEffect } from '../../sim/brand.js';
import { techOf } from '../../sim/supply.js';
import { productMarket } from '../../sim/stats.js';

const AD_BUDGETS = [0, 25_000, 50_000, 100_000, 200_000, 400_000, 800_000];

function makes(game, me) {
  const set = new Set();
  for (const b of game.buildingsOf(me.id)) {
    if (b.kind !== 'producer') continue;
    for (const line of b.lines) if (line) set.add(game.content.recipes.get(line.recipe).output);
  }
  return set;
}

export const brandsView = {
  id: 'brands',
  order: 70,
  icon: 'brands',
  label: 'nav.brands',
  render(app) {
    const { game, me, content } = app;
    if (!me) return html`<div class="view">${heading(t('nav.brands'))}${emptyState(t('spectator'))}</div>`;
    const made = makes(game, me);
    const labs = game.buildingsOf(me.id).filter((b) => b.kind === 'research');
    const researching = new Map();
    for (const b of labs) for (const lab of b.labs) if (lab) researching.set(lab.product, (researching.get(lab.product) || 0) + lab.budget);
    const adTotal = Object.values(me.ads).reduce((s, x) => s + x, 0);
    const rndTotal = [...researching.values()].reduce((s, x) => s + x, 0);
    const world = game.state.economy.tech;
    const rows = content.consumerProducts
      .map((product) => ({ product, made: made.has(product.id), brand: me.brand[product.id] ?? 0, ads: me.ads[product.id] || 0 }))
      .sort((a, b) => Number(b.made) - Number(a.made) || b.brand - a.brand);
    const others = content.products.filter((p) => p.type === 'intermediate' && (made.has(p.id) || researching.has(p.id)));
    return html`<div class="view">
      ${heading(t('nav.brands'))}
      <p class="lead">${t('brands.lead')}</p>
      <div class="stat-row">
        ${stat({ label: t('brands.adSpend'), value: money(adTotal), sub: t('perMonth') })}
        ${stat({ label: t('brands.rndSpend'), value: money(rndTotal), sub: t('perMonth') })}
        ${stat({ label: t('brands.worldTech'), value: score(world), sub: t('brands.worldTech.hint') })}
        ${stat({ label: t('labs'), value: labs.length, sub: labs.length ? '' : t('brands.noLab') })}
      </div>
      ${labs.length
        ? html`<p class="form-row">${labs.map((b) => button(html`${buildingLabel(game, b)}`, 'openBuilding', { id: b.id }, { small: true }))}</p>`
        : ''}
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>${t('product')}</th>
              <th title="${t('brands.brand.hint')}">${t('brand')}</th>
              <th>${t('brands.ads')}</th>
              <th class="num" title="${t('brands.gain.hint')}">${t('brands.gain')}</th>
              <th title="${t('brands.tech.hint')}">${t('tech')}</th>
              <th class="num">${t('brands.share')}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(({ product, made: isMade, brand, ads }) => {
              const tech = techOf(game, me, product.id);
              const market = productMarket(game, product.id);
              const gain = ads > 0 ? adEffect(game, ads, brand) - brand * content.balance.brand.decay : -brand * content.balance.brand.decay;
              return html`<tr data-key="brand-${product.id}">
                <td>${productName(product)}${isMade ? html`<div class="muted small">${t('brands.made')}</div>` : ''}</td>
                <td>${rated(brand, { tone: 'brass', label: t('brand') })}</td>
                <td>
                  <select id="ads-${product.id}" data-change="setAds" data-product="${product.id}" aria-label="${t('brands.ads')}">
                    ${AD_BUDGETS.map((x) => html`<option value="${x}"${flag('selected', x === ads)}>${x === 0 ? t('brands.ads.none') : money(x)}</option>`)}
                    ${AD_BUDGETS.includes(ads) ? '' : html`<option value="${ads}" selected>${money(ads)}</option>`}
                  </select>
                </td>
                <td class="num ${gain > 0.05 ? 'good' : gain < -0.05 ? 'bad' : ''}">${Math.abs(gain) < 0.05 ? '–' : `${gain > 0 ? '+' : '−'}${Math.abs(gain).toFixed(1)}`}</td>
                <td>${rated(tech, { label: t('tech') })}${researching.has(product.id) ? html`<div class="muted small">${t('brands.researching', { budget: money(researching.get(product.id)) })}</div>` : ''}</td>
                <td class="num">${pct((market.by[me.id] || 0) / market.demand, 0)}</td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
      ${others.length
        ? html`<section class="card">
            <div class="card-head"><h3>${t('brands.inputs')}</h3></div>
            <ul class="res-list">
              ${others.map((p) => html`<li>${productName(p)}${rated(techOf(game, me, p.id), { label: t('tech') })}</li>`)}
            </ul>
          </section>`
        : ''}
      <p class="lead small">${t('brands.note')}</p>
    </div>`;
  },
};

export const brandActions = {
  setAds(app, d, el) {
    app.cmd('setAds', { product: d.product, budget: Number(el.value) });
  },
};

export { L };
