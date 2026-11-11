// "Company" view (list of the player's buildings) and the building panel.

import { flag, html } from '../dom.js';
import { L, t, tn } from '../i18n.js';
import { money, num, pct, price, score } from '../format.js';
import { icon } from '../icons.js';
import { meter, sparkline } from '../charts.js';
import { buildingLabel, buildingTitle, button, emoji, emptyState, heading, pill, productName, rated, toneOf } from '../components.js';
import { diagnose } from '../../sim/diagnostics.js';
import { upgradeCost, upkeepOf } from '../../sim/construction.js';
import { brandOf, marketSnapshot, slotCapacity } from '../../sim/market.js';
import { importPrice, lineCustomers, lineSrc, parseSrc, quote, SUP, techOf } from '../../sim/supply.js';
import { researchGain } from '../../sim/research.js';
import { diagText } from './overview.js';

const KIND_ORDER = ['retail', 'producer', 'research'];
const LAB_BUDGETS = [50_000, 100_000, 200_000, 400_000, 800_000];

/** Human-readable name of a supply source. */
export function sourceName(game, src) {
  const parsed = parseSrc(src);
  if (!parsed) return t('source.none');
  if (parsed.kind === 'import') return t('source.import');
  const b = game.state.buildings[parsed.building];
  if (!b) return t('source.gone');
  const owner = game.state.companies[b.co];
  const mine = b.co === game.state.humanId;
  return mine ? buildingTitle(game, b) : `${owner.name} · ${L(game.content.buildingTypes.get(b.type).name)}`;
}

/** A plant or lab that only serves its owner earns nothing itself — it is a cost centre. */
const costCentre = (b) => b.kind !== 'retail' && !!b.last && b.last.rev < 1;

