// Charts drawn as SVG strings (so they go through the same morphing as the
// rest of the page) plus one shared hover layer.
//
// Conventions (see the palette in styles/tokens.css):
//  - series colours are identity colours: a company keeps its colour everywhere
//  - text always uses ink tokens, never the series colour
//  - every chart with two or more series has a legend and a table view

import { esc, html, raw } from './dom.js';

/** What the pointer is over: { id, index } — read when a chart is re-rendered. */
const hover = { id: null, index: -1 };

export const seriesColor = (slot) => `var(--series-${(slot % 8) + 1})`;

function niceStep(span, target) {
  const rough = span / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function scaleFor(values, { zero = false, ticks = 4 } = {}) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 1;
  }
  if (zero || (min > 0 && min < (max - min) * 0.6)) min = Math.min(min, 0);
  if (max === min) max = min + Math.max(1, Math.abs(min) * 0.1);
  const step = niceStep(max - min, ticks);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const marks = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) marks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  return { lo, hi, marks };
}

/**
 * Multi-series line chart.
 * @param {object} o
 * @param {string} o.id unique id (needed for hover)
 * @param {Array<{name:string, color:string, values:Array<number|null>}>} o.series
 * @param {string[]} o.labels one label per x position
 * @param {(v:number)=>string} o.fmt value formatter (axis and tooltip)
 * @param {number} [o.w] drawing width in px
 * @param {number} [o.h] drawing height in px
 * @param {boolean} [o.zero] force the axis to include zero
 * @param {boolean} [o.area] soft fill under a single series
 */
export function lineChart({ id, series, labels, fmt, w = 640, h = 210, zero = false, area = false }) {
  const n = labels.length;
  const all = [];
  for (const s of series) for (const v of s.values) all.push(v);
  const { lo, hi, marks } = scaleFor(all, { zero });
  const tickText = marks.map((m) => fmt(m));
  const left = Math.max(38, 10 + 6.4 * Math.max(...tickText.map((s) => s.length)));
  const right = 14;
  const top = 10;
  const bottom = 24;
  const pw = w - left - right;
  const ph = h - top - bottom;
  const x = (i) => left + (n <= 1 ? pw / 2 : (pw * i) / (n - 1));
  const y = (v) => top + ph - ((v - lo) / (hi - lo)) * ph;

  let grid = '';
  marks.forEach((m, i) => {
    const yy = y(m).toFixed(1);
    const base = m === 0 || i === 0;
    grid += `<line x1="${left}" x2="${w - right}" y1="${yy}" y2="${yy}" class="${base ? 'chart-base' : 'chart-grid'}"/>`;
    grid += `<text x="${left - 8}" y="${yy}" dy="0.32em" text-anchor="end" class="chart-tick">${esc(tickText[i])}</text>`;
  });

  // X labels: first, last and a few evenly spaced in between.
  let xLabels = '';
  if (n > 0) {
    const want = Math.min(n, w < 420 ? 3 : 6);
    const picks = new Set();
    for (let k = 0; k < want; k++) picks.add(Math.round(((n - 1) * k) / Math.max(1, want - 1)));
    for (const i of picks) {
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      xLabels += `<text x="${x(i).toFixed(1)}" y="${h - 6}" text-anchor="${anchor}" class="chart-tick">${esc(labels[i])}</text>`;
    }
  }

  let marksSvg = '';
  for (const s of series) {
    let d = '';
    let pen = false;
    let last = -1;
    s.values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
      last = i;
    });
    if (!d) continue;
    if (area && series.length === 1) {
      const first = s.values.findIndex((v) => v != null && Number.isFinite(v));
      const floor = y(Math.max(lo, Math.min(hi, 0))).toFixed(1);
      marksSvg += `<path d="${d}L${x(last).toFixed(1)} ${floor}L${x(first).toFixed(1)} ${floor}Z" fill="${s.color}" opacity="0.1" stroke="none"/>`;
    }
    marksSvg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    marksSvg += `<circle cx="${x(last).toFixed(1)}" cy="${y(s.values[last]).toFixed(1)}" r="4" fill="${s.color}" class="chart-dot"/>`;
  }

  // Hover: crosshair + ringed dots at the hovered position.
  let hoverSvg = '';
  if (hover.id === id && hover.index >= 0 && hover.index < n) {
    const hx = x(hover.index).toFixed(1);
    hoverSvg += `<line x1="${hx}" x2="${hx}" y1="${top}" y2="${top + ph}" class="chart-cross"/>`;
    for (const s of series) {
      const v = s.values[hover.index];
      if (v == null || !Number.isFinite(v)) continue;
      hoverSvg += `<circle cx="${hx}" cy="${y(v).toFixed(1)}" r="4.5" fill="${s.color}" class="chart-dot"/>`;
    }
  }

  const payload = {
    left,
    right,
    w,
    labels,
    series: series.map((s) => ({ name: s.name, color: s.color, values: s.values.map((v) => (v == null || !Number.isFinite(v) ? null : fmt(v))) })),
  };
  return raw(
    `<svg class="chart" data-chart-id="${esc(id)}" data-chart="${esc(JSON.stringify(payload))}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" tabindex="0">` +
      `${grid}${xLabels}${marksSvg}${hoverSvg}<rect x="${left}" y="${top}" width="${pw}" height="${ph}" fill="transparent" class="chart-hit"/></svg>`,
  );
}

