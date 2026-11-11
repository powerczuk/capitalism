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

    this.stage.on('pick', (target) => this.onPick(target));
    this.stage.on('hover', (target, at) => this.onHover(target, at));
    this.stage.on('frame', (dt) => {
      this.current?.update?.(dt, this.pace);
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

  remember() {
    if (this.key !== undefined && this.current) this.views.set(this.key, { ...this.stage.view });
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
    this.pace = reducedMotion() ? 0 : PACE[app.ui.speed] ?? 0;
    this.stage.setAnimating(this.pace > 0 && !app.ui.modal);
    this.refreshLabels();
    this.placeLabels();
  }

  open(key, cityId) {
    this.remember();
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
    this.clearLabels();
    const view = this.views.get(key) ?? scene.view;
    this.stage.show(scene.group, { pickables: scene.pickables, bounds: scene.bounds, view });
    // arriving in a city from the map of the country: come down from above
    if (cityId && from === 'country' && !this.views.has(key)) {
      this.stage.view.zoom = Math.min(scene.bounds.maxZoom, view.zoom * 2.2);
      this.stage.flyTo({ zoom: view.zoom }, 650);
    }
  }

  // --- what the player does ----------------------------------------------------------------

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
    const text = target ? this.app?.describePick?.(target) : null;
    if (!text) {
      this.tip.hidden = true;
      return;
    }
    this.tip.textContent = text;
    this.tip.hidden = false;
    this.tip.style.transform = `translate(${Math.round(at.x + 14)}px, ${Math.round(at.y + 16)}px)`;
  }

  // --- labels -----------------------------------------------------------------------------------

  clearLabels() {
    this.overlay.textContent = '';
    this.labels.clear();
  }

  /** Labels are plain HTML laid over the canvas: sharp text at any zoom. */
  refreshLabels() {
    const wanted = this.current?.labels?.(this.app) ?? [];
    const seen = new Set();
    for (const item of wanted) {
      seen.add(item.id);
      let label = this.labels.get(item.id);
      if (!label) {
        const el = document.createElement('div');
        this.overlay.appendChild(el);
        label = { el };
        this.labels.set(item.id, label);
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
      const off = far || p.x < -60 || p.y < -30 || p.x > this.stage.width + 60 || p.y > this.stage.height + 30;
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

  /** Canvas pixel of a plot or building (tests click there). */
  screenOf(pick) {
    const at = this.current?.locate?.(pick);
    if (!at) return null;
    this.stage.renderNow();
    return this.stage.project(at.x, 0.2, at.z);
  }
}

/** Put the 3D world into `element`. Throws when WebGL is not available. */
export function attachWorld(element, app) {
  world ??= new World();
  world.attach(element, app);
  return world;
}
