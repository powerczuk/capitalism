// Overview: the player's desk — goal, key figures, what needs attention.

import { html } from '../dom.js';
import { L, t, tn } from '../i18n.js';
import { dateStr, money, pct } from '../format.js';
import { icon } from '../icons.js';
import { meter } from '../charts.js';
import { chartCard, historySeries } from '../chartCard.js';
import { buildingTitle, button, coName, emptyState, heading, pill, stat, toneOf } from '../components.js';
import { newsText, newsTone } from '../news.js';
import { diagnose } from '../../sim/diagnostics.js';
import { goalStatus } from '../../sim/goals.js';
import { buildingCounts, retailShare } from '../../sim/stats.js';
import { DAYS_PER_YEAR } from '../../engine/calendar.js';

const LEVEL_ICON = { bad: 'warn', warn: 'warn', info: 'info' };

/** Sentence for one diagnostic item. */
export function diagText(game, d) {
  const { content, state } = game;
  const b = d.building ? state.buildings[d.building] : null;
  return t(`diag.${d.code}`, {
    building: b ? buildingTitle(game, b) : '',
    product: d.product ? L(content.products.get(d.product).name) : '',
    input: d.input ? L(content.products.get(d.input).name) : '',
    n: d.n,
    company: d.company,
    pct: d.pct,
    days: d.days,
  });
}

function goalCard(app) {
  const { game } = app;
  const status = goalStatus(game);
  if (!status || status.goal.id === 'sandbox') return '';
  const { goal } = status;
  const years = goal.years;
  const left = years ? Math.max(0, Math.ceil((years * DAYS_PER_YEAR - game.state.day) / 30)) : null;
  return html`<section class="card goal-card">
    <div class="card-head">
      <h3>${icon('target', 18)} ${L(goal.name)}</h3>
      ${left != null ? pill(tn('n.monthsLeft', left), left < 12 ? 'warn' : '') : ''}
    </div>
    <p class="card-note">${L(goal.desc)}</p>
    <div class="goal-bar">${meter(status.progress, { tone: 'accent', label: pct(status.progress) })}<b>${pct(status.progress)}</b></div>
  </section>`;
}

function firstSteps(app) {
  const { game, me } = app;
  const mine = game.buildingsOf(me.id);
  if (mine.length > 3 || game.state.day > 540) return '';
  const hasStore = mine.some((b) => b.kind === 'retail');
  const hasShelf = mine.some((b) => b.slots?.some(Boolean));
  const running = game.state.day > 5;
  const hasPlant = mine.some((b) => b.kind === 'producer');
  const steps = [
    { done: hasStore, text: t('steps.store'), act: button(t('nav.map'), 'go', { view: 'map' }, { small: true }) },
    { done: hasShelf, text: t('steps.shelves') },
    { done: running, text: t('steps.time') },
    { done: hasPlant, text: t('steps.plant') },
  ];
  return html`<section class="card steps-card">
    <div class="card-head"><h3>${t('steps.title')}</h3></div>
    <ol class="steps">
      ${steps.map(
        (s) => html`<li class="${s.done ? 'done' : ''}">
          <span class="step-mark">${s.done ? icon('check', 16) : ''}</span><span>${s.text}</span>${!s.done && s.act ? s.act : ''}
        </li>`,
      )}
    </ol>
    <p class="card-note">${t('steps.more')} ${button(t('nav.guide'), 'go', { view: 'guide' }, { small: true, variant: 'ghost' })}</p>
  </section>`;
}

function alerts(app) {
  const { game, me } = app;
  const list = diagnose(game, me);
  const shown = list.slice(0, 14);
  return html`<section class="card">
    <div class="card-head">
      <h3>${t('alerts.title')}</h3>
      ${list.length ? pill(String(list.length), list.some((d) => d.level === 'bad') ? 'bad' : 'warn') : ''}
    </div>
    ${shown.length === 0
      ? emptyState(t('alerts.none'))
      : html`<ul class="alerts">
          ${shown.map(
            (d) => html`<li class="alert alert-${d.level}">
              <span class="alert-icon">${icon(LEVEL_ICON[d.level], 18)}</span>
              <span class="alert-text">${diagText(game, d)}</span>
              ${d.building ? button(t('show'), 'openBuilding', { id: d.building }, { small: true }) : ''}
              ${d.code === 'noBuildings' ? button(t('nav.map'), 'go', { view: 'map' }, { small: true }) : ''}
              ${d.code === 'raider' || d.code === 'cashNegative' || d.code === 'distress' ? button(t(d.code === 'raider' ? 'nav.stocks' : 'nav.finance'), 'go', { view: d.code === 'raider' ? 'stocks' : 'finance' }, { small: true }) : ''}
            </li>`,
          )}
        </ul>
        ${list.length > shown.length ? html`<p class="card-note">${t('alerts.more', { n: list.length - shown.length })}</p>` : ''}`}
  </section>`;
}

function spectator(app) {
  const { game } = app;
  const companies = game.companies();
  const { labels, series } = historySeries(game, companies, 'equity');
  return html`<div class="view">
    ${heading(t('nav.overview'))}
    <p class="lead">${t('spectator.lead')}</p>
    ${chartCard(app, { id: 'worth', title: t('chart.worth'), series, labels, fmt: money })}
  </div>`;
}

export const overviewView = {
  id: 'overview',
  order: 10,
  icon: 'overview',
  label: 'nav.overview',
  primary: true,
  render(app) {
    const { game, me } = app;
    if (!me) return spectator(app);
    const last = me.reports.at(-1);
    const counts = buildingCounts(game, me.id);
    const share = retailShare(game, me.id);
    const companies = game.companies();
    const { labels, series } = historySeries(game, companies, 'equity');
    const news = game.state.news.slice(-6).reverse();
    return html`<div class="view">
      ${heading(t('nav.overview'), coName(me))}
      <div class="grid-2">
        <div class="stack">
          <div class="stat-row">
            ${stat({ label: t('stat.revenue'), value: last ? money(last.retail + last.b2b) : '–', sub: t('stat.lastMonth') })}
            ${stat({ label: t('stat.profit'), value: last ? money(last.profit) : '–', tone: last ? toneOf(last.profit) : '', sub: t('stat.lastMonth') })}
            ${stat({ label: t('stat.stores'), value: counts.retail, sub: t('stat.plants', { n: counts.producer + counts.research }) })}
            ${stat({ label: t('stat.share'), value: pct(share, 1), sub: t('stat.share.sub') })}
          </div>
          ${goalCard(app)} ${firstSteps(app)} ${alerts(app)}
        </div>
        <div class="stack">
          ${chartCard(app, { id: 'worth', title: t('chart.worth'), series, labels, fmt: money })}
          <section class="card">
            <div class="card-head">
              <h3>${t('nav.news')}</h3>
              ${button(t('all'), 'go', { view: 'news' }, { small: true, variant: 'ghost' })}
            </div>
            ${news.length === 0
              ? emptyState(t('news.none'))
              : html`<ul class="news-list compact">
                  ${news.map(
                    (n) => html`<li class="news-item news-${newsTone(n)}">
                      <time>${dateStr(n.d)}</time><span>${newsText(game, n)}</span>
                    </li>`,
                  )}
                </ul>`}
          </section>
        </div>
      </div>
    </div>`;
  },
};
