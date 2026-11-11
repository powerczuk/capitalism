// The 3D world of the game: one stage shared by the map of the country and
// the cities, kept in step with the app.
//
//   const world = attachWorld(element, app);   // puts the canvas into the element
//   world.update(app);                          // after every render of the page
//   world.detach();                             // the element is gone; the stage is parked, not destroyed
//
// The stage and the scenes outlive the element: leaving the map view and
// coming back does not rebuild anything. A new or loaded game does.
//
// What the player clicks turns into ordinary app calls — open a building's
// panel, open the build dialog for a plot, go to a city — so the 3D view adds
// no rules of its own.

import { Stage } from './stage.js';
import { CityScene } from './cityScene.js';
import { CountryScene } from './countryScene.js';

let world = null;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function isDark() {
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced === 'dark') return true;
  if (forced === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/** How fast things move at each speed of the game's clock (0 = paused). */
const PACE = [0, 1, 1.35, 1.8, 2.4];

class World {
  constructor() {
    this.host = document.createElement('div');
    this.host.className = 'world-host';
    this.stage = new Stage(this.host);
    this.overlay = document.createElement('div');
    this.overlay.className = 'world-labels';
    this.tip = document.createElement('div');
    this.tip.className = 'world-tip';
    this.tip.hidden = true;
    this.host.append(this.overlay, this.tip);
    this.app = null;
    this.game = null;
    this.scenes = new Map(); // city id (or 'country') → scene
    this.views = new Map(); // remembered camera per scene
    this.current = null;
    this.key = undefined;
    this.pace = 0;
    this.labels = new Map();

    // A name over the map stands for the thing it names. The names let the
    // pointer through (so the map can be dragged and zoomed anywhere) and are
    // found by where a click lands; with the keyboard they are buttons.
    this.overlay.addEventListener('click', (event) => {
      const el = event.target.closest('.world-label');
      const pick = el && this.labels.get(el.dataset.id)?.at.pick;
      if (pick) this.onPick(pick);
    });
    this.stage.on('pick', (target, at) => this.onPick(this.labelAt(at)?.at.pick ?? target));
    this.stage.on('hover', (target, at) => this.onHover(target, at));
    this.stage.on('frame', (dt) => {
      try {
        this.current?.update?.(dt, this.pace);
      } catch (error) {
        // what moves is decoration: if it fails, the picture stays still
        console.error(error);
        this.pace = 0;
        this.frozen = true;
        this.stage.setAnimating(false);
      }
      this.placeLabels();
    });
  }

  // --- life cycle -----------------------------------------------------------------

  attach(element, app) {
    element.appendChild(this.host);
    this.app = app;
    app.world3d = this;
    this.stage.resize();
    this.update(app);
  }

  detach() {
    this.remember();
    this.host.remove();
    this.tip.hidden = true;
    if (this.app?.world3d === this) this.app.world3d = null;
  }

  reset() {
    for (const scene of this.scenes.values()) scene.dispose();
    this.scenes.clear();
    this.views.clear();
    this.current = null;
    this.key = undefined;
    this.clearLabels();
    this.stage.show(null);
  }

  /** Keep the camera of the scene on show — where it is going, if it is on its way. */
  remember() {
    if (this.key !== undefined && this.current) this.views.set(this.key, this.stage.destination);
  }

  // --- keeping in step with the app ---------------------------------------------------

  update(app) {
    this.app = app;
    const game = app.game;
    if (!game) return;
    if (game !== this.game) {
      this.reset();
      this.game = game;
    }
    const cityId = app.ui.arg && game.state.cities[app.ui.arg] ? app.ui.arg : null;
    const key = cityId ?? 'country';
    if (key !== this.key) this.open(key, cityId);

    const mode = isDark() ? 'night' : 'day';
    if (mode !== this.stage.mode) this.stage.setMode(mode);

    // Redraw only what changed: this runs after every render of the page,
    // several times a second while the clock is running.
    const scene = this.current;
    if (scene.sync(game, app.me)) this.stage.invalidate(true);
    const lots = !!app.ui.world?.lots && !!app.me;
    if (scene.setShowLots && lots !== scene.showLots) {
      scene.setShowLots(lots);
      this.stage.invalidate();
    }
    // a frame round the building whose panel is open, or the plot being built on
    const { panel, modal } = app.ui;
    const selected =
      modal?.type === 'build' && modal.lot != null && modal.city === key
        ? { kind: 'lot', district: modal.district, lot: modal.lot }
        : panel?.type === 'building'
          ? { kind: 'building', id: panel.id }
          : null;
    if (scene.mark?.('selected', selected)) this.stage.invalidate();
    this.pace = reducedMotion() || this.frozen ? 0 : PACE[app.ui.speed] ?? 0;
    this.stage.setAnimating(this.pace > 0 && !app.ui.modal);
    this.refreshLabels();
    this.placeLabels();
  }

  open(key, cityId) {
    this.remember();
    // nothing of the scene that leaves may linger: the tip, the frame under the pointer
    this.tip.hidden = true;
    this.current?.mark?.('hover', null);
    const game = this.game;
    let scene = this.scenes.get(key);
    if (!scene) {
      scene = cityId
        ? new CityScene({ content: this.app.content, game, city: game.state.cities[cityId], materials: this.stage.materials })
        : new CountryScene({ content: this.app.content, game, materials: this.stage.materials });
      this.scenes.set(key, scene);
    }
    const from = this.key;
    this.key = key;
    this.current = scene;
    this.frozen = false;
    const hadFocus = this.host.contains(document.activeElement);
    this.clearLabels();
    // A scene that says how much of it should fit across the view (`span`) is
    // shown from further away on a narrow screen, and may be zoomed out as far.
    const aspect = this.stage.width / Math.max(1, this.stage.height);
    const fitted = scene.span ? Math.max(scene.view.zoom, scene.span / aspect) : scene.view.zoom;
    const bounds = { ...scene.bounds, maxZoom: Math.max(scene.bounds.maxZoom, fitted * 1.15) };
    const view = this.views.get(key) ?? { ...scene.view, zoom: fitted };
    this.stage.show(scene.group, { pickables: scene.pickables, blocker: scene.blocker, bounds, view });
    // arriving in a city from the map of the country: come down from above
    if (cityId && from === 'country' && !this.views.has(key)) {
      this.stage.view.zoom = Math.min(bounds.maxZoom, view.zoom * 2.2);
      this.stage.flyTo({ zoom: view.zoom }, 650);
    }
    // The name or button that brought the player here is gone with the old
    // scene: the keyboard carries on from the map itself.
    const active = document.activeElement;
    if (hadFocus || !active || active === document.body) this.stage.canvas.focus({ preventScroll: true });
  }

  // --- what the player does ----------------------------------------------------------------

  /** The name over the map that lies under a point of the canvas, if any. */
  labelAt(at) {
    if (!at || !this.labels.size) return null;
    const host = this.host.getBoundingClientRect();
    const x = host.left + at.x;
    const y = host.top + at.y;
    for (const label of this.labels.values()) {
      if (label.off || !label.at.pick) continue;
      const r = label.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return label;
    }
    return null;
  }

  onPick(target) {
    const app = this.app;
    if (!app?.game || !target) {
      if (app?.ui.world?.info) {
        app.ui.world.info = null;
        app.render();
      }
      return;
    }
    if (target.kind === 'city') {
      app.go('map', target.id);
    } else if (target.kind === 'building') {
      const b = app.game.state.buildings[target.id];
      if (!b) return;
      if (app.me && b.co === app.me.id) app.openBuilding(b.id);
      else {
        (app.ui.world ??= {}).info = target.id;
        app.render();
      }
    } else if (target.kind === 'lot') {
      if (!app.me) return;
      app.modal('build', { city: this.key, district: target.district, lot: target.lot, wide: true });
    }
  }

  onHover(target, at) {
    // a name under the pointer stands for what it names (and needs no tip: it is the name)
    const label = at.x >= 0 ? this.labelAt(at) : null;
    if (label !== this.hot) {
      this.hot?.el.classList.remove('hot');
      label?.el.classList.add('hot');
      this.hot = label;
    }
    if (label) {
      target = label.at.pick;
      this.stage.canvas.style.cursor = 'pointer';
    }
    if (this.current?.mark?.('hover', target)) this.stage.invalidate();
    const text = target && !label?.text ? this.app?.describePick?.(target) : null; // a name needs no tip; a mark does
    if (!text) {
      this.tip.hidden = true;
      return;
    }
    if (this.tip.textContent !== text) this.tip.textContent = text;
    this.tip.hidden = false;
    // below and to the right of the pointer — or on the other side where the edge is near
    const w = this.tip.offsetWidth;
    const h = this.tip.offsetHeight;
    const x = at.x + 14 + w > this.stage.width - 4 ? at.x - 12 - w : at.x + 14;
    const y = at.y + 18 + h > this.stage.height - 4 ? at.y - 10 - h : at.y + 18;
    this.tip.style.transform = `translate(${Math.round(Math.max(4, x))}px, ${Math.round(Math.max(4, y))}px)`;
  }

  // --- labels -----------------------------------------------------------------------------------

  clearLabels() {
    this.overlay.textContent = '';
    this.labels.clear();
    this.hot = null;
  }

  /** Labels are plain HTML laid over the canvas: sharp text at any zoom. */
  refreshLabels() {
    const wanted = this.current?.labels?.(this.app) ?? [];
    const seen = new Set();
    for (const item of wanted) {
      seen.add(item.id);
      let label = this.labels.get(item.id);
      if (!label) {
        const el = document.createElement('button');
        el.type = 'button';
        el.dataset.id = item.id;
        this.overlay.appendChild(el);
        label = { el };
        this.labels.set(item.id, label);
      }
      if (label.mark !== !!item.mark) {
        // A mark without a name (a rival's building) is for the eye and the
        // pointer; the keyboard finds the same buildings in the drawer.
        label.mark = !!item.mark;
        label.el.tabIndex = item.mark ? -1 : 0;
        if (item.mark) label.el.setAttribute('aria-hidden', 'true');
        else label.el.removeAttribute('aria-hidden');
      }
      label.at = item;
      const cls = `world-label ${item.cls ?? ''}`;
      if (label.el.className !== cls) label.el.className = cls;
      if (label.text !== item.text) {
        label.text = item.text;
        label.el.textContent = item.text;
      }
      if (label.color !== item.color) {
        label.color = item.color;
        label.el.style.setProperty('--dot', item.color ?? 'transparent');
      }
    }
    for (const [id, label] of this.labels) {
      if (seen.has(id)) continue;
      if (label === this.hot) this.hot = null;
      label.el.remove();
      this.labels.delete(id);
    }
  }

  placeLabels() {
    if (!this.labels.size) return;
    const p = {};
    const far = this.current?.labelZoom && this.stage.view.zoom > this.current.labelZoom;
    for (const label of this.labels.values()) {
      const { x, y, z } = label.at;
      this.stage.project(x, y, z, p);
      // names are dropped when looking from far away; the small marks stay
      const off = (far && !label.at.mark) || p.x < -60 || p.y < -30 || p.x > this.stage.width + 60 || p.y > this.stage.height + 30;
      if (off !== label.off) {
        label.off = off;
        label.el.style.display = off ? 'none' : '';
      }
      if (!off) label.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    }
  }

  // --- for the toolbar and for tests ----------------------------------------------------------------

  rotate(dir) {
    this.stage.rotate(dir);
  }

  zoom(factor) {
    this.stage.zoomBy(factor);
  }

  /** Fly to a building or plot of the city on show. */
  focus(pick) {
    const at = this.current?.locate?.(pick);
    if (at) this.stage.flyTo({ x: at.x, z: at.z, zoom: Math.min(this.stage.view.zoom, 34) }, 500);
  }

  /** Canvas pixel of the middle of a city, plot or building. */
  screenOf(pick) {
    const at = this.current?.locate?.(pick);
    if (!at) return null;
    this.stage.renderNow();
    return this.stage.project(at.x, 0.2, at.z);
  }

  /**
   * A canvas pixel where a click reaches the given city, plot or building
   * from where the camera stands — or null when it is hidden behind something
   * (tests click there).
   */
  reach(pick) {
    const centre = this.current?.locate?.(pick);
    if (!centre) return null;
    this.stage.renderNow();
    const same = (hit) => !!hit && hit.kind === pick.kind && hit.id === pick.id && hit.district === pick.district && hit.lot === pick.lot;
    const lot = this.current.plotOf?.(pick);
    const points = [centre];
    if (lot) {
      // a grid of points over the plot, the middle ones first
      const cos = Math.cos(lot.ry);
      const sin = Math.sin(lot.ry);
      for (const u of [0, -0.25, 0.25, -0.4, 0.4]) {
        for (const v of [0, -0.25, 0.25, -0.4, 0.4]) {
          const lx = u * lot.w;
          const lz = v * lot.d;
          points.push({ x: lot.x + lx * cos + lz * sin, z: lot.z - lx * sin + lz * cos });
        }
      }
    }
    for (const p of points) {
      const px = this.stage.project(p.x, 0.1, p.z);
      if (px.x < 8 || px.y < 8 || px.x > this.stage.width - 8 || px.y > this.stage.height - 8) continue;
      if (same(this.stage.pick(px.x, px.y))) return px;
    }
    return null;
  }
}

/** Put the 3D world into `element`. Throws when WebGL is not available. */
export function attachWorld(element, app) {
  world ??= new World();
  world.attach(element, app);
  return world;
}
