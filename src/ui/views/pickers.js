// Dialogs for choosing what to sell, what to produce and whom to buy from.

import { flag, html } from '../dom.js';
import { L, t } from '../i18n.js';
import { money, num, price, score } from '../format.js';
import { icon } from '../icons.js';
import { button, coName, emoji, emptyState, pill, productName } from '../components.js';
import { brandOf, forecast, marketSnapshot, slotCapacity, storePull } from '../../sim/market.js';
import { defaultSource, importPrice, lineEstimate, listSources, quote, SUP } from '../../sim/supply.js';
import { resourceQuality } from '../../sim/world.js';
import { buildingTitle } from '../components.js';
import { sourceName } from './buildings.js';

function head(title) {
  return html`<div class="modal-head">
    <h2>${title}</h2>
    <button type="button" class="icon-btn" data-act="closeModal" aria-label="${t('close')}">${icon('close')}</button>
  </div>`;
}

// ---------------------------------------------------------------------------
// What to put on a shelf
// ---------------------------------------------------------------------------

export function productDialog(app, { building, slot }) {
  const { game, me, content } = app;
  const b = game.state.buildings[building];
  if (!b) return null;
  const type = content.buildingTypes.get(b.type);
  const taken = new Set(b.slots.filter((s, i) => s && i !== slot).map((s) => s.product));
  const rows = [];
  for (const product of content.consumerProducts) {
    if (!type.categories.includes(product.category) || taken.has(product.id)) continue;
    const snap = marketSnapshot(game, b.city, product.id);
    const src = defaultSource(game, me, b.city, product.id);
    const q = src ? quote(game, me, b.city, product.id, src) : null;
    let sales = null;
    if (q) {
      const f = forecast(game, snap, { price: snap.ref, quality: q.quality, brand: brandOf(game, q.by, product.id), factor: storePull(game, b), cap: slotCapacity(game, b, product) });
      sales = { units: f.units, profit: f.units * (snap.ref - q.unitCost) };
    }
    rows.push({ product, snap, q, src, sales });
  }
  rows.sort((x, y) => (y.sales?.profit ?? -1e12) - (x.sales?.profit ?? -1e12));
  return html`${head(t('pick.product.title'))}
    <div class="modal-body">
      <p class="muted">${t('pick.product.hint')}</p>
      ${rows.length === 0
        ? emptyState(t('pick.product.none'))
        : html`<div class="table-wrap">
            <table class="data cards-narrow">
              <thead>
                <tr>
                  <th>${t('product')}</th>
                  <th class="num" title="${t('pick.demand.hint')}">${t('pick.demand')}</th>
                  <th class="num">${t('pick.sellers')}</th>
                  <th>${t('supplier')}</th>
                  <th class="num">${t('pick.cost')}</th>
                  <th class="num">${t('price')}</th>
                  <th class="num" title="${t('pick.forecast.hint')}">${t('pick.forecast')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(
                  ({ product, snap, q, src, sales }) => html`<tr>
                    <td>${productName(product)}<div class="muted small">${L(content.categories.get(product.category).name)}</div></td>
                    <td class="num" data-label="${t('pick.demand')}">${money(snap.demand * snap.ref)}</td>
                    <td class="num" data-label="${t('pick.sellers')}">${snap.offers.length}</td>
                    <td data-label="${t('supplier')}">${q ? sourceName(game, src) : html`<span class="bad">${t('source.none')}</span>`}</td>
                    <td class="num" data-label="${t('pick.cost')}">${q ? price(q.unitCost) : '–'}</td>
                    <td class="num" data-label="${t('price')}">${price(snap.ref)}</td>
                    <td class="num ${sales && sales.profit < 0 ? 'bad' : ''}" data-label="${t('pick.forecast')}">${sales ? html`${money(sales.profit)}<div class="muted small">${num(sales.units)} ${t('perDay')}</div>` : '–'}</td>
                    <td class="num">
                      <button type="button" class="btn btn-primary btn-sm" data-act="chooseProduct" data-building="${building}" data-slot="${slot}" data-product="${product.id}"${flag('disabled', !q)}>
                        ${t('choose')}
                      </button>
                    </td>
                  </tr>`,
                )}
              </tbody>
            </table>
          </div>`}
    </div>`;
}

