// The application shell: owns the running game, the interface state, the
// clock that advances the simulation, and the top-level layout. Views,
// panels and dialogs are separate modules that receive this object.
//
//   app.game / app.me        the world and the human player's company
//   app.go(view, arg)        switch the main view
//   app.cmd(type, params)    run a game command for the player (toasts errors)
//   app.modal(type, props)   open a dialog;  app.closeModal()
//   app.openBuilding(id)     open the building panel
//   app.render()             ask for a re-render (cheap; coalesced)

import { createContent, Game } from '../setup.js';
import { equityOf } from '../sim/accounting.js';
import { diagnose } from '../sim/diagnostics.js';
import { flag, html, morph } from './dom.js';
import { extendLocale, getLocale, setLocale, t } from './i18n.js';
import { dateStr, money, price } from './format.js';
import { icon, speedIcon } from './icons.js';
import { attachChartHover, refreshChartHover } from './charts.js';
import { coName, moneyDelta, pctDelta, pill } from './components.js';
import * as storage from './storage.js';
import { ACTIONS, MODALS, PANELS, VIEWS } from './views/index.js';
import { newsText } from './news.js';
import { renderStart } from './views/start.js';

/** Simulated days per second for each speed button (0 = paused). */
export const SPEEDS = [0, 1, 4, 12, 40];
const MAX_TICKS_PER_FRAME = 10;
const TOAST_MS = 5200;

export class App {
  constructor(root) {
    this.root = root;
    this.content = createContent();
    for (const [locale, strings] of Object.entries(this.content.locales)) extendLocale(locale, strings);
    for (const view of VIEWS) if (!this.content.views.has(view.id)) this.content.views.register(view);

    this.prefs = storage.loadPrefs();
    setLocale(this.prefs.locale || 'pl');
    this.applyTheme();

    this.game = null;
    this.ui = this.freshUi();
    this.dirty = true;
    this.urgent = true;
    this.acc = 0;
    this.lastFrame = 0;
    this.lastRender = 0;
    this.toastSeq = 0;

    this.narrowQuery = window.matchMedia('(max-width: 820px)');
    this.narrowQuery.addEventListener('change', () => this.render());
    window.addEventListener('resize', () => this.render());

    this.bindEvents();
    attachChartHover(root, () => this.render());
    requestAnimationFrame((now) => this.frame(now));
  }

  freshUi() {
    return {
      view: 'overview',
      arg: null, // parameter of the current view (e.g. city id, product id)
      panel: null, // { type: 'building', id }
      modal: null, // { type, ...props }
      speed: 0,
      resume: 1, // speed to return to when un-pausing
      toasts: [],
      tables: {}, // chart id → show as table
      tabs: {}, // remembered tab per view
      moreOpen: false, // mobile "more" sheet
      draft: null, // new-game form
    };
  }

  // -------------------------------------------------------------------------
  // Convenience accessors
  // -------------------------------------------------------------------------

  get me() {
    return this.game?.human ?? null;
  }

  get narrow() {
    return this.narrowQuery.matches;
  }

  /** Width in px for charts in the main column. */
  get chartW() {
    const w = Math.min(window.innerWidth, 1500);
    if (this.narrow) return Math.max(280, w - 56);
    return Math.max(360, Math.min(760, w - 360));
  }

