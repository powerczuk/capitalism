// Title screen and the "found a company" form.

import { flag, html, raw } from '../dom.js';
import { L, LOCALES, getLocale, t } from '../i18n.js';
import { dateStr, money } from '../format.js';
import { icon } from '../icons.js';
import { seriesColor } from '../charts.js';
import * as storage from '../storage.js';
import { MAX_COMPANIES } from '../../sim/company.js';

const CAPITAL = [
  { id: 'rich', cash: 35_000_000 },
  { id: 'standard', cash: 20_000_000 },
  { id: 'tight', cash: 12_000_000 },
];

function defaultDraft(app) {
  const levels = app.content.difficulties.ids();
  return {
    name: '',
    color: 0,
    capital: 'standard',
    cities: 4,
    goal: 'worth50',
    rivals: [
      { level: levels[0], persona: 'random' },
      { level: levels[1] ?? levels[0], persona: 'random' },
      { level: levels[2] ?? levels[0], persona: 'random' },
    ],
    events: true,
    takeovers: true,
    spectate: false,
    seed: '',
    open: false,
  };
}

function draftOf(app) {
  return (app.ui.draft ??= defaultDraft(app));
}

function option(value, label, selected) {
  return html`<option value="${value}"${flag('selected', selected)}>${label}</option>`;
}

function rivalRow(app, rival, index) {
  const { content } = app;
  const level = content.difficulties.find(rival.level);
  return html`<li class="rival-row" data-key="rival-${index}">
    <span class="rival-dot" style="background:${raw(seriesColor(index + 1 + (draftOf(app).color === index + 1 ? 1 : 0)))}"></span>
    <label class="field">
      <span class="field-label">${t('start.rival.level')}</span>
      <select id="rival-level-${index}" data-change="draftRival" data-index="${index}" data-field="level">
        ${content.difficulties.all().map((d) => option(d.id, L(d.name), d.id === rival.level))}
      </select>
    </label>
    <label class="field">
      <span class="field-label">${t('start.rival.persona')}</span>
      <select id="rival-persona-${index}" data-change="draftRival" data-index="${index}" data-field="persona">
        ${option('random', t('start.rival.random'), rival.persona === 'random')}
        ${content.personalities.all().map((p) => option(p.id, `${p.icon} ${L(p.name)}`, p.id === rival.persona))}
      </select>
    </label>
    <button type="button" class="icon-btn" data-act="draftRemoveRival" data-index="${index}" title="${t('start.rival.remove')}">${icon('close', 16)}</button>
    <p class="rival-desc">${level ? L(level.desc) : ''}</p>
  </li>`;
}

