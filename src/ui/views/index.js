// Registry of the interface: views (main area), panels (side drawer),
// dialogs and the action handlers that buttons refer to with `data-act`.
//
// To add a screen from a mod, register it in `content.views`:
//   content.views.register({ id, order, icon, label, render(app) { return html`…`; } })
// and add its handlers with `registerActions({...})`.

import { html } from '../dom.js';
import { LOCALES, getLocale, t } from '../i18n.js';
import { dateStr, money } from '../format.js';
import { icon } from '../icons.js';
import { coName } from '../components.js';
import * as storage from '../storage.js';
import { equityOf } from '../../sim/accounting.js';
import { overviewView } from './overview.js';
import { buildDialog, mapActions, mapView } from './map.js';
import { buildingActions, buildingPanel, companyView } from './buildings.js';
import { pickerActions, productDialog, recipeDialog, sourceDialog } from './pickers.js';
import { marketActions, marketView } from './market.js';
import { financeActions, financeView } from './finance.js';
import { stockActions, stocksView, tradeDialog } from './stocks.js';
import { brandActions, brandsView } from './brands.js';
import { guideView, newsView, rivalsView } from './rivals.js';
import { importDialog, startActions } from './start.js';

export const VIEWS = [overviewView, mapView, companyView, marketView, financeView, stocksView, brandsView, rivalsView, newsView, guideView];

export const PANELS = {
  building: buildingPanel,
};

// ---------------------------------------------------------------------------
// General dialogs
// ---------------------------------------------------------------------------

function closeButton() {
  return html`<button type="button" class="icon-btn" data-act="closeModal" aria-label="${t('close')}">${icon('close')}</button>`;
}

function confirmDialog(app, { title, text, ok, danger }) {
  return html`<div class="modal-head"><h2>${title}</h2>${closeButton()}</div>
    <div class="modal-body"><p>${text}</p></div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-act="closeModal">${t('cancel')}</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="confirmOk">${ok || t('ok')}</button>
    </div>`;
}

function menuDialog(app) {
  const manual = storage.savedInfo('manual');
  const theme = app.prefs.theme || 'system';
  return html`<div class="modal-head"><h2>${t('menu.title')}</h2>${closeButton()}</div>
    <div class="modal-body menu">
      <div class="menu-group">
        <button type="button" class="btn" data-act="saveGame">${icon('save', 18)}<span>${t('menu.save')}</span></button>
        <button type="button" class="btn" data-act="loadManual"${manual ? '' : html` disabled`}>
          <span>${t('menu.load')}</span>${manual ? html`<small>${manual.company} · ${dateStr(Math.max(1, manual.day))}</small>` : ''}
        </button>
        <button type="button" class="btn" data-act="openExport">${t('menu.export')}</button>
        <button type="button" class="btn" data-act="openImport">${t('menu.import')}</button>
      </div>
      <p class="muted small">${t('menu.autosave')}</p>
      <div class="menu-row">
        <span class="field-label">${t('menu.language')}</span>
        <div class="seg">
          ${LOCALES.map((l) => html`<button type="button" class="seg-btn ${getLocale() === l.id ? 'on' : ''}" data-act="setLocale" data-locale="${l.id}">${l.name}</button>`)}
        </div>
      </div>
      <div class="menu-row">
        <span class="field-label">${t('menu.theme')}</span>
        <div class="seg">
          ${['system', 'light', 'dark'].map(
            (th) => html`<button type="button" class="seg-btn ${theme === th ? 'on' : ''}" data-act="setTheme" data-theme="${th}">${t(`menu.theme.${th}`)}</button>`,
          )}
        </div>
      </div>
      <div class="menu-row">
        <span class="field-label">${t('menu.seed')}</span>
        <code>${app.game.state.settings.seed}</code>
      </div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-danger" data-act="quitAsk">${t('menu.quit')}</button>
      <button type="button" class="btn btn-primary" data-act="closeModal">${t('menu.back')}</button>
    </div>`;
}

function exportDialog(app) {
  return html`<div class="modal-head"><h2>${t('menu.export')}</h2>${closeButton()}</div>
    <div class="modal-body">
      <p class="muted">${t('menu.export.hint')}</p>
      <textarea id="export-text" class="code-area" rows="8" readonly spellcheck="false">${storage.exportText(app.game)}</textarea>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-act="closeModal">${t('close')}</button>
      <button type="button" class="btn btn-primary" data-act="copyExport">${t('menu.export.copy')}</button>
    </div>`;
}

