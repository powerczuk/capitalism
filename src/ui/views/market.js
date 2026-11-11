// Market view: everything about one product — who buys it, who sells it,
// what it costs to get.

import { flag, html } from '../dom.js';
import { L, t } from '../i18n.js';
import { money, num, pct, price, score } from '../format.js';
import { meter, seriesColor, shareBar } from '../charts.js';
import { coName, dot, emoji, emptyState, heading, pill, productName, stat } from '../components.js';
import { elasticity, marketSnapshot, refPrice } from '../../sim/market.js';
import { importPrice, importQuality, listSources } from '../../sim/supply.js';
import { productMarket } from '../../sim/stats.js';

function productPicker(app, selected) {
  const { content } = app;
  const groups = [
    ...content.categories.all().map((c) => ({ label: L(c.name), items: content.products.filter((p) => p.category === c.id) })),
    { label: t('ptype.intermediate'), items: content.products.filter((p) => p.type === 'intermediate') },
    { label: t('ptype.raw'), items: content.products.filter((p) => p.type === 'raw') },
  ];
  if (app.narrow) {
    return html`<label class="field">
      <span class="field-label">${t('product')}</span>
      <select id="market-product" data-change="marketProduct">
        ${groups.map(
          (g) => html`<optgroup label="${g.label}">
            ${g.items.map((p) => html`<option value="${p.id}"${flag('selected', p.id === selected.id)}>${p.icon} ${L(p.name)}</option>`)}
          </optgroup>`,
        )}
      </select>
    </label>`;
  }
  return html`<div class="product-nav">
    ${groups.map(
      (g) => html`<div class="product-group">
        <span class="field-label">${g.label}</span>
        <div class="chips">
          ${g.items.map(
            (p) => html`<button type="button" class="chip chip-btn ${p.id === selected.id ? 'on' : ''}" data-act="openProduct" data-product="${p.id}" title="${L(p.name)}">
              ${emoji(p.icon)}<span>${L(p.name)}</span>
            </button>`,
          )}
        </div>
      </div>`,
    )}
  </div>`;
}

function recipeLine(app, product) {
  const { content } = app;
  const recipe = content.recipesFor(product.id)[0];
  if (!recipe) return html`<span class="muted">${t('market.importOnly')}</span>`;
  const inputs = Object.entries(recipe.inputs);
  return html`<span>
    ${emoji(content.buildingTypes.get(recipe.building).icon)} ${L(content.buildingTypes.get(recipe.building).name)}:
    ${inputs.length === 0
      ? t('market.fromNature')
      : inputs.map(([id, per], i) => html`${i ? ' + ' : ''}${per} × ${productName(content.products.get(id))}`)}
    <span class="muted"> · ${t('market.rate', { n: num(recipe.rate) })}</span>
  </span>`;
}

function usedIn(app, product) {
  const { content } = app;
  const users = content.recipes.filter((r) => r.inputs[product.id] != null).map((r) => content.products.get(r.output));
  if (!users.length) return '';
  return html`<p class="card-note">${t('market.usedIn')}: ${users.map((p) => html`<button type="button" class="chip chip-btn" data-act="openProduct" data-product="${p.id}">${emoji(p.icon)}<span>${L(p.name)}</span></button>`)}</p>`;
}