function newGameForm(app) {
  const { content } = app;
  const d = draftOf(app);
  const goal = content.goals.find(d.goal);
  const maxRivals = MAX_COMPANIES - 1;
  return html`<form class="charter" data-submit="draftStart" id="new-game">
    <div class="charter-head">
      <span class="charter-eyebrow">${t('start.charter.eyebrow')}</span>
      <h2>${t('start.charter.title')}</h2>
    </div>

    <label class="field">
      <span class="field-label">${t('start.name')}</span>
      <input id="company-name" type="text" maxlength="32" autocomplete="off" placeholder="${t('start.name.placeholder')}" value="${d.name}" data-input="draftField" data-field="name" />
    </label>

    <div class="field">
      <span class="field-label">${t('start.color')}</span>
      <div class="swatches" role="radiogroup" aria-label="${t('start.color')}">
        ${Array.from({ length: 8 }, (_, i) =>
          html`<button
            type="button"
            role="radio"
            aria-checked="${d.color === i ? 'true' : 'false'}"
            class="swatch ${d.color === i ? 'on' : ''}"
            style="background:${raw(seriesColor(i))}"
            data-act="draftColor"
            data-color="${i}"
            title="${t('start.color')} ${i + 1}"
          ></button>`,
        )}
      </div>
    </div>

    <div class="field-row">
      <label class="field">
        <span class="field-label">${t('start.capital')}</span>
        <select id="start-capital" data-change="draftField" data-field="capital">
          ${CAPITAL.map((c) => option(c.id, `${t(`start.capital.${c.id}`)} · ${money(c.cash)}`, d.capital === c.id))}
        </select>
      </label>
      <label class="field">
        <span class="field-label">${t('start.cities')}</span>
        <select id="start-cities" data-change="draftField" data-field="cities">
          ${[3, 4, 5, 6].map((n) => option(n, t(`start.cities.${n}`), d.cities === n))}
        </select>
      </label>
    </div>

    <label class="field">
      <span class="field-label">${t('start.goal')}</span>
      <select id="start-goal" data-change="draftField" data-field="goal">
        ${content.goals.all().map((g) => option(g.id, L(g.name), g.id === d.goal))}
      </select>
      <span class="field-hint">${goal ? L(goal.desc) : ''}</span>
    </label>

    <div class="field">
      <span class="field-label">${t('start.rivals')} <span class="muted">(${d.rivals.length}/${maxRivals})</span></span>
      <ul class="rival-list">
        ${d.rivals.map((r, i) => rivalRow(app, r, i))}
      </ul>
      ${d.rivals.length === 0 ? html`<p class="field-hint">${t('start.rivals.none')}</p>` : ''}
      <div>
        <button type="button" class="btn btn-sm" data-act="draftAddRival"${flag('disabled', d.rivals.length >= maxRivals)}>
          ${icon('plus', 16)}<span>${t('start.rivals.add')}</span>
        </button>
      </div>
    </div>

    <div class="field-row checks">
      <label class="check">
        <input id="opt-events" type="checkbox" data-change="draftCheck" data-field="events"${flag('checked', d.events)} />
        <span>${t('start.events')}</span>
      </label>
      <label class="check">
        <input id="opt-takeovers" type="checkbox" data-change="draftCheck" data-field="takeovers"${flag('checked', d.takeovers)} />
        <span>${t('start.takeovers')}</span>
      </label>
      <label class="check" title="${t('start.spectate.hint')}">
        <input id="opt-spectate" type="checkbox" data-change="draftCheck" data-field="spectate"${flag('checked', d.spectate)} />
        <span>${t('start.spectate')}</span>
      </label>
    </div>

    <label class="field">
      <span class="field-label">${t('start.seed')}</span>
      <input id="start-seed" type="text" maxlength="24" autocomplete="off" placeholder="${t('start.seed.placeholder')}" value="${d.seed}" data-input="draftField" data-field="seed" />
      <span class="field-hint">${t('start.seed.hint')}</span>
    </label>

    <div class="charter-foot">
      <button type="button" class="btn btn-ghost" data-act="draftClose">${t('cancel')}</button>
      <button type="submit" class="btn btn-primary">${t(d.spectate ? 'start.go.spectate' : 'start.go')}</button>
    </div>
  </form>`;
}

export function renderStart(app) {
  const d = draftOf(app);
  const auto = storage.savedInfo('auto');
  const manual = storage.savedInfo('manual');
  const modal = app.ui.modal?.type === 'import' ? importDialog(app) : null;
  return html`<div class="start">
    <div class="start-inner">
      <header class="start-hero">
        <div class="start-mark" aria-hidden="true">
          <svg viewBox="0 0 120 60" width="120" height="60">
            <path d="M4 52 L30 34 L48 42 L76 16 L92 26 L116 6" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M98 6 H116 V24" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <h1 class="start-title"><span>Wielka</span> <span>Hossa</span></h1>
        <p class="start-tagline">${t('start.tagline')}</p>
      </header>

      ${d.open
        ? newGameForm(app)
        : html`<div class="start-actions">
              <button type="button" class="btn btn-primary btn-lg" data-act="draftOpen">${t('start.new')}</button>
              ${auto
                ? html`<button type="button" class="btn btn-lg" data-act="loadSlot" data-slot="auto">
                    <span>${t('start.continue')}</span>
                    <small>${auto.company} · ${dateStr(Math.max(1, auto.day))}</small>
                  </button>`
                : ''}
              ${manual
                ? html`<button type="button" class="btn btn-lg" data-act="loadSlot" data-slot="manual">
                    <span>${t('start.loadManual')}</span>
                    <small>${manual.company} · ${dateStr(Math.max(1, manual.day))}</small>
                  </button>`
                : ''}
              <button type="button" class="btn btn-ghost" data-act="openImport">${t('menu.import')}</button>
            </div>
            <ul class="start-points">
              <li><b>${t('start.point1.title')}</b><span>${t('start.point1.text')}</span></li>
              <li><b>${t('start.point2.title')}</b><span>${t('start.point2.text')}</span></li>
              <li><b>${t('start.point3.title')}</b><span>${t('start.point3.text')}</span></li>
            </ul>`}

      <footer class="start-foot">
        <div class="seg" role="group" aria-label="${t('menu.language')}">
          ${LOCALES.map(
            (l) => html`<button type="button" class="seg-btn ${getLocale() === l.id ? 'on' : ''}" data-act="setLocale" data-locale="${l.id}">${l.name}</button>`,
          )}
        </div>
        <div class="seg" role="group" aria-label="${t('menu.theme')}">
          ${['system', 'light', 'dark'].map(
            (th) =>
              html`<button type="button" class="seg-btn ${(app.prefs.theme || 'system') === th ? 'on' : ''}" data-act="setTheme" data-theme="${th}">
                ${t(`menu.theme.${th}`)}
              </button>`,
          )}
        </div>
      </footer>
    </div>
    ${modal ? html`<div class="modal-layer" data-key="modal" data-act="modalBackdrop"><div class="modal" role="dialog" aria-modal="true">${modal}</div></div>` : ''}
    ${app.renderToasts()}
  </div>`;
}