function statusPill(game, b) {
  const { day } = game.state;
  if (b.ready > day) return pill(t('building.constructionLeft', { days: tn('n.days', b.ready - day) }), 'warn');
  if (b.up) return pill(t('building.upgradeLeft', { days: tn('n.days', Math.max(0, b.up - day)) }), 'info');
  return '';
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export const companyView = {
  id: 'company',
  order: 30,
  icon: 'buildings',
  label: 'nav.company',
  primary: true,
  render(app) {
    const { game, me, content } = app;
    if (!me) return html`<div class="view">${heading(t('nav.company'))}${emptyState(t('spectator'))}</div>`;
    const mine = game.buildingsOf(me.id);
    const problems = new Map();
    for (const d of diagnose(game, me)) {
      if (d.building && d.level !== 'info') problems.set(d.building, (problems.get(d.building) || 0) + 1);
    }
    if (!mine.length) {
      return html`<div class="view">
        ${heading(t('nav.company'))}
        ${emptyState(t('company.empty'), button(t('company.empty.go'), 'go', { view: 'map' }, { variant: 'primary' }))}
      </div>`;
    }
    return html`<div class="view">
      ${heading(t('nav.company'), html`<span class="muted">${tn('n.buildings', mine.length)}</span>`)}
      ${KIND_ORDER.map((kind) => {
        const list = mine.filter((b) => b.kind === kind);
        if (!list.length) return '';
        return html`<section class="card">
          <div class="card-head"><h3>${t(`kind.${kind}`)}</h3><span class="muted">${list.length}</span></div>
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>${t('building')}</th>
                  <th>${t('city.city')}</th>
                  <th class="num">${t('stat.revenue')}</th>
                  <th class="num">${t('stat.profit')}</th>
                  <th>${t('trend')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${list.map((b) => {
                  const city = game.state.cities[b.city];
                  const n = problems.get(b.id) || 0;
                  return html`<tr class="row-link" data-act="openBuilding" data-id="${b.id}" data-key="row-${b.id}">
                    <td>
                      ${buildingLabel(game, b)}
                      <div class="muted small">${L(content.buildingTypes.get(b.type).name)}${b.level > 1 ? ` · ${t('level')} ${b.level}` : ''}</div>
                    </td>
                    <td>${city.name}<div class="muted small">${L(content.districts.get(b.district).name)}</div></td>
                    <td class="num">${b.last ? money(b.last.rev) : '–'}</td>
                    <td class="num ${b.last && !costCentre(b) ? toneOf(b.last.profit) : ''}">
                      ${b.last ? money(b.last.profit) : '–'}${costCentre(b) ? html`<div class="muted small">${t('building.costCentre')}</div>` : ''}
                    </td>
                    <td>${sparkline(b.hist.slice(-12))}</td>
                    <td class="num">${statusPill(game, b)} ${n ? pill(tn('n.problems', n), 'bad') : ''}</td>
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>
        </section>`;
      })}
    </div>`;
  },
};

// ---------------------------------------------------------------------------
// Panel: store
// ---------------------------------------------------------------------------

const SUPPLY_TEXT = {
  [SUP.NONE]: ['source.status.none', 'bad'],
  [SUP.INVALID]: ['source.status.invalid', 'bad'],
  [SUP.NO_FUNDS]: ['source.status.noFunds', 'bad'],
  [SUP.SHORT]: ['source.status.short', 'warn'],
};

function supplyPill(ref) {
  if (!ref.src) return pill(t('source.status.none'), 'bad');
  const entry = SUPPLY_TEXT[ref.sup];
  return entry ? pill(t(entry[0]), entry[1]) : '';
}

function shelfCard(app, b, slot, index) {
  const { game, me, content } = app;
  if (!slot) {
    return html`<li class="unit unit-empty" data-key="slot-${index}">
      <span class="muted">${t('shelf.empty')}</span>
      ${button(t('shelf.add'), 'pickProduct', { building: b.id, slot: index }, { small: true, variant: 'primary', ic: 'plus' })}
    </li>`;
  }
  const product = content.products.get(slot.product);
  const snap = marketSnapshot(game, b.city, slot.product);
  const key = `${b.id}:${index}`;
  const mine = snap.offers.find((o) => o.key === key);
  const rivals = snap.offers.filter((o) => o.co !== me.id);
  const bestRival = rivals.reduce((best, o) => (o.rating > (best?.rating ?? -1) ? o : best), null);
  const cap = slotCapacity(game, b, product);
  const sold = slot.s ?? 0;
  const brand = brandOf(game, slot.by, slot.product);
  const margin = slot.uc > 0 ? 1 - slot.uc / slot.price : null;
  const quality = slot.q || 0;
  return html`<li class="unit" data-key="slot-${index}">
    <div class="unit-head">
      <b>${productName(product)}</b>
      <span class="unit-tools">
        <label class="check small" title="${t('shelf.auto.hint')}">
          <input id="auto-${b.id}-${index}" type="checkbox" data-change="slotAuto" data-building="${b.id}" data-slot="${index}"${flag('checked', slot.auto)} />
          <span>${t('shelf.auto')}</span>
        </label>
        <button type="button" class="icon-btn" data-act="clearSlot" data-building="${b.id}" data-slot="${index}" title="${t('shelf.remove')}">${icon('trash', 16)}</button>
      </span>
    </div>

    <div class="price-row">
      <span class="field-label">${t('price')}</span>
      <span class="stepper">
        <button type="button" class="icon-btn" data-act="slotPriceStep" data-building="${b.id}" data-slot="${index}" data-dir="-1" aria-label="${t('price.lower')}"${flag('disabled', slot.auto)}>${icon('minus', 16)}</button>
        <input id="price-${b.id}-${index}" type="number" inputmode="decimal" step="0.01" min="0.01" value="${slot.price.toFixed(2)}" data-change="slotPrice" data-building="${b.id}" data-slot="${index}"${flag('disabled', slot.auto)} />
        <button type="button" class="icon-btn" data-act="slotPriceStep" data-building="${b.id}" data-slot="${index}" data-dir="1" aria-label="${t('price.raise')}"${flag('disabled', slot.auto)}>${icon('plus', 16)}</button>
      </span>
      <span class="muted small">
        ${t('shelf.ref', { price: price(snap.ref) })}${bestRival ? html` · ${t('shelf.rival', { price: price(bestRival.price) })}` : ''}
      </span>
    </div>

    <dl class="facts-grid">
      <div>
        <dt>${t('supplier')}</dt>
        <dd>
          <span>${sourceName(game, slot.src)}</span> ${supplyPill(slot)}
          ${button(t('change'), 'pickSource', { building: b.id, slot: index }, { small: true, variant: 'ghost' })}
        </dd>
      </div>
      <div>
        <dt>${t('shelf.stock')}</dt>
        <dd>
          ${num(slot.qty)} · ${t('shelf.unitCost', { cost: slot.uc > 0 ? price(slot.uc) : '–' })}
          ${margin != null ? html` · <span class="${margin < 0 ? 'bad' : ''}">${t('shelf.margin', { pct: pct(margin) })}</span>` : ''}
        </dd>
      </div>
      <div>
        <dt>${t('quality')}</dt>
        <dd>${rated(quality, { label: t('quality') })}</dd>
      </div>
      <div>
        <dt>${t('brand')}</dt>
        <dd>${rated(brand, { tone: 'brass', label: t('brand') })}</dd>
      </div>
      <div class="span-2">
        <dt title="${t('rating.hint')}">${t('rating')}</dt>
        <dd>
          <b>${mine ? score((100 * mine.rating) / snap.local.rating) : '–'}</b>
          <span class="muted small">
            ${t('rating.local')}${bestRival ? html` · ${t('rating.rival', { n: score((100 * bestRival.rating) / snap.local.rating) })}` : ''}
          </span>
        </dd>
      </div>
      <div class="span-2">
        <dt>${t('shelf.sales')}</dt>
        <dd>
          ${meter(cap > 0 ? sold / cap : 0, { tone: slot.cl > 0.6 ? 'warn' : 'accent', label: pct(cap > 0 ? sold / cap : 0) })}
          <span>${t('shelf.salesOf', { sold: num(sold), cap: num(cap) })}</span>
          ${slot.cl > 0.6 ? pill(t('shelf.crowded'), 'warn') : ''} ${slot.so > 0.5 ? pill(t('shelf.runsOut'), 'warn') : ''}
        </dd>
      </div>
      ${slot.last
        ? html`<div class="span-2">
            <dt>${t('stat.lastMonth')}</dt>
            <dd>
              ${t('shelf.last', { rev: money(slot.last.rev) })}
              <span class="${toneOf(slot.last.profit)}">${t('shelf.lastProfit', { profit: money(slot.last.profit) })}</span>
            </dd>
          </div>`
        : ''}
    </dl>
  </li>`;
}

// ---------------------------------------------------------------------------
// Panel: producer
// ---------------------------------------------------------------------------

function lineCard(app, b, line, index) {
  const { game, me, content } = app;
  if (!line) {
    return html`<li class="unit unit-empty" data-key="line-${index}">
      <span class="muted">${t('line.empty')}</span>
      ${button(t('line.choose'), 'pickRecipe', { building: b.id, line: index }, { small: true, variant: 'primary', ic: 'plus' })}
    </li>`;
  }
  const recipe = content.recipes.get(line.recipe);
  const product = content.products.get(recipe.output);
  const made = line.made ?? 0;
  const customers = lineCustomers(game, lineSrc(b.id, index));
  const state = line.idle === 'inputs' ? pill(t('line.idle.inputs'), 'warn') : line.idle === 'full' ? pill(t('line.idle.full'), 'warn') : '';
  return html`<li class="unit" data-key="line-${index}">
    <div class="unit-head">
      <b>${productName(product)}</b>
      <span class="unit-tools">
        ${button(t('change'), 'pickRecipe', { building: b.id, line: index }, { small: true, variant: 'ghost' })}
        <button type="button" class="icon-btn" data-act="clearLine" data-building="${b.id}" data-line="${index}" title="${t('line.remove')}">${icon('trash', 16)}</button>
      </span>
    </div>
    <dl class="facts-grid">
      <div class="span-2">
        <dt>${t('line.output')}</dt>
        <dd>
          ${meter(made / recipe.rate, { label: pct(made / recipe.rate) })}
          <span>${t('line.outputOf', { made: num(made), rate: num(recipe.rate) })}</span> ${state}
        </dd>
      </div>
      <div>
        <dt>${t('line.store')}</dt>
        <dd>${num(line.qty)} · ${t('shelf.unitCost', { cost: line.uc > 0 ? price(line.uc) : '–' })}</dd>
      </div>
      <div>
        <dt>${t('quality')}</dt>
        <dd>${line.qty > 0 || line.q > 0 ? rated(line.q, { label: t('quality') }) : '–'}</dd>
      </div>
      ${Object.keys(recipe.inputs).map((id) => {
        const inp = line.inputs[id];
        const input = content.products.get(id);
        return html`<div class="span-2">
          <dt>${productName(input)} <span class="muted small">× ${recipe.inputs[id]}</span></dt>
          <dd>
            <span>${t('line.inputStock', { n: num(inp.qty) })}</span> · <span>${sourceName(game, inp.src)}</span> ${supplyPill(inp)}
            ${button(t('change'), 'pickSource', { building: b.id, line: index, input: id }, { small: true, variant: 'ghost' })}
          </dd>
        </div>`;
      })}
      <div class="span-2">
        <dt>${t('line.customers')}</dt>
        <dd>
          ${t('line.customers.own', { n: customers.own })} · ${t('line.customers.outside', { n: customers.outside })}
          ${line.ext > 0.5 ? html` · ${t('line.extSales', { n: num(line.ext) })}` : ''}
        </dd>
      </div>
      <div class="span-2">
        <dt>${t('line.sell')}</dt>
        <dd class="sell-row">
          <label class="check small" title="${t('line.sell.hint')}">
            <input id="sell-${b.id}-${index}" type="checkbox" data-change="lineSell" data-building="${b.id}" data-line="${index}"${flag('checked', line.sell)} />
            <span>${t('line.sell.on')}</span>
          </label>
          <input id="lprice-${b.id}-${index}" class="short" type="number" inputmode="decimal" step="0.01" min="0.01" value="${line.price.toFixed(2)}" data-change="linePrice" data-building="${b.id}" data-line="${index}" aria-label="${t('line.sell.price')}" />
          <span class="muted small">${product.importable ? t('line.sell.import', { price: price(importPrice(game, product)) }) : ''}</span>
        </dd>
      </div>
    </dl>
  </li>`;
}

// ---------------------------------------------------------------------------
// Panel: research
// ---------------------------------------------------------------------------

function labCard(app, b, lab, index) {
  const { game, me, content } = app;
  const researchable = content.products.filter((p) => p.type !== 'raw');
  const tech = lab ? techOf(game, me, lab.product) : null;
  return html`<li class="unit" data-key="lab-${index}">
    <div class="unit-head">
      <b>${t('lab.team', { n: index + 1 })}</b>
      ${lab
        ? html`<button type="button" class="icon-btn" data-act="clearLab" data-building="${b.id}" data-lab="${index}" title="${t('lab.stop')}">${icon('trash', 16)}</button>`
        : ''}
    </div>
    <div class="field-row">
      <label class="field">
        <span class="field-label">${t('lab.product')}</span>
        <select id="lab-product-${b.id}-${index}" data-change="labProduct" data-building="${b.id}" data-lab="${index}">
          <option value=""${flag('selected', !lab)}>${t('lab.none')}</option>
          ${researchable.map((p) => html`<option value="${p.id}"${flag('selected', lab?.product === p.id)}>${p.icon} ${L(p.name)}</option>`)}
        </select>
      </label>
      <label class="field">
        <span class="field-label">${t('lab.budget')}</span>
        <select id="lab-budget-${b.id}-${index}" data-change="labBudget" data-building="${b.id}" data-lab="${index}"${flag('disabled', !lab)}>
          ${LAB_BUDGETS.map((x) => html`<option value="${x}"${flag('selected', (lab?.budget ?? 100_000) === x)}>${money(x)}</option>`)}
        </select>
      </label>
    </div>
    ${lab
      ? html`<p class="muted small">
          ${t('lab.status', { tech: score(tech), world: score(game.state.economy.tech), gain: researchGain(game, lab.budget, tech).toFixed(2) })}
        </p>`
      : html`<p class="muted small">${t('lab.idle')}</p>`}
  </li>`;
}

// ---------------------------------------------------------------------------
// Panel shell
// ---------------------------------------------------------------------------

export function buildingPanel(app, { id }) {
  const { game, me, content } = app;
  const b = game.state.buildings[id];
  if (!b || !me || b.co !== me.id) {
    app.ui.panel = null;
    return null;
  }
  const type = content.buildingTypes.get(b.type);
  const city = game.state.cities[b.city];
  const district = content.districts.get(b.district);
  const ready = game.isReady(b);
  const canUpgrade = game.can(me.id, 'upgrade', { building: id });
  const renaming = app.ui.renaming === id;
  const issues = diagnose(game, me).filter((d) => d.building === id && d.level !== 'info');
  const total = b.ready - b.built;
  return html`<div class="panel-inner">
    <header class="panel-head">
      <div class="panel-title">
        <span class="panel-icon">${emoji(type.icon)}</span>
        ${renaming
          ? html`<input id="rename-${id}" class="rename" type="text" maxlength="40" value="${buildingTitle(game, b)}" data-change="renameBuilding" data-id="${id}" aria-label="${t('rename')}" />`
          : html`<h2>${buildingTitle(game, b)}</h2>
              <button type="button" class="icon-btn" data-act="renameStart" data-id="${id}" title="${t('rename')}">${icon('edit', 16)}</button>`}
      </div>
      <button type="button" class="icon-btn" data-act="closePanel" aria-label="${t('close')}">${icon('close')}</button>
    </header>
    <p class="panel-sub">
      ${L(type.name)} · <a href="#" data-act="openCity" data-city="${city.id}">${city.name}</a>, ${L(district.name)} · ${t('level')} ${b.level}/${type.maxLevel}
    </p>
    ${!ready
      ? html`<div class="notice notice-warn">
          ${t('building.constructionLeft', { days: tn('n.days', b.ready - game.state.day) })}
          ${meter(total > 0 ? 1 - (b.ready - game.state.day) / total : 0, { tone: 'warn' })}
          <span class="small">${t('building.prepare')}</span>
        </div>`
      : ''}
    ${b.up ? html`<div class="notice">${t('building.upgradeLeft', { days: tn('n.days', Math.max(0, b.up - game.state.day)) })}</div>` : ''}
    ${issues.length
      ? html`<ul class="alerts compact">
          ${issues.slice(0, 4).map((d) => html`<li class="alert alert-${d.level}"><span class="alert-icon">${icon('warn', 16)}</span><span class="alert-text">${diagText(game, d)}</span></li>`)}
        </ul>`
      : ''}
    <div class="panel-stats">
      <div><span class="stat-label">${t('building.upkeep')}</span><b>${money(upkeepOf(game, b))}</b><span class="muted small">${t('perMonth')}</span></div>
      <div><span class="stat-label">${t('building.book')}</span><b>${money(b.book)}</b></div>
      <div>
        <span class="stat-label">${t(costCentre(b) ? 'building.costs' : 'stat.profit')}</span>
        <b class="${b.last && !costCentre(b) ? toneOf(b.last.profit) : ''}">${b.last ? money(costCentre(b) ? -b.last.profit : b.last.profit) : '–'}</b>
        <span class="muted small">${t('stat.lastMonth')}</span>
      </div>
    </div>
    <div class="panel-actions">
      <button type="button" class="btn btn-sm" data-act="upgradeBuilding" data-id="${id}"${flag('disabled', !canUpgrade.ok)} title="${canUpgrade.ok ? t('building.upgrade.hint') : t(canUpgrade.error, { need: money(canUpgrade.params?.need ?? 0) })}">
        ${icon('up', 16)}<span>${b.level >= type.maxLevel ? t('building.maxLevel') : t('building.upgrade', { cost: money(upgradeCost(game, b)) })}</span>
      </button>
      <button type="button" class="btn btn-sm btn-danger" data-act="demolishAsk" data-id="${id}">${icon('trash', 16)}<span>${t('building.demolish')}</span></button>
    </div>

    ${b.kind === 'retail'
      ? html`<h3 class="panel-section">${t('shelves')} <span class="muted small">${L(type.desc)}</span></h3>
          <ul class="units">${b.slots.map((slot, i) => shelfCard(app, b, slot, i))}</ul>`
      : ''}
    ${b.kind === 'producer'
      ? html`<h3 class="panel-section">${t('lines')}</h3>
          <ul class="units">${b.lines.map((line, i) => lineCard(app, b, line, i))}</ul>`
      : ''}
    ${b.kind === 'research'
      ? html`<h3 class="panel-section">${t('labs')}</h3>
          <p class="muted small">${t('lab.hint')}</p>
          <ul class="units">${b.labs.map((lab, i) => labCard(app, b, lab, i))}</ul>`
      : ''}
  </div>`;
}

export const buildingActions = {
  openBuilding(app, d) {
    app.openBuilding(d.id);
  },
  closePanel(app) {
    app.ui.renaming = null;
    app.closePanel();
  },
  renameStart(app, d) {
    app.ui.renaming = d.id;
    requestAnimationFrame(() => app.root.querySelector(`#rename-${CSS.escape(d.id)}`)?.select());
  },
  renameBuilding(app, d, el) {
    app.cmd('rename', { building: d.id, name: el.value });
    app.ui.renaming = null;
  },
  upgradeBuilding(app, d) {
    if (app.cmd('upgrade', { building: d.id }).ok) app.toast(t('toast.upgradeStarted'), 'good');
  },
  demolishAsk(app, d) {
    const b = app.game.state.buildings[d.id];
    if (!b) return;
    app.confirm({
      title: t('demolish.title'),
      text: t('demolish.text', { name: buildingTitle(app.game, b), value: money(b.book * (app.game.isReady(b) ? app.content.balance.building.salvage : app.content.balance.building.cancelRefund)) }),
      ok: t('building.demolish'),
      danger: true,
      onOk: () => {
        if (app.cmd('demolish', { building: d.id }).ok) app.ui.panel = null;
      },
    });
  },
  // --- shelves ---
  clearSlot(app, d) {
    app.cmd('clearSlot', { building: d.building, slot: Number(d.slot) });
  },
  slotPrice(app, d, el) {
    const value = Number(String(el.value).replace(',', '.'));
    if (value > 0) app.cmd('setSlotPrice', { building: d.building, slot: Number(d.slot), price: Math.round(value * 100) / 100 });
  },
  slotPriceStep(app, d) {
    const slot = app.game.state.buildings[d.building]?.slots?.[Number(d.slot)];
    if (!slot) return;
    const next = Math.max(0.01, Math.round(slot.price * (1 + Number(d.dir) * 0.03) * 100) / 100);
    app.cmd('setSlotPrice', { building: d.building, slot: Number(d.slot), price: next === slot.price ? next + Number(d.dir) * 0.01 : next });
  },
  slotAuto(app, d, el) {
    app.cmd('setSlotAuto', { building: d.building, slot: Number(d.slot), auto: el.checked });
  },
  // --- lines ---
  clearLine(app, d) {
    app.cmd('clearLine', { building: d.building, line: Number(d.line) });
  },
  lineSell(app, d, el) {
    app.cmd('setLineSale', { building: d.building, line: Number(d.line), sell: el.checked });
  },
  linePrice(app, d, el) {
    const value = Number(String(el.value).replace(',', '.'));
    if (value > 0) app.cmd('setLineSale', { building: d.building, line: Number(d.line), price: value });
  },
  // --- labs ---
  labProduct(app, d, el) {
    const lab = Number(d.lab);
    if (!el.value) return void app.cmd('clearLab', { building: d.building, lab }, { quiet: true });
    const current = app.game.state.buildings[d.building]?.labs?.[lab];
    app.cmd('setLab', { building: d.building, lab, product: el.value, budget: current?.budget ?? 100_000 });
  },
  labBudget(app, d, el) {
    const lab = Number(d.lab);
    const current = app.game.state.buildings[d.building]?.labs?.[lab];
    if (current) app.cmd('setLab', { building: d.building, lab, product: current.product, budget: Number(el.value) });
  },
  clearLab(app, d) {
    app.cmd('clearLab', { building: d.building, lab: Number(d.lab) });
  },
};

export { quote };
