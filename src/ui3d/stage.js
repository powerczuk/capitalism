// The stage: one WebGL canvas with an isometric camera, the lights, and the
// controls. It knows nothing about the game — scenes hand it a group of
// meshes and a list of things that can be clicked.
//
//   const stage = new Stage(container);
//   stage.show(group, { bounds, pickables });
//   stage.on('pick', (target, event) => …);   // target = userData.pick of what was hit
//
// Camera: orthographic, 30° above the horizon, looking along a diagonal — the
// classic 2:1 "isometric" game view. It turns in quarter steps.

import {
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFShadowMap,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from './three.js';
import { LIGHT } from './palette.js';

const ELEVATION = Math.PI / 6; // 30°
const SIN_E = Math.sin(ELEVATION);
const COS_E = Math.cos(ELEVATION);
const DISTANCE = 400;
/** Camera layer for everything that only shows at night (lit windows, lamps). */
export const GLOW_LAYER = 1;

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Materials shared by every model (see the layers in kit.js). */
export function createMaterials() {
  return {
    solid: new MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 }),
    glass: new MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.3 }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    water: new MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.12 }),
  };
}

export class Stage {
  /** @param {HTMLElement} container the element the canvas fills */
  constructor(container) {
    this.container = container;
    this.listeners = { pick: [], hover: [], frame: [], view: [] };

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'world-gl';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);

    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 1, DISTANCE * 3);
    this.materials = createMaterials();

    this.hemi = new HemisphereLight(0xffffff, 0x888888, 1);
    this.fill = new AmbientLight(0xffffff, 0);
    this.sun = new DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.hemi, this.fill, this.sun, this.sun.target);
    this.sunDir = new Vector3(-0.55, 1, 0.42).normalize();

    // What is looked at: a point on the ground, how much of the world fits
    // the height of the canvas, and the rotation in quarter turns.
    this.view = { x: 0, z: 0, zoom: 60, rot: 0 };
    this.limits = { minX: -100, maxX: 100, minZ: -100, maxZ: 100, minZoom: 14, maxZoom: 220 };
    this.content = null;
    this.pickables = [];
    this.mode = 'day';
    this.animating = false;
    this.dirty = true;
    this.shadowAt = { x: Infinity, z: Infinity, zoom: 0 };
    this.width = 1;
    this.height = 1;
    this.tween = null;
    this.raycaster = new Raycaster();
    this.pointer = new Vector2();
    this.hovered = null;
    this.disposed = false;

    this.setMode('day');
    this._bind();
    this.resize();
    this._frame = this._frame.bind(this);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._frame);
  }

  on(event, fn) {
    this.listeners[event].push(fn);
    return this;
  }

  _emit(event, ...args) {
    for (const fn of this.listeners[event]) fn(...args);
  }

  // --- content ------------------------------------------------------------------

  /**
   * Put a world on the stage.
   * @param {import('./three.js').Object3D} group
   * @param {{bounds?: object, pickables?: object[], view?: object}} [opts]
   */
  show(group, opts = {}) {
    if (this.content) this.scene.remove(this.content);
    this.content = group;
    if (group) this.scene.add(group);
    this.pickables = opts.pickables ?? [];
    if (opts.bounds) Object.assign(this.limits, opts.bounds);
    if (opts.view) Object.assign(this.view, opts.view);
    this.tween = null;
    this.hovered = null;
    this._clampView();
    this.invalidate(true);
  }

  /** Ask for a redraw; `shadows` also re-renders the shadow map. */
  invalidate(shadows = false) {
    this.dirty = true;
    if (shadows) this.shadowAt.zoom = 0;
  }

  /** Day or night: lights, background and the glow layer. */
  setMode(mode) {
    this.mode = mode === 'night' ? 'night' : 'day';
    const L = LIGHT[this.mode];
    this.scene.background = new Color(L.background);
    this.hemi.color.set(L.sky);
    this.hemi.groundColor.set(L.ground);
    this.hemi.intensity = L.hemi;
    this.sun.color.set(L.sun);
    this.sun.intensity = L.sunPower;
    this.sun.shadow.intensity = 1 - L.shadow + (this.mode === 'night' ? 0.1 : 0);
    if (this.mode === 'night') this.camera.layers.enable(GLOW_LAYER);
    else this.camera.layers.disable(GLOW_LAYER);
    this.invalidate(true);
  }

  /** Keep rendering every frame (for moving things) or only when something changes. */
  setAnimating(on) {
    this.animating = !!on;
  }

  // --- camera ---------------------------------------------------------------------

  get azimuth() {
    return Math.PI / 4 + (this.view.rot * Math.PI) / 2;
  }

  _placeCamera() {
    const { x, z, zoom } = this.view;
    const a = this.azimuth;
    const aspect = this.width / this.height;
    const cam = this.camera;
    cam.left = (-zoom * aspect) / 2;
    cam.right = (zoom * aspect) / 2;
    cam.top = zoom / 2;
    cam.bottom = -zoom / 2;
    cam.position.set(x + Math.sin(a) * COS_E * DISTANCE, SIN_E * DISTANCE, z + Math.cos(a) * COS_E * DISTANCE);
    cam.lookAt(x, 0, z);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  _placeSun() {
    // The shadow map covers what the camera sees (the ground is foreshortened,
    // so the footprint is deeper than the view is tall) with some room around.
    const { x, z, zoom } = this.view;
    const aspect = this.width / this.height;
    const reach = Math.max(zoom * aspect, zoom / SIN_E) * 0.62 + 6;
    const at = this.shadowAt;
    if (Math.abs(at.zoom - zoom) < zoom * 0.02 && Math.hypot(at.x - x, at.z - z) < reach * 0.12) return;
    at.x = x;
    at.z = z;
    at.zoom = zoom;
    const sun = this.sun;
    sun.target.position.set(x, 0, z);
    sun.position.set(x + this.sunDir.x * 260, this.sunDir.y * 260, z + this.sunDir.z * 260);
    const c = sun.shadow.camera;
    const box = reach * 1.25;
    c.left = -box;
    c.right = box;
    c.top = box;
    c.bottom = -box;
    c.near = 20;
    c.far = 620;
    c.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
    this.renderer.shadowMap.needsUpdate = true;
  }

  _clampView() {
    const v = this.view;
    const L = this.limits;
    v.zoom = clamp(v.zoom, L.minZoom, L.maxZoom);
    v.x = clamp(v.x, L.minX, L.maxX);
    v.z = clamp(v.z, L.minZ, L.maxZ);
  }

  /** World units per CSS pixel. */
  get scale() {
    return this.view.zoom / this.height;
  }

  /** Move the view by a drag of (dx, dy) pixels. */
  panBy(dx, dy) {
    const a = this.azimuth;
    const k = this.scale;
    // Screen right is (cos a, −sin a) on the ground; screen up is the direction away from the camera.
    const rx = Math.cos(a);
    const rz = -Math.sin(a);
    const fx = -Math.sin(a);
    const fz = -Math.cos(a);
    this.view.x += -dx * k * rx + (dy * k * fx) / SIN_E;
    this.view.z += -dx * k * rz + (dy * k * fz) / SIN_E;
    this.tween = null;
    this._clampView();
    this.invalidate();
    this._emit('view');
  }

  /** Zoom by `factor` (>1 = out), keeping the ground under (px, py) in place. */
  zoomBy(factor, px = this.width / 2, py = this.height / 2) {
    const before = this.groundAt(px, py);
    this.view.zoom = clamp(this.view.zoom * factor, this.limits.minZoom, this.limits.maxZoom);
    this._placeCamera();
    const after = this.groundAt(px, py);
    this.view.x += before.x - after.x;
    this.view.z += before.z - after.z;
    this.tween = null;
    this._clampView();
    this.invalidate();
    this._emit('view');
  }

  /** Turn by quarter steps (+1 = clockwise), animated. */
  rotate(steps) {
    const from = this.tween?.to.rot ?? this.view.rot;
    this.flyTo({ rot: Math.round(from) + steps }, 380);
  }

  /** Glide to a view; any of x, z, zoom, rot may be given. */
  flyTo(target, ms = 600) {
    const from = { ...this.view };
    const to = { ...from, ...target };
    if (ms <= 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Object.assign(this.view, to);
      this.tween = null;
      this._clampView();
      this.invalidate();
      this._emit('view');
      return;
    }
    this.tween = { from, to, start: performance.now(), ms };
  }

  /** The point of the ground (y = 0) under a canvas pixel. */
  groundAt(px, py) {
    const ndc = new Vector3((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1, -1).unproject(this.camera);
    const dir = new Vector3(0, 0, -1).transformDirection(this.camera.matrixWorld);
    const t = -ndc.y / dir.y;
    return { x: ndc.x + dir.x * t, z: ndc.z + dir.z * t };
  }

  /** Canvas pixel of a point of the world (for HTML labels). */
  project(x, y, z, out = {}) {
    const v = new Vector3(x, y, z).project(this.camera);
    out.x = ((v.x + 1) / 2) * this.width;
    out.y = ((1 - v.y) / 2) * this.height;
    return out;
  }

  // --- picking -----------------------------------------------------------------------

  /** `userData.pick` of the nearest pickable thing under a canvas pixel, or null. */
  pick(px, py) {
    if (!this.pickables.length) return null;
    this.pointer.set((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    for (const hit of hits) {
      if (!hit.object.visible) continue;
      const target = hit.object.userData.pick;
      if (target) return target;
    }
    return null;
  }

  // --- input -------------------------------------------------------------------------

  _bind() {
    const el = this.canvas;
    const pointers = new Map();
    let moved = 0;
    let pinch = 0;
    const local = (e) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    el.addEventListener('pointerdown', (e) => {
      if (e.button > 1) return;
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 1) moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') this._hover(p.x, p.y, e);
        return;
      }
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 5) {
          this.panBy(dx, dy);
          el.classList.add('dragging');
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && dist > 0) this.zoomBy(pinch / dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = dist;
        moved += 10;
      }
    });
    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      el.classList.remove('dragging');
      if (pointers.size === 0 && moved <= 5 && e.type === 'pointerup') this._emit('pick', this.pick(p.x, p.y), { x: p.x, y: p.y, event: e });
      if (pointers.size < 2) pinch = 0;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => this._hover(-1, -1, null));
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = local(e);
        const step = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
        this.zoomBy(Math.exp(clamp(step, -240, 240) * 0.0016), p.x, p.y);
      },
      { passive: false },
    );
    el.addEventListener('keydown', (e) => {
      const step = 60;
      const keys = {
        ArrowLeft: () => this.panBy(step, 0),
        ArrowRight: () => this.panBy(-step, 0),
        ArrowUp: () => this.panBy(0, step),
        ArrowDown: () => this.panBy(0, -step),
        '+': () => this.zoomBy(0.8),
        '=': () => this.zoomBy(0.8),
        '-': () => this.zoomBy(1.25),
        q: () => this.rotate(-1),
        e: () => this.rotate(1),
      };
      const run = keys[e.key];
      if (!run) return;
      e.preventDefault();
      e.stopPropagation();
      run();
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.container);
  }

  _hover(px, py, event) {
    const target = px < 0 ? null : this.pick(px, py);
    if (target === this.hovered && !target) return;
    this.hovered = target;
    this.canvas.style.cursor = target ? 'pointer' : '';
    this._emit('hover', target, { x: px, y: py, event });
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    if (w === this.width && h === this.height && this.sized) return;
    this.sized = true;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.invalidate(true);
    this._emit('view');
  }

  // --- loop ----------------------------------------------------------------------------

  _frame(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this._frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.canvas.isConnected) return; // parked while another screen is shown
    if (this.tween) {
      const { from, to, start, ms } = this.tween;
      const t = clamp((now - start) / ms, 0, 1);
      const k = ease(t);
      for (const key of ['x', 'z', 'zoom', 'rot']) this.view[key] = from[key] + (to[key] - from[key]) * k;
      if (t >= 1) {
        this.view.rot = ((Math.round(to.rot) % 4) + 4) % 4;
        this.tween = null;
      }
      this._clampView();
      this.dirty = true;
      this._emit('view');
    }
    if (this.animating) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this._placeCamera();
    this._placeSun();
    this._emit('frame', dt, now);
    this.renderer.render(this.scene, this.camera);
  }

  /** Draw right now (used by tests and screenshots). */
  renderNow() {
    this._placeCamera();
    this._placeSun();
    this._emit('frame', 0, performance.now());
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
