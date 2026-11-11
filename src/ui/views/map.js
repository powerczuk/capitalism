// Map of the country, the city pages behind it, and the "build" dialog.

import { esc, flag, html, raw } from '../dom.js';
import { L, t, tn } from '../i18n.js';
import { int, money, num, pct } from '../format.js';
import { icon } from '../icons.js';
import { seriesColor, shareBar } from '../charts.js';
import { buildingTitle, button, coName, dot, emoji, emptyState, heading, pill, productName, rated, stat } from '../components.js';
import { baseDemand } from '../../sim/market.js';
import { buildCost, cityHasResourceFor } from '../../sim/construction.js';
import { freePlots, landIndex, plotsOf, usedPlots, wageIndex, resourceQuality } from '../../sim/world.js';
import { builtShare, cityPlan } from '../../geo/cityPlan.js';
import { planSvg } from '../../geo/planSvg.js';
import { registerWidget } from '../widgets.js';
import { savePrefs } from '../storage.js';

const W = 1000;
const H = 640;

/** Deterministic pseudo-random in [0,1) from an integer (decorations only). */
const jitter = (n) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

// The map is assembled as one SVG string, so nothing from the game state goes
// into it unescaped: coordinates are forced to numbers, ids and names escaped.
const at = (city) => ({ x: Number(city.x) || 0, y: Number(city.y) || 0 });

function roads(places) {
  const cities = places.map((city) => ({ id: city.id, ...at(city) }));
  const seen = new Set();
  let out = '';
  for (const a of cities) {
    const near = cities
      .filter((b) => b !== a)
      .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))
      .slice(0, 2);
    for (const b of near) {
      const key = [a.id, b.id].sort().join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      // A gentle bend makes the network read as roads, not as a graph.
      const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.08;
      const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.08;
      out += `<path d="M${a.x} ${a.y} Q${mx.toFixed(0)} ${my.toFixed(0)} ${b.x} ${b.y}" class="map-road"/>`;
    }
  }
  return out;
}

function terrain() {
  // Coast: a wavy line along the north.
  let coast = `M0 0 H${W} V70`;
  for (let x = W; x >= 0; x -= 50) coast += ` Q${x - 25} ${70 + (jitter(x) - 0.5) * 34} ${x - 50} ${70 + (jitter(x + 7) - 0.5) * 12}`;
  coast += ' Z';
  let waves = '';
  for (let i = 0; i < 9; i++) {
    const x = 40 + i * 112 + jitter(i) * 30;
    const y = 18 + jitter(i + 20) * 30;
    waves += `<path d="M${x} ${y} q8 -6 16 0 t16 0" class="map-wave"/>`;
  }
  // Mountains along the south.
  let hills = '';
  for (let i = 0; i < 16; i++) {
    const x = 20 + i * 64 + jitter(i + 40) * 26;
    const h = 46 + jitter(i + 60) * 54;
    const y = H - 14 - jitter(i + 80) * 22;
    hills += `<path d="M${x - h * 0.62} ${y} L${x} ${y - h} L${x + h * 0.62} ${y} Z" class="map-hill"/>`;
    hills += `<path d="M${x - h * 0.16} ${y - h * 0.74} L${x} ${y - h} L${x + h * 0.18} ${y - h * 0.7}" class="map-snow"/>`;
  }
  // A few field patches in the middle of the country.
  let fields = '';
  for (let i = 0; i < 14; i++) {
    const x = 60 + jitter(i + 100) * (W - 160);
    const y = 150 + jitter(i + 120) * 300;
    for (let k = 0; k < 3; k++) fields += `<path d="M${x} ${y + k * 7} h34" class="map-field"/>`;
  }
  return `<path d="${coast}" class="map-sea"/>${waves}${fields}${hills}`;
}