function outcomeDialog(app) {
  const { game, me } = app;
  const outcome = game.state.outcome;
  if (!outcome) return null;
  const won = outcome.result === 'won';
  const ranking = game
    .companies()
    .map((co) => ({ co, equity: equityOf(game, co) }))
    .sort((a, b) => b.equity - a.equity);
  return html`<div class="modal-head outcome-head ${won ? 'won' : 'lost'}">
      <h2>${t(won ? 'outcome.won' : 'outcome.lost')}</h2>
    </div>
    <div class="modal-body">
      <p>${t(won ? 'outcome.won.text' : `outcome.lost.${outcome.reason}`, { date: dateStr(outcome.day) })}</p>
      <ol class="ranking">
        ${ranking.map(({ co, equity }) => html`<li>${coName(co)}<b>${money(equity)}</b></li>`)}
      </ol>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-act="quitNow">${t('outcome.menu')}</button>
      ${me?.alive ? html`<button type="button" class="btn btn-primary" data-act="continuePlay">${t('outcome.continue')}</button>` : ''}
    </div>`;
}

export const MODALS = {
  confirm: confirmDialog,
  menu: menuDialog,
  export: exportDialog,
  import: importDialog,
  outcome: outcomeDialog,
  build: buildDialog,
  product: productDialog,
  source: sourceDialog,
  recipe: recipeDialog,
  trade: tradeDialog,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const coreActions = {
  noop() {},
  go(app, d) {
    app.go(d.view, d.arg ?? null);
  },
  speed(app, d) {
    app.setSpeed(Number(d.level));
  },
  tab(app, d) {
    app.ui.tabs[d.group] = d.id;
  },
  toggleTable(app, d) {
    app.ui.tables[d.id] = !app.ui.tables[d.id];
  },
  toggleMore(app, d, el, event) {
    if (el.classList.contains('more-layer') && event.target !== el) return;
    app.ui.moreOpen = !app.ui.moreOpen;
  },
  dismissToast(app, d) {
    app.ui.toasts = app.ui.toasts.filter((x) => x.id !== Number(d.id));
  },
  closeModal(app) {
    app.ui.modal = null;
  },
  modalBackdrop(app, d, el, event) {
    if (event.target === el) app.ui.modal = null;
  },
  confirmOk(app) {
    const onOk = app.ui.modal?.onOk;
    app.ui.modal = null;
    onOk?.();
  },
  openMenu(app) {
    app.ui.moreOpen = false;
    app.modal('menu');
  },
  setLocale(app, d) {
    app.setLocale(d.locale);
  },
  setTheme(app, d) {
    app.setTheme(d.theme);
  },
  saveGame(app) {
    app.save('manual');
    app.ui.modal = null;
  },
  loadManual(app) {
    const data = storage.loadSaved('manual');
    if (data) app.loadGame(data);
  },
  openExport(app) {
    app.modal('export');
  },
  copyExport(app) {
    const area = app.root.querySelector('#export-text');
    if (!area) return;
    const done = () => app.toast(t('toast.copied'), 'good');
    const fallback = () => {
      area.focus();
      area.select();
      app.toast(t('toast.copyManual'), 'info');
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(area.value).then(done, fallback);
    else fallback();
  },
  quitAsk(app) {
    app.confirm({
      title: t('menu.quit'),
      text: t('menu.quit.text'),
      ok: t('menu.quit.ok'),
      danger: true,
      onOk: () => {
        app.save('auto');
        app.quitToStart();
      },
    });
  },
  quitNow(app) {
    app.quitToStart();
  },
  continuePlay(app) {
    if (app.cmd('continuePlay').ok) app.ui.modal = null;
  },
};

export const ACTIONS = {
  ...coreActions,
  ...startActions,
  ...mapActions,
  ...buildingActions,
  ...pickerActions,
  ...marketActions,
  ...financeActions,
  ...stockActions,
  ...brandActions,
};

/** Add handlers for `data-act` / `data-change` names (for mods). */
export function registerActions(handlers) {
  Object.assign(ACTIONS, handlers);
}