// ---------------------------------------------------------------------------
// Whom to buy from
// ---------------------------------------------------------------------------

export function sourceDialog(app, { building, slot, line, input }) {
  const { game, me, content } = app;
  const b = game.state.buildings[building];
  if (!b) return null;
  const forShelf = slot != null;
  const ref = forShelf ? b.slots[slot] : b.lines[line]?.inputs[input];
  if (!ref) return null;
  const productId = forShelf ? ref.product : input;
  const product = content.products.get(productId);
  const sources = listSources(game, me, b.city, productId);
  const data = forShelf ? { building, slot } : { building, line, input };
  return html`${head(t('pick.source.title', { product: L(product.name) }))}
    <div class="modal-body">
      <p class="muted">${t('pick.source.hint')}</p>
      ${ref.sup === SUP.PRICE ? html`<div class="notice notice-warn">${t('pick.source.priceUp')}</div>` : ''}
      ${sources.length === 0
        ? emptyState(t('pick.source.none'))
        : html`<div class="table-wrap">
            <table class="data cards-narrow">
              <thead>
                <tr>
                  <th>${t('supplier')}</th>
                  <th class="num">${t('price')}</th>
                  <th class="num">${t('pick.freight')}</th>
                  <th class="num">${t('pick.delivered')}</th>
                  <th class="num">${t('quality')}</th>
                  ${product.type === 'consumer' ? html`<th class="num">${t('brand')}</th>` : ''}
                  <th class="num">${t('pick.available')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${sources.map((s) => {
                  const current = s.src === ref.src;
                  const seller = s.seller ? game.state.companies[s.seller] : null;
                  return html`<tr class="${current ? 'row-on' : ''}">
                    <td>
                      ${s.kind === 'import'
                        ? html`<b>${t('source.import')}</b><div class="muted small">${t('source.import.note')}</div>`
                        : html`<b>${s.own ? buildingTitle(game, s.building) : L(content.buildingTypes.get(s.building.type).name)}</b>
                            <div class="muted small">${coName(seller)} · ${game.state.cities[s.building.city].name}${s.ready ? '' : ` · ${t('building.construction')}`}</div>`}
                    </td>
                    <td class="num" data-label="${t('price')}">${s.own ? html`<span title="${t('pick.ownCost')}">${price(s.price)}</span>` : price(s.price)}</td>
                    <td class="num" data-label="${t('pick.freight')}">${price(s.freight)}</td>
                    <td class="num" data-label="${t('pick.delivered')}"><b>${price(s.unitCost)}</b></td>
                    <td class="num" data-label="${t('quality')}">${score(s.quality)}</td>
                    ${product.type === 'consumer' ? html`<td class="num" data-label="${t('brand')}">${score(brandOf(game, s.by, productId))}</td>` : ''}
                    <td class="num" data-label="${t('pick.available')}">${s.kind === 'import' ? '∞' : html`<span>${num(s.free)} <span class="muted small">${t('perDay')}</span></span>`}</td>
                    <td class="num">
                      ${current && ref.sup !== SUP.PRICE
                        ? pill(t('pick.current'), 'good')
                        : html`<button type="button" class="btn btn-primary btn-sm" data-act="chooseSource" data-src="${s.src}" ${Object.entries(data).map(([k, v]) => html` data-${k}="${v}"`)}>
                            ${t(current ? 'pick.accept' : 'choose')}
                          </button>`}
                    </td>
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>`}
    </div>`;
}

// ---------------------------------------------------------------------------
// What to produce on a line
// ---------------------------------------------------------------------------

export function recipeDialog(app, { building, line }) {
  const { game, me, content } = app;
  const b = game.state.buildings[building];
  if (!b) return null;
  const city = game.state.cities[b.city];
  const current = b.lines[line]?.recipe;
  const rows = content.recipes
    .filter((r) => r.building === b.type)
    .map((recipe) => {
      const product = content.products.get(recipe.output);
      const available = !recipe.raw || resourceQuality(city, recipe.output) != null;
      let est = null;
      if (available) {
        const probe = { recipe: recipe.id, inputs: {}, qty: 0, q: 0, uc: 0 };
        for (const id in recipe.inputs) probe.inputs[id] = { src: defaultSource(game, me, b.city, id), qty: 0, q: 0, uc: 0 };
        est = lineEstimate(game, b, probe);
      }
      return { recipe, product, available, est, need: me.buy[recipe.output] || 0 };
    })
    .sort((x, y) => Number(y.available) - Number(x.available) || y.need * y.product.cost - x.need * x.product.cost);
  return html`${head(t('pick.recipe.title'))}
    <div class="modal-body">
      <p class="muted">${t('pick.recipe.hint')}</p>
      <div class="table-wrap">
        <table class="data cards-narrow">
          <thead>
            <tr>
              <th>${t('product')}</th>
              <th>${t('pick.inputs')}</th>
              <th class="num">${t('pick.rate')}</th>
              <th class="num" title="${t('pick.estCost.hint')}">${t('pick.estCost')}</th>
              <th class="num">${t('pick.importPrice')}</th>
              <th class="num">${t('quality')}</th>
              <th class="num" title="${t('pick.need.hint')}">${t('pick.need')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(
              ({ recipe, product, available, est, need }) => html`<tr class="${recipe.id === current ? 'row-on' : ''} ${available ? '' : 'row-off'}">
                <td>${productName(product)}<div class="muted small">${t(`ptype.${product.type}`)}</div></td>
                <td data-label="${t('pick.inputs')}">
                  <span class="chips">
                    ${Object.keys(recipe.inputs).length === 0
                      ? html`<span class="muted">${t('pick.noInputs')}</span>`
                      : Object.entries(recipe.inputs).map(
                          ([id, per]) => html`<span class="chip" title="${L(content.products.get(id).name)}">${emoji(content.products.get(id).icon)}<span>${per}</span></span>`,
                        )}
                  </span>
                </td>
                <td class="num" data-label="${t('pick.rate')}">${num(recipe.rate)}</td>
                <td class="num" data-label="${t('pick.estCost')}">${est ? price(est.uc) : '–'}</td>
                <td class="num" data-label="${t('pick.importPrice')}">${product.importable ? price(importPrice(game, product)) : '–'}</td>
                <td class="num" data-label="${t('quality')}">${est ? score(est.q) : '–'}</td>
                <td class="num" data-label="${t('pick.need')}">${need > 0.5 ? html`<span>${num(need)} <span class="muted small">${t('perDay')}</span></span>` : '–'}</td>
                <td class="num">
                  ${recipe.id === current
                    ? pill(t('pick.current'), 'good')
                    : available
                      ? html`<button type="button" class="btn btn-primary btn-sm" data-act="chooseRecipe" data-building="${building}" data-line="${line}" data-recipe="${recipe.id}">${t('choose')}</button>`
                      : html`<span class="muted small">${t('pick.noResource')}</span>`}
                </td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    </div>`;
}

export const pickerActions = {
  pickProduct(app, d) {
    app.modal('product', { building: d.building, slot: Number(d.slot), wide: true });
  },
  chooseProduct(app, d) {
    const result = app.cmd('setSlot', { building: d.building, slot: Number(d.slot), product: d.product });
    if (result.ok) app.ui.modal = null;
  },
  pickSource(app, d) {
    const props = d.slot != null ? { building: d.building, slot: Number(d.slot) } : { building: d.building, line: Number(d.line), input: d.input };
    app.modal('source', { ...props, wide: true });
  },
  chooseSource(app, d) {
    const result =
      d.slot != null
        ? app.cmd('setSlotSource', { building: d.building, slot: Number(d.slot), src: d.src })
        : app.cmd('setLineSource', { building: d.building, line: Number(d.line), input: d.input, src: d.src });
    if (result.ok) app.ui.modal = null;
  },
  pickRecipe(app, d) {
    app.modal('recipe', { building: d.building, line: Number(d.line), wide: true });
  },
  chooseRecipe(app, d) {
    const result = app.cmd('setLine', { building: d.building, line: Number(d.line), recipe: d.recipe });
    if (result.ok) app.ui.modal = null;
  },
};

export { button };