function consumerSection(app, product) {
  const { game, me, content } = app;
  const R = content.balance.retail;
  const market = productMarket(game, product.id);
  const companies = game.companies();
  const parts = companies.map((co) => ({ label: co.name, value: market.by[co.id] || 0, color: seriesColor(co.color) }));
  const served = parts.reduce((s, p) => s + p.value, 0);
  parts.push({ label: t('local.shops'), value: Math.max(0, market.demand - served), color: 'var(--local)' });
  const w = product.weights;

  // The best shelves in the country.
  const shelves = [];
  for (const city of game.cities()) {
    const snap = marketSnapshot(game, city.id, product.id);
    for (const o of snap.offers) shelves.push({ ...o, city, ref: snap.ref, index: (100 * o.rating) / snap.local.rating });
  }
  shelves.sort((a, b) => b.index - a.index);

  return html`<div class="stat-row">
      ${stat({ label: t('market.demand'), value: money(market.demand * product.price), sub: `${num(market.demand)} ${t('perDay')}` })}
      ${stat({ label: t('market.refPrice'), value: price(product.price), sub: t('market.refPrice.hint') })}
      ${stat({ label: t('market.importPrice'), value: product.importable ? price(importPrice(game, product)) : '–', sub: t('market.importQuality', { q: score(importQuality(game, product)) }) })}
      ${stat({ label: t('market.elasticity'), value: elasticity(R, product).toFixed(1), sub: t('market.elasticity.hint') })}
    </div>
    <section class="card">
      <div class="card-head"><h3>${t('market.buyers')}</h3></div>
      <div class="weights">
        <div><span>${t('price')}</span>${meter(w.price, { label: pct(w.price) })}<b>${pct(w.price)}</b></div>
        <div><span>${t('quality')}</span>${meter(w.quality, { label: pct(w.quality) })}<b>${pct(w.quality)}</b></div>
        <div><span>${t('brand')}</span>${meter(w.brand, { tone: 'brass', label: pct(w.brand) })}<b>${pct(w.brand)}</b></div>
      </div>
      <p class="card-note">${t(product.necessity >= 0.7 ? 'market.staple' : product.necessity <= 0.35 ? 'market.luxury' : 'market.normal')}</p>
      <p class="card-note">${t('market.recipe')}: ${recipeLine(app, product)}</p>
    </section>
    <section class="card">
      <div class="card-head"><h3>${t('market.shares')}</h3></div>
      ${shareBar(parts, { tall: true })}
      <ul class="legend">
        ${companies.map((co) => html`<li>${dot(co)}${co.name} <b>${pct((market.by[co.id] || 0) / market.demand, 0)}</b></li>`)}
        <li><span class="dot dot-local"></span>${t('local.shops')} <b>${pct(Math.max(0, market.demand - served) / market.demand, 0)}</b></li>
      </ul>
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>${t('city.city')}</th>
              <th class="num">${t('market.demand')}</th>
              <th class="num">${t('market.refPrice')}</th>
              <th class="num">${t('market.cheapest')}</th>
              <th class="num">${t('pick.sellers')}</th>
              ${me ? html`<th class="num">${t('city.market.mine')}</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${market.cities.map(({ city, demand, by }) => {
              const here = shelves.filter((s) => s.city === city && s.stock > 0);
              const cheapest = here.reduce((m, s) => Math.min(m, s.price), Infinity);
              return html`<tr class="row-link" tabindex="0" data-act="openCity" data-city="${city.id}">
                <td>${city.name}</td>
                <td class="num">${money(demand * refPrice(game, city, product))}</td>
                <td class="num">${price(refPrice(game, city, product))}</td>
                <td class="num">${Number.isFinite(cheapest) ? price(cheapest) : '–'}</td>
                <td class="num">${here.length}</td>
                ${me ? html`<td class="num">${pct((by[me.id] || 0) / demand, 0)}</td>` : ''}
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h3>${t('market.shelves')}</h3></div>
      ${shelves.length === 0
        ? emptyState(t('market.shelves.none'))
        : html`<div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>${t('company')}</th>
                  <th>${t('city.city')}</th>
                  <th class="num">${t('price')}</th>
                  <th class="num">${t('quality')}</th>
                  <th class="num">${t('brand')}</th>
                  <th class="num" title="${t('rating.hint')}">${t('rating')}</th>
                </tr>
              </thead>
              <tbody>
                ${shelves.slice(0, 12).map(
                  (s) => html`<tr>
                    <td>${coName(game.state.companies[s.co])}</td>
                    <td>${s.city.name}</td>
                    <td class="num">${price(s.price)} <span class="muted small">${pct(s.price / s.ref - 1, 0, { sign: true })}</span></td>
                    <td class="num">${score(s.quality)}</td>
                    <td class="num">${score(s.brand)}</td>
                    <td class="num"><b>${score(s.index)}</b></td>
                  </tr>`,
                )}
              </tbody>
            </table>
          </div>`}
    </section>`;
}

function wholesaleSection(app, product) {
  const { game, me, content } = app;
  const buyer = me ?? game.companies()[0];
  const city = game.cities()[0];
  const sources = buyer ? listSources(game, buyer, city.id, product.id) : [];
  return html`<section class="card">
    <div class="card-head"><h3>${t('market.wholesale')}</h3></div>
    <p class="card-note">${t('market.wholesale.note', { city: city.name })}</p>
    ${product.type !== 'consumer' ? html`<p class="card-note">${t('market.recipe')}: ${recipeLine(app, product)}</p>` : ''}
    ${usedIn(app, product)}
    ${sources.length === 0
      ? emptyState(t('pick.source.none'))
      : html`<div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>${t('supplier')}</th>
                <th>${t('city.city')}</th>
                <th class="num">${t('price')}</th>
                <th class="num">${t('quality')}</th>
                <th class="num">${t('pick.available')}</th>
              </tr>
            </thead>
            <tbody>
              ${sources.map(
                (s) => html`<tr>
                  <td>
                    ${s.kind === 'import'
                      ? html`<b>${t('source.import')}</b>`
                      : html`${coName(game.state.companies[s.seller])} <span class="muted small">${L(content.buildingTypes.get(s.building.type).name)}</span> ${s.own ? pill(t('own')) : ''}`}
                  </td>
                  <td>${s.kind === 'import' ? '–' : game.state.cities[s.building.city].name}</td>
                  <td class="num">${price(s.price)}</td>
                  <td class="num">${score(s.quality)}</td>
                  <td class="num">${s.kind === 'import' ? '∞' : html`${num(s.free)} <span class="muted small">${t('perDay')}</span>`}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>`}
  </section>`;
}

export const marketView = {
  id: 'market',
  order: 40,
  icon: 'market',
  label: 'nav.market',
  primary: true,
  render(app) {
    const { content } = app;
    const product = content.products.find(app.ui.arg) ?? content.consumerProducts[0];
    return html`<div class="view">
      ${heading(t('nav.market'))} ${productPicker(app, product)}
      <div class="product-head">
        <span class="product-icon">${emoji(product.icon)}</span>
        <div>
          <h2>${L(product.name)}</h2>
          <span class="muted">${t(`ptype.${product.type}`)}${product.category ? ` · ${L(content.categories.get(product.category).name)}` : ''}</span>
        </div>
      </div>
      ${product.type === 'consumer' ? consumerSection(app, product) : ''} ${wholesaleSection(app, product)}
    </div>`;
  },
};

export const marketActions = {
  marketProduct(app, d, el) {
    app.go('market', el.value);
  },
};