/** Legend: a colour key and a name per series (identity is never colour alone). */
export function legend(series, { line = true } = {}) {
  return html`<ul class="legend">
    ${series.map(
      (s) => html`<li><span class="${line ? 'key key-line' : 'key'}" style="background:${raw(s.color)}"></span>${s.name}</li>`,
    )}
  </ul>`;
}

/** The accessible twin of a chart: the same numbers as a table. */
export function seriesTable(series, labels, fmt, { maxRows = 14 } = {}) {
  const n = labels.length;
  const step = Math.max(1, Math.ceil(n / maxRows));
  const rows = [];
  for (let i = n - 1; i >= 0; i -= step) rows.push(i);
  return html`<div class="table-wrap">
    <table class="data">
      <thead>
        <tr>
          <th></th>
          ${series.map((s) => html`<th class="num"><span class="key" style="background:${raw(s.color)}"></span>${s.name}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          (i) => html`<tr>
            <td>${labels[i]}</td>
            ${series.map((s) => html`<td class="num">${s.values[i] == null ? '–' : fmt(s.values[i])}</td>`)}
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

/** Small trend line for table rows and tiles. */
export function sparkline(values, { w = 84, h = 24, color = 'var(--ink-3)' } = {}) {
  const clean = values.filter((v) => v != null && Number.isFinite(v));
  if (clean.length < 2) return raw(`<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`);
  const min = Math.min(...clean, 0);
  const max = Math.max(...clean, 0);
  const span = max - min || 1;
  const pad = 3;
  const x = (i) => pad + ((w - pad * 2) * i) / (clean.length - 1);
  const y = (v) => pad + (h - pad * 2) * (1 - (v - min) / span);
  const d = clean.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const zero = min < 0 ? `<line x1="${pad}" x2="${w - pad}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="chart-grid"/>` : '';
  return raw(
    `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${zero}` +
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<circle cx="${x(clean.length - 1).toFixed(1)}" cy="${y(clean.at(-1)).toFixed(1)}" r="2.6" fill="var(--accent)"/></svg>`,
  );
}

/**
 * One whole split into parts — a thin segmented bar. The figures live in the
 * text beside it; each part still explains itself on hover.
 * @param {Array<{label:string, value:number, color:string, text?:string}>} parts
 */
export function shareBar(parts, { tall = false } = {}) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (total <= 0) return html`<div class="sharebar ${tall ? 'tall' : ''} empty"></div>`;
  return html`<div class="sharebar ${tall ? 'tall' : ''}" role="img">
    ${parts
      .filter((p) => p.value > 0)
      .map(
        (p) =>
          html`<span
            style="flex:${raw(Math.max(p.value / total, 0.004).toFixed(4))};background:${raw(p.color)}"
            title="${p.label}: ${p.text ?? `${Math.round((100 * p.value) / total)}%`}"
          ></span>`,
      )}
  </div>`;
}

/** A ratio against its limit. `tone` picks the fill: accent, good, warn or bad. */
export function meter(fraction, { tone = 'accent', label = '' } = {}) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return html`<span class="meter meter-${tone}" role="img" aria-label="${label}" title="${label}"
    ><span style="width:${raw((f * 100).toFixed(1))}%"></span
  ></span>`;
}

// ---------------------------------------------------------------------------
// Hover layer (one tooltip for every line chart on the page)
// ---------------------------------------------------------------------------

let tip = null;
let onChange = () => {};

function ensureTip() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  return tip;
}

function fillTip(svg, index) {
  const data = JSON.parse(svg.getAttribute('data-chart'));
  const el = ensureTip();
  el.textContent = '';
  const title = document.createElement('div');
  title.className = 'chart-tip-title';
  title.textContent = data.labels[index] ?? '';
  el.appendChild(title);
  for (const s of data.series) {
    if (s.values[index] == null) continue;
    const row = document.createElement('div');
    row.className = 'chart-tip-row';
    const key = document.createElement('span');
    key.className = 'key key-line';
    key.style.background = s.color;
    const value = document.createElement('strong');
    value.textContent = s.values[index];
    const name = document.createElement('span');
    name.textContent = s.name;
    row.append(key, value, name);
    el.appendChild(row);
  }
  return data;
}

function indexAt(svg, clientX) {
  const data = JSON.parse(svg.getAttribute('data-chart'));
  const box = svg.getBoundingClientRect();
  const scale = box.width / data.w;
  const px = (clientX - box.left) / scale;
  const n = data.labels.length;
  if (n <= 1) return 0;
  const f = (px - data.left) / (data.w - data.left - data.right);
  return Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))));
}

function show(svg, index, clientX, clientY) {
  const id = svg.getAttribute('data-chart-id');
  const changed = hover.id !== id || hover.index !== index;
  hover.id = id;
  hover.index = index;
  fillTip(svg, index);
  const el = ensureTip();
  el.hidden = false;
  const pad = 14;
  const rect = el.getBoundingClientRect();
  let x = clientX + pad;
  if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - pad;
  let y = clientY - rect.height - pad;
  if (y < 8) y = clientY + pad;
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${Math.max(8, y)}px`;
  if (changed) onChange();
}

function hide() {
  if (hover.id == null) return;
  hover.id = null;
  hover.index = -1;
  if (tip) tip.hidden = true;
  onChange();
}

/**
 * Wire the hover layer to a root element.
 * @param {HTMLElement} root
 * @param {() => void} rerender called when the hovered position changes
 */
export function attachChartHover(root, rerender) {
  onChange = rerender;
  root.addEventListener('pointermove', (e) => {
    const svg = e.target.closest?.('svg.chart');
    if (!svg) return hide();
    show(svg, indexAt(svg, e.clientX), e.clientX, e.clientY);
  });
  root.addEventListener('pointerleave', hide);
  root.addEventListener('keydown', (e) => {
    const svg = e.target.closest?.('svg.chart');
    if (!svg || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const data = JSON.parse(svg.getAttribute('data-chart'));
    const id = svg.getAttribute('data-chart-id');
    const current = hover.id === id ? hover.index : data.labels.length - 1;
    const next = Math.max(0, Math.min(data.labels.length - 1, current + (e.key === 'ArrowLeft' ? -1 : 1)));
    const box = svg.getBoundingClientRect();
    show(svg, next, box.left + box.width / 2, box.top + 20);
    e.preventDefault();
  });
  root.addEventListener('focusout', (e) => {
    if (e.target.closest?.('svg.chart')) hide();
  });
}

/** After a re-render the tooltip text may be stale (the game keeps running). */
export function refreshChartHover(root) {
  if (hover.id == null) return;
  const svg = root.querySelector(`svg.chart[data-chart-id="${CSS.escape(hover.id)}"]`);
  if (!svg) return hide();
  fillTip(svg, hover.index);
}