  views() {
    return [...this.content.views.all()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }

  // -------------------------------------------------------------------------
  // Game lifecycle
  // -------------------------------------------------------------------------

  startGame(options) {
    this.attach(Game.create(this.content, options));
    this.ui.speed = 0;
    this.toast(t(options.player ? 'toast.started' : 'toast.spectating'), 'good');
    this.save('auto');
  }

  loadGame(data) {
    try {
      this.attach(Game.load(this.content, data));
      this.toast(t('toast.loaded'), 'good');
      return true;
    } catch (error) {
      // The game in progress (if any) is untouched: a refused save changes nothing.
      const key = { 'save.version': 'err.saveVersion', 'save.content': 'err.saveContent' }[error.message] ?? 'err.saveInvalid';
      this.toast(t(key, error.params), 'bad');
      return false;
    }
  }

  attach(game) {
    this.game = game;
    this.ui = this.freshUi();
    this.acc = 0;
    this.failure = null;
    this.healthy = false; // true once this game has been drawn without an error
    game.bus.on('news', (item) => this.onNews(item));
    game.bus.on('built', (b) => {
      if (b.co === game.state.humanId) this.toast(t('toast.built', { name: this.buildingName(b) }), 'good');
    });
    game.bus.on('upgraded', (b) => {
      if (b.co === game.state.humanId) this.toast(t('toast.upgraded', { name: this.buildingName(b) }), 'good');
    });
    game.bus.on('month', () => this.autosave());
    game.bus.on('outcome', () => {
      this.ui.speed = 0;
      this.ui.modal = { type: 'outcome' };
    });
    if (game.state.outcome) this.ui.modal = { type: 'outcome' };
    this.render();
  }

  quitToStart() {
    this.game = null;
    this.failure = null; // a failed game is left behind with the game itself
    this.ui = this.freshUi();
    this.render();
  }

  /**
   * Keep the game in the automatic slot — unless it has never been drawn
   * properly or a rule has failed: then the last good save is worth more.
   */
  autosave() {
    if (this.game && this.healthy && !this.failure && !this.game.state.outcome) storage.saveGame(this.game, 'auto');
  }

  save(slot = 'manual') {
    if (!this.game) return false;
    const stored = storage.saveGame(this.game, slot);
    if (slot === 'manual') this.toast(t(stored ? 'toast.saved' : 'toast.savedSession'), stored ? 'good' : 'warn');
    return stored;
  }

  buildingName(b) {
    return b.name || `${this.content.buildingTypes.get(b.type).name[getLocale()] ?? b.type} ${b.no}`;
  }

  onNews(item) {
    const humanId = this.game.state.humanId;
    const concernsMe = item.co === humanId;
    if (item.t === 'info' && !concernsMe) return; // routine news stays in the feed
    if (item.co && !concernsMe && item.k !== 'news.bankrupt' && item.k !== 'news.takeover') return;
    this.toast(newsText(this.game, item), item.t === 'good' ? 'good' : item.t === 'bad' ? 'bad' : 'info');
  }

  // -------------------------------------------------------------------------
  // Interface state
  // -------------------------------------------------------------------------

  go(view, arg = null) {
    this.ui.view = view;
    this.ui.arg = arg;
    this.ui.moreOpen = false;
    if (this.narrow) this.ui.panel = null;
    this.render();
    this.root.querySelector('.main')?.scrollTo?.(0, 0);
  }

  openBuilding(id) {
    this.ui.panel = { type: 'building', id };
    this.render();
  }

  closePanel() {
    this.ui.panel = null;
    this.render();
  }

  modal(type, props = {}) {
    this.ui.modal = { type, ...props };
    this.render();
  }

  closeModal() {
    this.ui.modal = null;
    this.render();
  }

  /** Ask before something that cannot be undone. `onOk` runs when confirmed. */
  confirm({ title, text, ok, danger = false, onOk }) {
    this.modal('confirm', { title, text, ok, danger, onOk });
  }

  setSpeed(level) {
    if (level > 0) this.ui.resume = level;
    this.ui.speed = level;
    this.render();
  }

  togglePause() {
    this.setSpeed(this.ui.speed > 0 ? 0 : this.ui.resume || 1);
  }

  toast(text, tone = 'info') {
    const id = ++this.toastSeq;
    this.ui.toasts.push({ id, text, tone, until: performance.now() + TOAST_MS });
    if (this.ui.toasts.length > 3) this.ui.toasts.shift();
    this.render();
  }

  setLocale(locale) {
    setLocale(locale);
    this.prefs.locale = locale;
    storage.savePrefs(this.prefs);
    this.render();
  }

  setTheme(theme) {
    this.prefs.theme = theme;
    storage.savePrefs(this.prefs);
    this.applyTheme();
    this.render();
  }

  applyTheme() {
    const root = document.documentElement;
    // Remember the theme the page was given (a host may set it); "system"
    // means "leave it to the page", not "erase it".
    if (this.hostTheme === undefined) this.hostTheme = root.getAttribute('data-theme');
    const theme = this.prefs.theme;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else if (this.hostTheme) root.setAttribute('data-theme', this.hostTheme);
    else root.removeAttribute('data-theme');
  }

  /**
   * Run a command for the human player. Shows the reason when it is refused.
   * @returns {{ok: boolean}} the command result
   */
  cmd(type, params = {}, { quiet = false } = {}) {
    if (!this.game || !this.me) return { ok: false };
    const result = this.game.exec(this.me.id, type, params);
    if (!result.ok && !quiet) {
      const p = { ...(result.params || {}) };
      if (p.need != null) p.need = money(p.need);
      this.toast(t(result.error, p), 'bad');
    }
    this.render();
    return result;
  }

  /**
   * Ask for a re-render on the next frame. Used for everything the player
   * does, so it is never held back by the pacing of clock-driven redraws.
   */
  render() {
    this.dirty = true;
    this.urgent = true;
  }

  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------

  frame(now) {
    try {
      this.step(now);
    } catch (error) {
      // A rule or the DOM patcher failed. The world may be half-way through a
      // day, so stop for good and say so — never freeze silently, and never
      // save what might be a broken state over the last good one.
      console.error(error);
      this.failure = error;
      this.ui.speed = 0;
      this.showFailure();
    }
    requestAnimationFrame((next) => this.frame(next));
  }

  step(now) {
    if (this.failure) return;
    const dt = Math.min(0.25, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    const game = this.game;
    if (game && this.ui.speed > 0 && !this.ui.modal && !game.state.outcome) {
      this.acc += dt * SPEEDS[this.ui.speed];
      let ticks = Math.min(MAX_TICKS_PER_FRAME, Math.floor(this.acc));
      this.acc -= Math.floor(this.acc);
      while (ticks-- > 0 && !game.state.outcome) game.tick();
      this.dirty = true;
    }
    if (this.ui.toasts.length && this.ui.toasts[0].until < now) {
      this.ui.toasts = this.ui.toasts.filter((x) => x.until >= now);
      this.dirty = true;
    }
    // While the clock runs the screen is redrawn a few times a second; what
    // the player does (a click, a dialog) is shown on the very next frame.
    const running = game && this.ui.speed > 0;
    const interval = running ? (this.ui.speed >= 3 ? 220 : 160) : 0;
    if (this.dirty && (this.urgent || now - this.lastRender >= interval)) this.renderNow(now);
  }

  // -------------------------------------------------------------------------
  // Events (delegated: the DOM is re-rendered, listeners are not)
  // -------------------------------------------------------------------------

  bindEvents() {
    const run = (name, el, event) => {
      const handler = ACTIONS[name];
      if (!handler) {
        console.warn(`No handler for action "${name}"`);
        return;
      }
      handler(this, el.dataset, el, event);
      this.render();
    };
    this.root.addEventListener('click', (event) => {
      const el = event.target.closest('[data-act]');
      if (!el || el.disabled) return;
      if (el.tagName === 'A') event.preventDefault();
      run(el.dataset.act, el, event);
    });
    this.root.addEventListener('change', (event) => {
      const el = event.target.closest('[data-change]');
      if (el) run(el.dataset.change, el, event);
    });
    this.root.addEventListener('input', (event) => {
      const el = event.target.closest('[data-input]');
      if (el) run(el.dataset.input, el, event);
    });
    this.root.addEventListener('submit', (event) => {
      event.preventDefault();
      const el = event.target.closest('[data-submit]');
      if (el) run(el.dataset.submit, el, event);
    });
    // Rows and map cities are made focusable with tabindex: Enter activates them.
    this.root.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const el = event.target;
      if (!el.matches?.('[data-act][tabindex]')) return;
      event.preventDefault();
      run(el.dataset.act, el, event);
    });
    let spaceTaken = false;
    window.addEventListener('keydown', (event) => {
      const tag = event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // Keys typed into a field belong to the field — except Escape while
        // renaming a building, which abandons the rename.
        if (event.key === 'Escape' && this.ui.renaming) {
          this.ui.renaming = null;
          this.render();
        }
        return;
      }
      if (event.key === 'Escape') {
        if (this.ui.modal && this.ui.modal.type !== 'outcome') this.closeModal();
        else if (this.ui.moreOpen) {
          this.ui.moreOpen = false;
          this.render();
        } else if (this.ui.panel) this.closePanel();
        return;
      }
      if (!this.game || this.ui.modal || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === ' ') {
        // Space is the pause key everywhere in the game, also while a button
        // has focus (buttons still answer to Enter).
        event.preventDefault();
        spaceTaken = true;
        if (!event.repeat) this.togglePause();
      } else if (event.key >= '1' && event.key <= '4') {
        this.setSpeed(Number(event.key));
      }
    });
    window.addEventListener('keyup', (event) => {
      if (event.key === ' ' && spaceTaken) {
        spaceTaken = false;
        event.preventDefault(); // some browsers click the focused button on key-up
      }
    });
    // Leaving the page keeps the game. Phones rarely fire `beforeunload`, so
    // going to the background counts as leaving too.
    const keep = () => this.autosave();
    window.addEventListener('beforeunload', keep);
    window.addEventListener('pagehide', keep);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') keep();
    });
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  renderNow(now = performance.now()) {
    this.dirty = false;
    this.urgent = false;
    this.lastRender = now;
    let markup;
    try {
      markup = this.game ? this.renderGame() : renderStart(this);
      if (this.game) this.healthy = true;
    } catch (error) {
      // A view failed to draw: the world itself is fine, so offer a way back.
      console.error(error);
      markup = this.renderCrash(error, true);
    }
    morph(this.root, markup);
    refreshChartHover(this.root);
  }

  renderCrash(error, recoverable) {
    return html`<div class="crash">
      <h1>${t('crash.title')}</h1>
      <p>${t('crash.text')}</p>
      <p class="form-row">
        ${recoverable ? html`<button type="button" class="btn btn-primary" data-act="recover">${t('crash.back')}</button>` : ''}
        <button type="button" class="btn" data-act="quitNow">${t('outcome.menu')}</button>
      </p>
      <pre>${String(error?.stack || error)}</pre>
    </div>`;
  }

  showFailure() {
    try {
      morph(this.root, this.renderCrash(this.failure, false));
    } catch {
      this.root.textContent = `${t('crash.title')} — ${t('crash.text')}`;
    }
  }

  renderGame() {
    const { game, ui } = this;
    const views = this.views();
    const view = views.find((v) => v.id === ui.view) ?? views[0];
    const panel = ui.panel ? PANELS[ui.panel.type]?.(this, ui.panel) : null;
    const modal = ui.modal ? MODALS[ui.modal.type]?.(this, ui.modal) : null;
    return html`<div class="app ${panel ? 'has-panel' : ''} ${ui.speed > 0 ? 'running' : 'paused'}">
      ${this.renderTopbar()} ${this.renderTicker()} ${this.renderNav(views, view)}
      <main class="main" data-view="${view.id}">${view.render(this)}</main>
      ${panel ? html`<aside class="panel" data-key="panel">${panel}</aside>` : ''}
      ${ui.moreOpen ? this.renderMore(views, view) : ''}
      ${modal
        ? html`<div class="modal-layer" data-key="modal" data-act="${ui.modal.type === 'outcome' ? 'noop' : 'modalBackdrop'}">
            <div class="modal ${ui.modal.wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">${modal}</div>
          </div>`
        : ''}
      ${this.renderToasts()}
      ${!game.state.humanId ? html`<div class="spectator">${t('spectator')}</div>` : ''}
    </div>`;
  }

  renderTopbar() {
    const { game, ui } = this;
    const me = this.me;
    const { state } = game;
    const last = me?.reports.at(-1);
    const prev = me?.reports.at(-2);
    const alerts = me ? diagnose(game, me).filter((d) => d.level !== 'info').length : 0;
    const priceThen = me?.pd.length > 30 ? me.pd[me.pd.length - 31] : me?.pd[0];
    return html`<header class="topbar">
      <button type="button" class="wordmark" data-act="go" data-view="overview" title="${t('nav.overview')}">
        <span class="wordmark-a">Wielka</span><span class="wordmark-b">Hossa</span>
      </button>
      <div class="clock">
        <span class="clock-date">${dateStr(Math.max(1, state.day))}</span>
        ${pill(t(`phase.${state.economy.phase}`), state.economy.phase === 'recession' ? 'bad' : state.economy.phase === 'boom' ? 'good' : '')}
      </div>
      <div class="speed" role="group" aria-label="${t('speed.label')}">
        ${SPEEDS.map(
          (_, level) =>
            html`<button
              type="button"
              class="speed-btn ${ui.speed === level ? 'on' : ''}"
              data-act="speed"
              data-level="${level}"
              title="${t(`speed.${level}`)}"
              aria-pressed="${ui.speed === level ? 'true' : 'false'}"
            >
              ${speedIcon(level, 18)}
            </button>`,
        )}
      </div>
      ${me
        ? html`<div class="kpis">
            <div class="kpi" title="${t('kpi.cash.hint')}">
              <span class="kpi-label">${t('kpi.cash')}</span>
              <span class="kpi-value ${me.cash < 0 ? 'bad' : ''}">${money(me.cash)}</span>
            </div>
            <div class="kpi" title="${t('kpi.worth.hint')}">
              <span class="kpi-label">${t('kpi.worth')}</span>
              <span class="kpi-value">${money(equityOf(game, me))}</span>
            </div>
            <div class="kpi" title="${t('kpi.profit.hint')}">
              <span class="kpi-label">${t('kpi.profit')}</span>
              <span class="kpi-value">${last ? money(last.profit) : '–'}</span>
              ${last && prev ? html`<span class="kpi-sub">${moneyDelta(last.profit - prev.profit)}</span>` : ''}
            </div>
            <div class="kpi" title="${t('kpi.share.hint')}">
              <span class="kpi-label">${t('kpi.share')}</span>
              <span class="kpi-value">${price(me.price)}</span>
              ${priceThen ? html`<span class="kpi-sub">${pctDelta(me.price / priceThen - 1)}</span>` : ''}
            </div>
          </div>`
        : html`<div class="kpis"></div>`}
      <div class="top-actions">
        ${me
          ? html`<button type="button" class="icon-btn ${alerts ? 'has-badge' : ''}" data-act="go" data-view="overview" title="${t('alerts.title')}">
              ${icon('bell')}${alerts ? html`<span class="badge">${alerts}</span>` : ''}
            </button>`
          : ''}
        <button type="button" class="icon-btn" data-act="openMenu" title="${t('menu.title')}">${icon('menu')}</button>
      </div>
    </header>`;
  }

  renderTicker() {
    const { game } = this;
    const items = game.companies().map((co) => {
      const then = co.pd.length > 1 ? co.pd[Math.max(0, co.pd.length - 31)] : co.price;
      return html`<span class="tick">${coName(co)} <b>${price(co.price)}</b> ${pctDelta(co.price / then - 1)}</span>`;
    });
    const headline = game.state.news.at(-1);
    if (headline) items.push(html`<span class="tick tick-news">${newsText(game, headline)}</span>`);
    // The track is doubled so the loop is seamless.
    return html`<div class="ticker" aria-hidden="true">
      <div class="ticker-track">
        <div class="ticker-run">${items}</div>
        <div class="ticker-run">${items}</div>
      </div>
    </div>`;
  }

  renderNav(views, active) {
    const primary = views.filter((v) => v.primary);
    return html`<nav class="rail" aria-label="${t('nav.label')}">
      ${views.map(
        (v) =>
          html`<button
            type="button"
            class="rail-btn ${v.id === active.id ? 'on' : ''} ${v.primary ? 'primary' : 'secondary'}"
            data-act="go"
            data-view="${v.id}"
            aria-current="${v.id === active.id ? 'page' : 'false'}"
          >
            ${icon(v.icon)}<span>${t(v.label)}</span>
          </button>`,
      )}
      <button type="button" class="rail-btn more-btn ${primary.some((v) => v.id === active.id) ? '' : 'on'}" data-act="toggleMore">
        ${icon('more')}<span>${t('nav.more')}</span>
      </button>
    </nav>`;
  }

  /** Mobile sheet with the views that do not fit the bottom bar. */
  renderMore(views, active) {
    return html`<div class="more-layer" data-act="toggleMore">
      <div class="more-sheet">
        ${views
          .filter((v) => !v.primary)
          .map(
            (v) =>
              html`<button type="button" class="more-item ${v.id === active.id ? 'on' : ''}" data-act="go" data-view="${v.id}">
                ${icon(v.icon)}<span>${t(v.label)}</span>
              </button>`,
          )}
        <button type="button" class="more-item" data-act="openMenu">${icon('gear')}<span>${t('menu.title')}</span></button>
      </div>
    </div>`;
  }

  renderToasts() {
    return html`<div class="toasts" role="status" aria-live="polite">
      ${this.ui.toasts.map(
        (toast) =>
          html`<div class="toast toast-${toast.tone}" data-key="toast-${toast.id}">
            <span>${toast.text}</span>
            <button type="button" class="toast-x" data-act="dismissToast" data-id="${toast.id}" aria-label="${t('close')}">${icon('close', 14)}</button>
          </div>`,
      )}
    </div>`;
  }
}

/** Disabled-attribute helper re-exported for views. */
export { flag };
