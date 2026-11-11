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

function cityPage(app, city) {
  const { game, content } = app;
  const arch = content.cityArchetypes.find(city.arch);
  return html`<div class="view">
    <div class="crumbs">
      <button type="button" class="btn btn-ghost btn-sm" data-act="go" data-view="map">${icon('back', 16)}<span>${t('nav.map')}</span></button>
    </div>
    ${heading(city.name, html`${pill(L(arch?.name))} ${city.port ? pill(`⚓ ${t('city.port')}`, 'info') : ''}`)}
    <div class="stat-row">
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
    ${cityMarket(app, city)}
  </div>`;
}

export const mapView = {
  id: 'map',
  order: 20,
  icon: 'map',
  label: 'nav.map',
  primary: true,
  render(app) {
    const { game } = app;
    const city = app.ui.arg ? game.state.cities[app.ui.arg] : null;
    if (city) return cityPage(app, city);
    return html`<div class="view">
      ${heading(t('map.title'))}
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

export function buildDialog(app, { city: cityId, district: districtId }) {
  const { game, me, content } = app;
  const city = game.state.cities[cityId];
  const district = content.districts.get(districtId);
  const types = content.buildingTypes.filter((type) => type.districts.includes(districtId));
  return html`<div class="modal-head">
      <h2>${t('build.title', { city: city.name, district: L(district.name) })}</h2>
      <button type="button" class="icon-btn" data-act="closeModal" aria-label="${t('close')}">${icon('close')}</button>
    </div>
    <div class="modal-body">
      <p class="muted">${t('build.cash', { cash: money(me.cash) })} · ${t('city.plots.free', { n: freePlots(game, city, districtId) })}</p>
      <ul class="options">
        ${types.map((type) => {
          const cost = buildCost(game, type, city, districtId);
          const possible = type.kind !== 'producer' || cityHasResourceFor(game, type, city);
          const check = game.can(me.id, 'build', { type: type.id, city: cityId, district: districtId });
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
              <button type="button" class="btn btn-primary btn-sm" data-act="buildHere" data-type="${type.id}" data-city="${cityId}" data-district="${districtId}"${flag('disabled', !check.ok)}>
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
    const result = app.cmd('build', { type: d.type, city: d.city, district: d.district });
    if (result.ok) {
      app.ui.modal = null;
      app.openBuilding(result.building);
    }
  },
  openProduct(app, d) {
    app.go('market', d.product);
  },
};

export { usedPlots };