function countryMap(app) {
  const { game, me } = app;
  const cities = game.cities();
  const big = app.narrow;
  const nameSize = big ? 44 : 27;
  const subSize = big ? 30 : 17;
  let marks = '';
  for (const place of cities) {
    const city = { ...place, ...at(place), name: String(place.name) };
    const r = 12 + Math.sqrt(Math.max(0, Number(city.pop) || 0) / 1e6) * 13;
    const here = game.buildingsIn(city.id);
    const owners = [...new Set(here.map((b) => b.co))].map((id) => game.state.companies[id]).filter((c) => c?.alive);
    const mine = me ? here.filter((b) => b.co === me.id).length : 0;
    let dots = '';
    owners.forEach((co, i) => {
      const angle = -Math.PI / 2 + (i - (owners.length - 1) / 2) * 0.62;
      const cx = city.x + Math.cos(angle) * (r + 13);
      const cy = city.y + Math.sin(angle) * (r + 13);
      dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${big ? 9 : 6.5}" fill="${seriesColor(co.color)}" class="map-co"/>`;
    });
    const below = city.y < H - 120;
    const ly = below ? city.y + r + nameSize + 4 : city.y - r - subSize - 14;
    // Keep the label inside the map even for cities near the border.
    const half = Math.max(city.name.length * nameSize * 0.27, 60) + 10;
    const lx = Math.min(W - half, Math.max(half, city.x));
    marks += `<g class="map-city" data-act="openCity" data-city="${esc(city.id)}" tabindex="0" role="button" aria-label="${esc(city.name)}">
      <circle cx="${city.x}" cy="${city.y}" r="${(r + 22).toFixed(1)}" class="map-hit"/>
      <circle cx="${city.x}" cy="${city.y}" r="${r.toFixed(1)}" class="map-node"/>
      ${city.port ? `<path d="M${city.x - 5} ${city.y + 1}a5 5 0 0 0 10 0M${city.x} ${city.y - 6}v11M${city.x - 3} ${city.y - 3}h6" class="map-anchor"/>` : `<circle cx="${city.x}" cy="${city.y}" r="${(r * 0.36).toFixed(1)}" class="map-core"/>`}
      ${dots}
      <text x="${lx}" y="${ly}" text-anchor="middle" class="map-name" style="font-size:${nameSize}px">${esc(city.name)}</text>
      <text x="${lx}" y="${ly + subSize + 4}" text-anchor="middle" class="map-sub" style="font-size:${subSize}px">${esc(num(city.pop))}${mine ? ` · ${esc(tn('n.buildings', mine))}` : ''}</text>
    </g>`;
  }
  return raw(
    `<svg class="map" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(t('map.title'))}">
      <rect width="${W}" height="${H}" class="map-land"/>${terrain()}${roads(cities)}${marks}
    </svg>`,
  );
}

function resourceChips(app, city) {
  const { content } = app;
  const ids = Object.keys(city.res);
  if (!ids.length) return html`<span class="muted">${t('city.noResources')}</span>`;
  return html`<span class="chips">
    ${ids.map((id) => {
      const p = content.products.get(id);
      return html`<span class="chip" title="${L(p.name)} · ${t('quality')} ${city.res[id]}">${emoji(p.icon)}<span>${city.res[id]}</span></span>`;
    })}
  </span>`;
}

