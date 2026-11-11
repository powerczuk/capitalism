// Small building blocks shared by the views.

import { flag, html, raw } from './dom.js';
import { icon } from './icons.js';
import { L, t } from './i18n.js';
import { money, pct, score } from './format.js';
import { meter, seriesColor } from './charts.js';

/** Identity dot of a company. */
export const dot = (co) => html`<span class="dot" style="background:${raw(seriesColor(co.color))}"></span>`;

/** Company name with its identity dot. */
export const coName = (co) => html`<span class="co">${dot(co)}<span class="co-name">${co.name}</span></span>`;

export const emoji = (glyph) => html`<span class="emoji" aria-hidden="true">${glyph}</span>`;

/** Product with icon. */
export const productName = (product) => html`<span class="pn">${emoji(product.icon)}<span>${L(product.name)}</span></span>`;

/** Display name of a building: custom name or "<type> · <city> #n". */
export function buildingTitle(game, b) {
  if (b.name) return b.name;
  const type = game.content.buildingTypes.get(b.type);
  return `${L(type.name)} ${b.no}`;
}

export function buildingLabel(game, b) {
  const type = game.content.buildingTypes.get(b.type);
  return html`<span class="pn">${emoji(type.icon)}<span>${buildingTitle(game, b)}</span></span>`;
}

/** A small status label. tone: good | bad | warn | info | '' */
export const pill = (text, tone = '') => html`<span class="pill ${tone ? `pill-${tone}` : ''}">${text}</span>`;

/** Signed change with an arrow, so direction is never colour alone. */
export function delta(value, text) {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return html`<span class="delta">${text}</span>`;
  const up = value > 0;
  return html`<span class="delta ${up ? 'good' : 'bad'}"><span aria-hidden="true">${up ? '▲' : '▼'}</span> ${text}</span>`;
}

export const moneyDelta = (value) => delta(value, money(value, { sign: true }));
export const pctDelta = (value, digits = 1) => delta(value, pct(value, digits, { sign: true }));

/** Colour class for a profit/loss figure. */
export const toneOf = (value) => (value > 0.5 ? 'good' : value < -0.5 ? 'bad' : '');

/** Label + value tile. */
export function stat({ label, value, sub = '', tone = '', title = '' }) {
  return html`<div class="stat" title="${title}">
    <div class="stat-label">${label}</div>
    <div class="stat-value ${tone}">${value}</div>
    ${sub ? html`<div class="stat-sub">${sub}</div>` : ''}
  </div>`;
}

/** 0-100 rating as number + bar. */
export function rated(value, { tone = 'accent', label = '' } = {}) {
  return html`<span class="rated"><span class="rated-n">${score(value)}</span>${meter(value / 100, { tone, label: label || score(value) })}</span>`;
}

export const emptyState = (text, action = '') => html`<div class="empty">${text}${action ? html`<div>${action}</div>` : ''}</div>`;

/** A row of tabs; the active one is remembered by the caller. */
export function tabs(items, active, act, extra = {}) {
  const data = Object.entries(extra)
    .map(([k, v]) => ` data-${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join('');
  return html`<div class="tabs" role="tablist">
    ${items.map(
      (item) =>
        html`<button
          type="button"
          role="tab"
          class="tab ${item.id === active ? 'on' : ''}"
          aria-selected="${item.id === active ? 'true' : 'false'}"
          data-act="${act}"
          data-id="${item.id}"${raw(data)}
        >
          ${item.label}
        </button>`,
    )}
  </div>`;
}

/** Button helper. variant: primary | ghost | danger | '' */
export function button(label, act, data = {}, { variant = '', disabled = false, title = '', small = false, ic = null } = {}) {
  const attrs = Object.entries(data)
    .map(([k, v]) => ` data-${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join('');
  return html`<button
    type="button"
    class="btn ${variant ? `btn-${variant}` : ''} ${small ? 'btn-sm' : ''}"
    data-act="${act}"${raw(attrs)}
    title="${title}"${flag('disabled', disabled)}
  >
    ${ic ? icon(ic, small ? 16 : 18) : ''}${label ? html`<span>${label}</span>` : ''}
  </button>`;
}

/** Section heading with optional right-hand side. */
export const heading = (title, aside = '') => html`<div class="section-head"><h2>${title}</h2>${aside ? html`<div class="section-aside">${aside}</div>` : ''}</div>`;

export const yesNo = (on) => (on ? t('yes') : t('no'));
