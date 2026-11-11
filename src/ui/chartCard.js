// A titled card around a line chart with its legend and a chart/table switch.

import { html } from './dom.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { legend, lineChart, seriesColor, seriesTable } from './charts.js';
import { monthTick } from './format.js';

/**
 * @param {object} app
 * @param {{id:string, title:string, series:Array, labels:string[], fmt:Function, zero?:boolean, area?:boolean, h?:number, note?:string}} o
 */
export function chartCard(app, { id, title, series, labels, fmt, zero = false, area = false, h = 210, note = '' }) {
  const asTable = !!app.ui.tables[id];
  const enough = labels.length >= 2 && series.some((s) => s.values.some((v) => v != null));
  return html`<section class="card chart-card">
    <div class="card-head">
      <h3>${title}</h3>
      ${enough
        ? html`<button type="button" class="icon-btn" data-act="toggleTable" data-id="${id}" title="${t(asTable ? 'chart.showChart' : 'chart.showTable')}">
            ${icon(asTable ? 'chart' : 'table', 18)}
          </button>`
        : ''}
    </div>
    ${note ? html`<p class="card-note">${note}</p>` : ''}
    ${!enough
      ? html`<div class="empty">${t('chart.noData')}</div>`
      : html`${series.length > 1 ? legend(series) : ''}
        ${asTable
          ? seriesTable(series, labels, fmt)
          : html`<div class="chart-box">${lineChart({ id, series, labels, fmt, w: app.chartW, h, zero, area })}</div>`}`}
  </section>`;
}

/**
 * Monthly history of one report field for a set of companies, aligned on
 * the calendar. Returns `{ labels, series }` ready for `chartCard`.
 */
export function historySeries(game, companies, field, { months = 60 } = {}) {
  const days = new Set();
  for (const co of companies) for (const r of co.reports) days.add(r.d);
  const axis = [...days].sort((a, b) => a - b).slice(-months);
  const labels = axis.map((d) => monthTick(d));
  const series = companies.map((co) => {
    const byDay = new Map(co.reports.map((r) => [r.d, r]));
    return {
      name: co.name,
      color: seriesColor(co.color),
      values: axis.map((d) => {
        const r = byDay.get(d);
        return r ? (typeof field === 'function' ? field(r) : r[field]) : null;
      }),
    };
  });
  return { labels, series };
}