export function importDialog(app) {
  return html`<div class="modal-head">
      <h2>${t('menu.import')}</h2>
      <button type="button" class="icon-btn" data-act="closeModal" aria-label="${t('close')}">${icon('close')}</button>
    </div>
    <div class="modal-body">
      <p class="muted">${t('menu.import.hint')}</p>
      <textarea id="import-text" class="code-area" rows="8" spellcheck="false" placeholder="${t('menu.import.placeholder')}"></textarea>
      <label class="btn btn-sm file-btn">
        <span>${t('menu.import.file')}</span>
        <input id="import-file" type="file" accept=".json,application/json,text/plain" data-change="importFile" hidden />
      </label>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-act="closeModal">${t('cancel')}</button>
      <button type="button" class="btn btn-primary" data-act="importApply">${t('menu.import.apply')}</button>
    </div>`;
}

export const startActions = {
  draftOpen(app) {
    draftOf(app).open = true;
  },
  draftClose(app) {
    draftOf(app).open = false;
  },
  draftField(app, d, el) {
    const draft = draftOf(app);
    const value = el.value;
    draft[d.field] = d.field === 'cities' ? Number(value) : value;
  },
  draftCheck(app, d, el) {
    draftOf(app)[d.field] = el.checked;
  },
  draftColor(app, d) {
    draftOf(app).color = Number(d.color);
  },
  draftRival(app, d, el) {
    draftOf(app).rivals[Number(d.index)][d.field] = el.value;
  },
  draftAddRival(app) {
    const draft = draftOf(app);
    const levels = app.content.difficulties.ids();
    if (draft.rivals.length < MAX_COMPANIES - 1) {
      draft.rivals.push({ level: levels[Math.min(1, levels.length - 1)], persona: 'random' });
    }
  },
  draftRemoveRival(app, d) {
    draftOf(app).rivals.splice(Number(d.index), 1);
  },
  draftStart(app) {
    const draft = draftOf(app);
    if (draft.spectate && draft.rivals.length === 0) {
      app.toast(t('start.spectate.empty'), 'bad');
      return;
    }
    const capital = CAPITAL.find((c) => c.id === draft.capital) ?? CAPITAL[1];
    app.startGame({
      seed: draft.seed.trim() || undefined,
      cityCount: draft.cities,
      startCash: capital.cash,
      goal: draft.goal,
      events: draft.events,
      takeovers: draft.takeovers,
      player: draft.spectate ? null : { name: draft.name.trim() || t('start.name.default'), color: draft.color },
      rivals: draft.rivals.map((r) => ({ level: r.level, persona: r.persona })),
    });
  },
  loadSlot(app, d) {
    const data = storage.loadSaved(d.slot);
    if (data) app.loadGame(data);
    else app.toast(t('err.saveInvalid'), 'bad');
  },
  openImport(app) {
    app.modal('import');
  },
  importFile(app, d, el) {
    const file = el.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const area = app.root.querySelector('#import-text');
      if (area) area.value = String(reader.result || '');
    };
    reader.readAsText(file);
  },
  importApply(app) {
    const text = app.root.querySelector('#import-text')?.value || '';
    try {
      const data = storage.parseImport(text);
      if (app.loadGame(data)) app.ui.modal = null;
    } catch {
      app.toast(t('err.saveInvalid'), 'bad');
    }
  },
};