function cityTable(app) {
  const { game, me, content } = app;
  return html`<div class="table-wrap">
    <table class="data">
      <thead>
        <tr>
          <th>${t('city.city')}</th>
          <th class="num">${t('city.pop')}</th>
          <th class="num" title="${t('city.wealth.hint')}">${t('city.wealth')}</th>
          <th class="num" title="${t('city.land.hint')}">${t('city.land')}</th>
          <th class="num">${t('city.mine')}</th>
          <th>${t('city.resources')}</th>
        </tr>
      </thead>
      <tbody>
        ${game.cities().map(
          (city) => html`<tr class="row-link" tabindex="0" data-act="openCity" data-city="${city.id}">
            <td>
              <b>${city.name}</b>
              <div class="muted small">${L(content.cityArchetypes.find(city.arch)?.name)}${city.port ? ` · ${t('city.port')}` : ''}</div>
            </td>
            <td class="num">${num(city.pop)}</td>
            <td class="num">${pct(city.wealth)}</td>
            <td class="num">${pct(landIndex(city))}</td>
            <td class="num">${me ? game.buildingsIn(city.id).filter((b) => b.co === me.id).length : '–'}</td>
            <td>${resourceChips(app, city)}</td>
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

// ---------------------------------------------------------------------------
// City page
// ---------------------------------------------------------------------------

function districtCard(app, city, district) {
  const { game, me, content } = app;
  const here = game.buildingsIn(city.id).filter((b) => b.district === district.id);
  const total = plotsOf(content, city, district.id);
  const types = content.buildingTypes.filter((type) => type.districts.includes(district.id));
  const free = total - here.length;
  return html`<section class="card district">
    <div class="card-head">
      <h3>${emoji(district.icon)} ${L(district.name)}</h3>
      <span class="muted">${t('city.plots', { used: here.length, total })}</span>
    </div>
    <p class="card-note">${L(district.desc)}</p>
    <div class="facts">
      <span>${t('district.traffic')} <b>×${district.traffic.toFixed(2)}</b></span>
      <span>${t('district.cost')} <b>×${district.cost.toFixed(2)}</b></span>
      <span>${t('district.upkeep')} <b>×${district.upkeep.toFixed(2)}</b></span>
    </div>
    <ul class="lots">
      ${here.map((b) => {
        const type = content.buildingTypes.get(b.type);
        const owner = game.state.companies[b.co];
        const own = me && b.co === me.id;
        const building = !game.isReady(b);
        return html`<li class="lot ${own ? 'lot-own' : ''}" data-key="lot-${b.id}">
          ${own
            ? html`<button type="button" class="lot-btn" data-act="openBuilding" data-id="${b.id}">
                ${dot(owner)}${emoji(type.icon)}<span class="lot-name">${buildingTitle(game, b)}</span>
                ${building ? pill(t('building.construction'), 'warn') : b.level > 1 ? pill(`${t('level')} ${b.level}`) : ''}
              </button>`
            : html`<span class="lot-btn">
                ${dot(owner)}${emoji(type.icon)}<span class="lot-name">${L(type.name)}</span><span class="muted small">${owner.name}</span>
                ${building ? pill(t('building.construction'), 'warn') : ''}
              </span>`}
        </li>`;
      })}
    </ul>
    ${me && types.length
      ? html`<div>
          <button type="button" class="btn btn-sm" data-act="openBuild" data-city="${city.id}" data-district="${district.id}"${flag('disabled', free <= 0)}>
            ${icon('plus', 16)}<span>${free > 0 ? t('city.build') : t('city.full')}</span>
          </button>
        </div>`
      : ''}
  </section>`;
}

function cityMarket(app, city) {
  const { game, me, content } = app;
  const companies = game.companies();
  const rows = content.consumerProducts
    .map((product) => {
      const demand = baseDemand(game, city, product);
      const sold = city.mk[product.id]?.u ?? {};
      return { product, demand, value: demand * product.price, sold };
    })
    .sort((a, b) => b.value - a.value);
  return html`<section class="card">
    <div class="card-head"><h3>${t('city.market')}</h3></div>
    <p class="card-note">${t('city.market.note')}</p>
    <ul class="legend">
      ${companies.map((co) => html`<li>${dot(co)}${co.name}</li>`)}
      <li><span class="dot dot-local"></span>${t('local.shops')}</li>
    </ul>
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>${t('product')}</th>
            <th class="num">${t('city.market.value')}</th>
            <th class="wide-cell">${t('city.market.shares')}</th>
            ${me ? html`<th class="num">${t('city.market.mine')}</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${rows.map(({ product, demand, value, sold }) => {
            const parts = companies.map((co) => ({ label: co.name, value: sold[co.id] || 0, color: seriesColor(co.color) }));
            const served = parts.reduce((s, p) => s + p.value, 0);
            parts.push({ label: t('local.shops'), value: Math.max(0, demand - served), color: 'var(--local)' });
            return html`<tr class="row-link" tabindex="0" data-act="openProduct" data-product="${product.id}">
              <td>${productName(product)}</td>
              <td class="num">${money(value)}</td>
              <td class="wide-cell">${shareBar(parts)}</td>
              ${me ? html`<td class="num">${pct((sold[me.id] || 0) / demand, 0)}</td>` : ''}
            </tr>`;
          })}
        </tbody>
      </table>
    </div>
  </section>`;
}

/** The plan of a city, cached for as long as the game lasts. */
const plans = new WeakMap();
function planOf(app, city) {
  let byCity = plans.get(app.game);
  if (!byCity) plans.set(app.game, (byCity = new Map()));
  if (!byCity.has(city.id)) byCity.set(city.id, cityPlan(app.content, city, { seed: app.game.state.settings.seed, cities: app.game.cities() }));
  return byCity.get(city.id);
}

/** A flat plan of the city with its plots: the way to pick a plot without the 3D view. */
function cityPlanBox(app, city) {
  const { game, me, content } = app;
  const free = {};
  for (const d of content.districts.all()) free[d.id] = plotsOf(content, city, d.id);
  const plots = game.buildingsIn(city.id).map((b) => {
    const owner = game.state.companies[b.co];
    const own = !!me && b.co === me.id;
    return { district: b.district, lot: b.lot, color: seriesColor(owner?.color ?? 7), own, id: own ? b.id : null, label: own ? buildingTitle(game, b) : `${L(content.buildingTypes.find(b.type)?.name)} · ${owner?.name ?? ''}` };
  });
  return html`<section class="card">
    <div class="card-head"><h3>${t('city.plan')}</h3></div>
    <div class="plan-box">
      ${raw(
        planSvg(planOf(app, city), {
          plots,
          free,
          built: builtShare(content, city),
          title: `${t('city.plan')}: ${city.name}`,
          interactive: !!me,
          lotLabel: (district, lot) => t('city.plan.lot', { n: lot + 1, district: L(content.districts.find(district)?.name) ?? district }),
        }),
      )}
    </div>
    <p class="card-note">${t(me ? 'city.plan.note' : 'city.plan.watch')}</p>
  </section>`;
}

/** Numbers, resources, districts and the market of a city. */
function cityFacts(app, city) {
  const { game, content } = app;
  return html`<div class="stat-row">
      ${stat({ label: t('city.pop'), value: int(city.pop), sub: t('city.growth', { pct: pct(city.growth, 1) }) })}
      ${stat({ label: t('city.wealth'), value: pct(city.wealth), sub: t('city.wealth.hint') })}
      ${stat({ label: t('city.wages'), value: pct(wageIndex(game, city)), sub: t('city.wages.hint') })}
      ${stat({ label: t('city.land'), value: pct(landIndex(city)), sub: t('city.land.hint') })}
    </div>
    <section class="card">
      <div class="card-head"><h3>${t('city.resources')}</h3></div>
      ${Object.keys(city.res).length === 0
        ? emptyState(t('city.noResources'))
        : html`<ul class="res-list">
            ${Object.keys(city.res).map((id) => {
              const p = content.products.get(id);
              return html`<li>${productName(p)}${rated(resourceQuality(city, id), { label: t('quality') })}</li>`;
            })}
          </ul>`}
      <p class="card-note">${t('city.resources.note')}</p>
    </section>
    <div class="district-grid">${content.districts.all().map((d) => districtCard(app, city, d))}</div>
    ${cityMarket(app, city)}`;
}

function cityPage(app, city) {
  const arch = app.content.cityArchetypes.find(city.arch);
  return html`<div class="view">
    <div class="crumbs">
      <button type="button" class="btn btn-ghost btn-sm" data-act="go" data-view="map">${icon('back', 16)}<span>${t('nav.map')}</span></button>
      ${solidButton(app)}
    </div>
    ${heading(city.name, html`${pill(L(arch?.name))} ${city.port ? pill(`⚓ ${t('city.port')}`, 'info') : ''}`)}
    ${cityPlanBox(app, city)} ${cityFacts(app, city)}
  </div>`;
}

// ---------------------------------------------------------------------------
// The 3D world: a canvas that fills the view, with a bar of tools over it
// ---------------------------------------------------------------------------

/** Is the map shown in 3D? (The player may prefer the flat one; WebGL may be missing.) */
const solid = (app) => app.prefs.map3d !== false && !app.no3d;

/** The button that brings the 3D view back (nothing where it cannot work). */
function solidButton(app) {
  if (app.no3d) return '';
  return html`<button type="button" class="btn btn-sm" data-act="worldSolid">${icon('cube', 16)}<span>${t('world.solid')}</span></button>`;
}

/** A button of the map's toolbar. `on` (true or false) makes it a toggle; leave it out for a plain button. */
const tool = (name, act, label, data = '', on = null) =>
  html`<button type="button" class="tool ${on ? 'on' : ''}" data-act="${act}"${raw(data)} title="${label}" aria-label="${label}"${raw(on == null ? '' : ` aria-pressed="${!!on}"`)}>${icon(name, 20)}</button>`;

/** What stands on a plot the player looked at but does not own. */
function infoCard(app, id) {
  const { game, content } = app;
  const b = game.state.buildings[id];
  if (!b) return '';
  const type = content.buildingTypes.find(b.type);
  const owner = game.state.companies[b.co];
  return html`<div class="world-card">
    <div class="world-card-head">
      <b>${emoji(type?.icon ?? '🏢')} ${L(type?.name) ?? b.type}</b>
      <button type="button" class="icon-btn" data-act="worldInfoClose" aria-label="${t('close')}">${icon('close', 16)}</button>
    </div>
    <div>${coName(owner)}</div>
    <div class="muted small">
      ${L(content.districts.find(b.district)?.name)} · ${t('level')} ${b.level}${game.isReady(b) ? '' : ` · ${t('building.construction')}`}
    </div>
  </div>`;
}

/**
 * Who has built here: the companies with buildings in the city (in the whole
 * country, on its map), the busiest first. It is the key to the colours of
 * the marks over buildings and of the flags over cities.
 */
function owners(app, city) {
  const { game } = app;
  const count = new Map();
  for (const b of city ? game.buildingsIn(city.id) : Object.values(game.state.buildings)) count.set(b.co, (count.get(b.co) ?? 0) + 1);
  return [...count]
    .map(([id, n]) => ({ co: game.state.companies[id], n }))
    .filter((o) => o.co)
    .sort((a, b) => b.n - a.n);
}

function worldView(app, city) {
  const { game, me, content } = app;
  const w = app.ui.world;
  if (w.lots == null) w.lots = app.prefs.mapLots !== false; // free plots are lit unless the player has switched that off
  const arch = city ? content.cityArchetypes.find(city.arch) : null;
  const mine = city && me ? game.buildingsIn(city.id).filter((b) => b.co === me.id).length : 0;
  const hint = !city ? t('world.hint.country') : me && w.lots ? t('world.hint.build') : t('world.hint.city');
  const who = owners(app, city);
  return html`<div class="world ${w.details ? 'with-details' : ''}">
    <div id="world3d" class="world-stage" data-widget="world3d" data-morph="keep"></div>
    <div class="world-hud">
      <div class="world-bar">
        <div class="world-title">
          ${city ? html`<button type="button" class="tool" data-act="go" data-view="map" title="${t('nav.map')}" aria-label="${t('nav.map')}">${icon('back', 20)}</button>` : ''}
          <div class="world-name">
            <h2>${city ? city.name : t('map.title')}</h2>
            <span class="muted small">
              ${city
                ? html`${L(arch?.name)}${city.port ? ` · ⚓ ${t('city.port')}` : ''} · ${num(city.pop)}${me ? html` · ${tn('n.buildings', mine)}` : ''}`
                : tn('n.cities', game.cities().length)}
            </span>
          </div>
        </div>
        <div class="world-tools" role="toolbar" aria-label="${t('world.tools')}">
          ${city && me ? tool('plots', 'worldLots', t('world.lots'), '', !!w.lots) : ''}
          ${tool('turnLeft', 'worldTurn', t('world.turnLeft'), ' data-dir="-1"')} ${tool('turnRight', 'worldTurn', t('world.turnRight'), ' data-dir="1"')}
          ${tool('plus', 'worldZoom', t('world.zoomIn'), ' data-factor="0.7"')} ${tool('minus', 'worldZoom', t('world.zoomOut'), ' data-factor="1.43"')}
          ${tool('list', 'worldDetails', t(city ? 'world.details' : 'world.details.country'), '', !!w.details)}
          ${tool('flat', 'worldFlat', t('world.flat'))}
        </div>
      </div>
      <div class="world-foot">
        ${who.length
          ? html`<ul class="world-legend" aria-label="${t('world.legend')}">
              ${who.map(({ co, n }) => html`<li class="${me && co.id === me.id ? 'mine' : ''}">${coName(co)}<b>${n}</b></li>`)}
            </ul>`
          : ''}
        <p class="world-hint">${hint}</p>
      </div>
      ${w.info ? infoCard(app, w.info) : ''}
    </div>
    ${w.details
      ? html`<aside class="world-details" data-key="world-details">
          <div class="world-details-head">
            <h3>${city ? city.name : t('map.title')}</h3>
            <button type="button" class="icon-btn" data-act="worldDetails" aria-label="${t('close')}">${icon('close')}</button>
          </div>
          <div class="world-details-body">
            ${city ? cityFacts(app, city) : html`<ul class="legend">${game.companies().map((co) => html`<li>${coName(co)}</li>`)}</ul>${cityTable(app)}`}
          </div>
        </aside>`
      : ''}
  </div>`;
}

/** One line about what the pointer is over in the 3D view (see ui3d/world.js). */
export function describePick(app, target) {
  const { game, me, content } = app;
  if (target.kind === 'city') {
    const city = game.state.cities[target.id];
    return city ? `${city.name} · ${num(city.pop)}` : null;
  }
  if (target.kind === 'lot') {
    const district = content.districts.find(target.district);
    return me ? t('world.pick.lot', { district: L(district?.name) ?? target.district }) : null;
  }
  if (target.kind === 'building') {
    const b = game.state.buildings[target.id];
    if (!b) return null;
    const type = content.buildingTypes.find(b.type);
    const owner = game.state.companies[b.co];
    const name = me && b.co === me.id ? buildingTitle(game, b) : `${L(type?.name) ?? b.type} · ${owner?.name ?? ''}`;
    return game.isReady(b) ? name : `${name} · ${t('building.construction')}`;
  }
  return null;
}

export const mapView = {
  id: 'map',
  order: 20,
  icon: 'map',
  label: 'nav.map',
  primary: true,
  /** In 3D the view fills the whole main area instead of scrolling in it. */
  fill: solid,
  render(app) {
    const { game } = app;
    const city = app.ui.arg ? game.state.cities[app.ui.arg] : null;
    if (solid(app)) return worldView(app, city);
    if (city) return cityPage(app, city);
    return html`<div class="view">
      ${heading(t('map.title'), solidButton(app))}
      <p class="lead">${t('map.lead')}</p>
      <div class="map-box">${countryMap(app)}</div>
      <ul class="legend">
        ${game.companies().map((co) => html`<li>${coName(co)}</li>`)}
      </ul>
      ${cityTable(app)}
    </div>`;
  },
};

// ---------------------------------------------------------------------------
// Build dialog
// ---------------------------------------------------------------------------

export function buildDialog(app, { city: cityId, district: districtId, lot = null }) {
  const { game, me, content } = app;
  const city = game.state.cities[cityId];
  const district = content.districts.get(districtId);
  const types = content.buildingTypes.filter((type) => type.districts.includes(districtId));
  return html`<div class="modal-head">
      <h2>${t('build.title', { city: city.name, district: L(district.name) })}</h2>
      <button type="button" class="icon-btn" data-act="closeModal" aria-label="${t('close')}">${icon('close')}</button>
    </div>
    <div class="modal-body">
      <p class="muted">
        ${t('build.cash', { cash: money(me.cash) })} · ${lot == null ? t('city.plots.free', { n: freePlots(game, city, districtId) }) : t('build.lot', { n: lot + 1 })}
      </p>
      <ul class="options">
        ${types.map((type) => {
          const cost = buildCost(game, type, city, districtId);
          const possible = type.kind !== 'producer' || cityHasResourceFor(game, type, city);
          const check = game.can(me.id, 'build', { type: type.id, city: cityId, district: districtId, lot });
          const recipes = type.kind === 'producer' ? content.recipes.filter((r) => r.building === type.id && (!r.raw || city.res[r.output] != null)) : [];
          const rawOnly = type.kind === 'producer' && content.recipes.filter((r) => r.building === type.id).every((r) => r.raw);
          return html`<li class="option ${check.ok ? '' : 'option-off'}">
            <div class="option-icon">${emoji(type.icon)}</div>
            <div class="option-main">
              <b>${L(type.name)}</b>
              <p>${L(type.desc)}</p>
              <p class="muted small">
                ${type.kind === 'retail' ? t('build.slots', { n: type.slots }) : type.kind === 'producer' ? t('build.lines', { n: type.lines }) : t('build.labs', { n: type.labs })}
                · ${tn('n.days', type.buildDays ?? 30)} · ${t('build.upkeep', { cost: money(type.upkeep * wageIndex(game, city) * district.upkeep) })}
              </p>
              ${rawOnly
                ? html`<p class="small">
                    ${possible
                      ? html`${t('build.here')}: ${recipes.map((r) => html`<span class="chip">${emoji(content.products.get(r.output).icon)}<span>${city.res[r.output]}</span></span>`)}`
                      : html`<span class="bad">${t('err.noResource')}</span>`}
                  </p>`
                : ''}
            </div>
            <div class="option-side">
              <b>${money(cost)}</b>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                data-act="buildHere"
                data-type="${type.id}"
                data-city="${cityId}"
                data-district="${districtId}"
                data-lot="${lot ?? ''}"${flag('disabled', !check.ok)}
              >
                ${t('build.go')}
              </button>
              ${!check.ok && possible ? html`<span class="bad small">${t(check.error, { need: money(check.params?.need ?? 0) })}</span>` : ''}
            </div>
          </li>`;
        })}
      </ul>
    </div>`;
}

export const mapActions = {
  openCity(app, d) {
    app.go('map', d.city);
  },
  openBuild(app, d) {
    app.modal('build', { city: d.city, district: d.district, wide: true });
  },
  buildHere(app, d) {
    const lot = d.lot === '' || d.lot == null ? null : Number(d.lot);
    const result = app.cmd('build', { type: d.type, city: d.city, district: d.district, lot });
    if (result.ok) {
      app.ui.modal = null;
      app.openBuilding(result.building);
    }
  },
  /** A free plot picked on the flat plan of a city. */
  openLot(app, d) {
    if (app.me) app.modal('build', { city: app.ui.arg, district: d.district, lot: Number(d.lot), wide: true });
  },
  openLotBuilding(app, d) {
    app.openBuilding(d.id);
  },
  worldLots(app) {
    app.ui.world.lots = !app.ui.world.lots;
    app.prefs.mapLots = app.ui.world.lots; // remembered: free plots stay lit (or not) in every game
    savePrefs(app.prefs);
  },
  worldTurn(app, d) {
    app.world3d?.rotate(Number(d.dir));
  },
  worldZoom(app, d) {
    app.world3d?.zoom(Number(d.factor));
  },
  worldDetails(app) {
    const w = app.ui.world;
    w.details = !w.details;
    if (w.details) w.info = null; // the drawer says more than the card, and on a phone there is room for one
    else app.focusAfterRender('.world-tools [data-act=worldDetails]'); // its close button is gone
  },
  worldInfoClose(app) {
    app.ui.world.info = null;
    app.focusAfterRender('.world-gl');
  },
  worldFlat(app) {
    app.prefs.map3d = false;
    savePrefs(app.prefs);
  },
  worldSolid(app) {
    app.prefs.map3d = true;
    savePrefs(app.prefs);
  },
  openProduct(app, d) {
    app.go('market', d.product);
  },
};

// The 3D view is a big module with its own library, so it is fetched only
// when the map is first opened. If it cannot start (no WebGL), the flat map
// takes over for the rest of the session.
registerWidget('world3d', (element, app) => {
  let world = null;
  let gone = false;
  element.classList.add('loading');
  element.dataset.loading = t('world.loading');
  app.describePick = (target) => describePick(app, target);
  import('../../ui3d/world.js')
    .then(({ attachWorld }) => {
      if (gone) return;
      world = attachWorld(element, app);
      world.stage.canvas.setAttribute('role', 'application');
      world.stage.canvas.setAttribute('aria-label', t('world.canvas'));
      element.classList.remove('loading');
    })
    .catch((error) => {
      console.warn('The 3D view could not start:', error);
      world?.detach();
      world = null;
      app.no3d = true;
      app.toast(t('world.unavailable'), 'warn');
    });
  // Whatever goes wrong in the 3D world (a mod's model, a lost graphics
  // context) must not end the game: the flat map takes over.
  const giveUp = (error) => {
    console.warn('The 3D view could not carry on:', error);
    world?.detach();
    world = null;
    app.no3d = true;
    app.toast(t('world.unavailable'), 'warn');
  };
  return {
    update(current) {
      if (!world) return;
      try {
        world.update(current);
        const label = t('world.canvas');
        if (world.stage.canvas.getAttribute('aria-label') !== label) world.stage.canvas.setAttribute('aria-label', label);
      } catch (error) {
        giveUp(error);
      }
    },
    destroy() {
      gone = true;
      world?.detach();
    },
  };
});

export { usedPlots };
