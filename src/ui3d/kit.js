// The modelling kit: every building, road and tree in the 3D view is made of
// a few coloured primitives stamped into shared buffers.
//
//   const b = new Builder(seed);
//   b.block(0, 0, 0, 4, 2, 3, WALL, { win: { cols: 4, rows: 2 } });   // walls + windows
//   b.gable(0, 2, 0, 4, 3, 0, 1, WALL, ROOF);                          // pitched roof
//   const { solid, glass, glow } = b.build();                           // BufferGeometries
//
// Conventions
//   - y is up; the ground is y = 0; x runs right, z towards the viewer ("front").
//   - positions given to primitives are the centre of the footprint and the
//     *bottom* of the shape: box(x, y, z, w, h, d) stands on height y.
//   - 1 unit ≈ 5 m: a storey is 0.6 high, a car 0.9 long, a street 1.6 wide.
//   - colours are hex numbers; lighting, not the model, makes the shading.
//
// Layers
//   solid  everything opaque (one matte material, vertex colours)
//   glass  large glazed surfaces (same, but shiny)
//   glow   what lights up at night: windows, lamps, signs (drawn unlit, night only)
//   pool   light thrown on the ground by lamps (night only, added to what is below)
//
// Models never touch three.js objects: they only talk to a Builder, which keeps
// them short and lets the scene decide how to batch, light and pick them.

import { BufferAttribute, BufferGeometry, Color } from './three.js';

const TAU = Math.PI * 2;
const scratch = new Color();
const colorCache = new Map();

/** Linear RGB bytes of a hex colour (vertex colours live in linear space). */
function bytes(hex) {
  let c = colorCache.get(hex);
  if (!c) {
    scratch.set(hex);
    c = [Math.round(scratch.r * 255), Math.round(scratch.g * 255), Math.round(scratch.b * 255)];
    colorCache.set(hex, c);
  }
  return c;
}

/** Mix two hex colours (t = 0 → a, 1 → b), in display space. */
export function mix(a, b, t) {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Lighter (k > 1) or darker (k < 1) version of a hex colour. */
export function shade(hex, k) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f((hex >> 16) & 255) << 16) | (f((hex >> 8) & 255) << 8) | f(hex & 255);
}

/** Small deterministic random generator (mulberry32). */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Layer {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.count = 0;
  }
}

export class Builder {
  constructor(seed = 1) {
    this.layers = new Map();
    this.cur = this._layer('solid');
    this.rand = rng(seed);
    // Accumulated transform: translation, rotation about y (as cos/sin) and uniform scale.
    this.t = { x: 0, y: 0, z: 0, c: 1, s: 0, k: 1 };
    this.stack = [];
    this.night = true; // emit the glow layer (lit windows) as well
  }

  _layer(name) {
    let layer = this.layers.get(name);
    if (!layer) this.layers.set(name, (layer = new Layer()));
    return layer;
  }

  /** Send what follows to another layer; returns the previous one's name. */
  layer(name) {
    this.cur = this._layer(name);
    return this;
  }

  // --- transforms -----------------------------------------------------------

  /** Move/turn/scale the local frame for everything added inside `fn`. */
  at(x, y, z, ry, fn, k = 1) {
    const p = this.t;
    this.stack.push(p);
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    this.t = {
      x: p.x + p.k * (p.c * x + p.s * z),
      y: p.y + p.k * y,
      z: p.z + p.k * (-p.s * x + p.c * z),
      c: p.c * c - p.s * s,
      s: p.s * c + p.c * s,
      k: p.k * k,
    };
    fn(this);
    this.t = this.stack.pop();
    return this;
  }

  // --- low level ---------------------------------------------------------------

  _vert(layer, x, y, z, nx, ny, nz, c, k = 1) {
    const t = this.t;
    layer.pos.push(t.x + t.k * (t.c * x + t.s * z), t.y + t.k * y, t.z + t.k * (-t.s * x + t.c * z));
    layer.nor.push(Math.round((t.c * nx + t.s * nz) * 127), Math.round(ny * 127), Math.round((-t.s * nx + t.c * nz) * 127));
    layer.col.push(Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k)));
    return layer.count++;
  }

  /**
   * A flat four-sided face. Corners are given counter-clockwise seen from
   * outside; `k` darkens (<1) or lightens the two *first* corners — used for
   * the soft shadow at the foot of walls.
   */
  quad(a, b, c, d, color, k = 1, layer = this.cur) {
    // The normal comes from the diagonals, so a "quad" with two corners in
    // one place (a triangle in disguise) still gets a proper one.
    const ux = c[0] - a[0];
    const uy = c[1] - a[1];
    const uz = c[2] - a[2];
    const vx = d[0] - b[0];
    const vy = d[1] - b[1];
    const vz = d[2] - b[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const col = bytes(color);
    const i = this._vert(layer, a[0], a[1], a[2], nx, ny, nz, col, k);
    this._vert(layer, b[0], b[1], b[2], nx, ny, nz, col, k);
    this._vert(layer, c[0], c[1], c[2], nx, ny, nz, col);
    this._vert(layer, d[0], d[1], d[2], nx, ny, nz, col);
    layer.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return this;
  }

  tri(a, b, c, color, layer = this.cur) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const col = bytes(color);
    const i = this._vert(layer, a[0], a[1], a[2], nx, ny, nz, col);
    this._vert(layer, b[0], b[1], b[2], nx, ny, nz, col);
    this._vert(layer, c[0], c[1], c[2], nx, ny, nz, col);
    layer.idx.push(i, i + 1, i + 2);
    return this;
  }

  // --- primitives -----------------------------------------------------------------

  /**
   * A box standing on height `y`, centred on (x, z).
   * opts: ry (turn about its own centre), top (colour of the top face),
   *       ao (darkening at the foot of the walls, 1 = none), bottom (draw the underside)
   */
  box(x, y, z, w, h, d, color, opts) {
    const ry = opts?.ry;
    if (ry) return this.at(x, y, z, ry, () => this.box(0, 0, 0, w, h, d, color, { ...opts, ry: 0 }));
    const ao = opts?.ao ?? 0.86;
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    const y1 = y + h;
    this.quad([x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1], color, ao); // front (+z)
    this.quad([x1, y, z0], [x0, y, z0], [x0, y1, z0], [x1, y1, z0], color, ao); // back
    this.quad([x1, y, z1], [x1, y, z0], [x1, y1, z0], [x1, y1, z1], color, ao); // right (+x)
    this.quad([x0, y, z0], [x0, y, z1], [x0, y1, z1], [x0, y1, z0], color, ao); // left
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], opts?.top ?? color); // top
    if (opts?.bottom) this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], color);
    return this;
  }

  /** A flat rectangle lying on height `y` (road markings, lawns, roofs' details). */
  plane(x, y, z, w, d, color, ry = 0) {
    if (ry) return this.at(x, y, z, ry, () => this.plane(0, 0, 0, w, d, color));
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    return this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color);
  }

  /**
   * A cylinder (or cone/frustum with r2) standing on height `y`.
   * opts: seg, r2 (top radius), top (cap colour), smooth, ao, cap
   */
  cyl(x, y, z, r, h, color, opts) {
    const seg = opts?.seg ?? 10;
    const r2 = opts?.r2 ?? r;
    const smooth = opts?.smooth ?? true;
    const ao = opts?.ao ?? 0.88;
    const layer = this.cur;
    const col = bytes(color);
    const slope = (r - r2) / (h || 1);
    const ny = slope / Math.hypot(1, slope);
    const nh = 1 / Math.hypot(1, slope);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU;
      const a1 = ((i + 1) / seg) * TAU;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      if (smooth) {
        const i0 = this._vert(layer, x + c0 * r, y, z + s0 * r, c0 * nh, ny, s0 * nh, col, ao);
        this._vert(layer, x + c0 * r2, y + h, z + s0 * r2, c0 * nh, ny, s0 * nh, col);
        this._vert(layer, x + c1 * r2, y + h, z + s1 * r2, c1 * nh, ny, s1 * nh, col);
        this._vert(layer, x + c1 * r, y, z + s1 * r, c1 * nh, ny, s1 * nh, col, ao);
        layer.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      } else {
        this.quad([x + c1 * r, y, z + s1 * r], [x + c0 * r, y, z + s0 * r], [x + c0 * r2, y + h, z + s0 * r2], [x + c1 * r2, y + h, z + s1 * r2], color, ao);
      }
      if (r2 > 0.001 && opts?.cap !== false) {
        this.tri([x, y + h, z], [x + c1 * r2, y + h, z + s1 * r2], [x + c0 * r2, y + h, z + s0 * r2], opts?.top ?? color);
      }
    }
    return this;
  }

  cone(x, y, z, r, h, color, opts) {
    return this.cyl(x, y, z, r, h, color, { ...opts, r2: 0, smooth: opts?.smooth ?? false });
  }

  /** A faceted ball (tree crowns, domes, tanks). `sy` squashes it vertically. */
  ball(x, y, z, r, color, opts) {
    const seg = opts?.seg ?? 7;
    const rings = opts?.rings ?? 4;
    const sy = opts?.sy ?? 1;
    const half = opts?.half ?? false; // upper half only: a dome
    const top = half ? Math.PI / 2 : Math.PI;
    const p = (i, j) => {
      const phi = (j / rings) * top; // 0 = top
      const th = (i / seg) * TAU;
      return [x + Math.sin(phi) * Math.cos(th) * r, y + Math.cos(phi) * r * sy, z + Math.sin(phi) * Math.sin(th) * r];
    };
    for (let j = 0; j < rings; j++) {
      const k = 1 - 0.16 * (j / rings); // lower facets a touch darker
      for (let i = 0; i < seg; i++) {
        const a = p(i, j);
        const b2 = p(i + 1, j);
        const c = p(i + 1, j + 1);
        const d = p(i, j + 1);
        const tone = shade(color, k);
        if (j === 0) this.tri(a, c, d, tone);
        else if (j === rings - 1 && !half) this.tri(a, b2, d, tone);
        else this.quad(c, d, a, b2, tone);
      }
    }
    return this;
  }

  /**
   * A house body with a pitched roof. The ridge runs along `axis` ('x' or 'z').
   * opts: axis, over (roof overhang), ao
   */
  gable(x, y, z, w, d, wallH, roofH, wall, roof, opts) {
    if (opts?.ry) return this.at(x, y, z, opts.ry, () => this.gable(0, 0, 0, w, d, wallH, roofH, wall, roof, { ...opts, ry: 0 }));
    if (opts?.axis === 'z') {
      return this.at(x, y, z, Math.PI / 2, () => this.gable(0, 0, 0, d, w, wallH, roofH, wall, roof, { ...opts, axis: 'x' }));
    }
    const over = opts?.over ?? 0.08;
    const ao = opts?.ao ?? 0.86;
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    const y1 = y + wallH;
    const y2 = y1 + roofH;
    if (wallH > 0) {
      this.quad([x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1], wall, ao);
      this.quad([x1, y, z0], [x0, y, z0], [x0, y1, z0], [x1, y1, z0], wall, ao);
      this.quad([x1, y, z1], [x1, y, z0], [x1, y1, z0], [x1, y1, z1], wall, ao);
      this.quad([x0, y, z0], [x0, y, z1], [x0, y1, z1], [x0, y1, z0], wall, ao);
    }
    // gable ends
    this.tri([x1, y1, z1], [x1, y1, z0], [x1, y2, z], wall);
    this.tri([x0, y1, z0], [x0, y1, z1], [x0, y2, z], wall);
    // slopes (with a small overhang)
    const ex0 = x0 - over;
    const ex1 = x1 + over;
    const drop = (over * roofH) / (d / 2);
    this.quad([ex0, y1 - drop, z1 + over], [ex1, y1 - drop, z1 + over], [ex1, y2, z], [ex0, y2, z], roof);
    this.quad([ex1, y1 - drop, z0 - over], [ex0, y1 - drop, z0 - over], [ex0, y2, z], [ex1, y2, z], shade(roof, 0.93));
    return this;
  }

  /** A hipped (four-sided) roof on height `y`; `ridge` > 0 keeps a ridge along x. */
  hip(x, y, z, w, d, h, color, ridge = 0) {
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    const rx = Math.min(ridge, w) / 2;
    const top = y + h;
    if (rx > 0.001) {
      this.quad([x0, y, z1], [x1, y, z1], [x + rx, top, z], [x - rx, top, z], color);
      this.quad([x1, y, z0], [x0, y, z0], [x - rx, top, z], [x + rx, top, z], shade(color, 0.93));
      this.tri([x1, y, z1], [x1, y, z0], [x + rx, top, z], shade(color, 0.97));
      this.tri([x0, y, z0], [x0, y, z1], [x - rx, top, z], shade(color, 0.9));
    } else {
      this.tri([x0, y, z1], [x1, y, z1], [x, top, z], color);
      this.tri([x1, y, z0], [x0, y, z0], [x, top, z], shade(color, 0.93));
      this.tri([x1, y, z1], [x1, y, z0], [x, top, z], shade(color, 0.97));
      this.tri([x0, y, z0], [x0, y, z1], [x, top, z], shade(color, 0.9));
    }
    return this;
  }

  /**
   * A wedge: full height `h` at the back (−z), sloping down to `h2` at the
   * front (+z). Sawtooth roofs, awnings, ramps, lean-to roofs.
   */
  wedge(x, y, z, w, h, d, color, opts) {
    if (opts?.ry) return this.at(x, y, z, opts.ry, () => this.wedge(0, 0, 0, w, h, d, color, { ...opts, ry: 0 }));
    const h2 = opts?.h2 ?? 0;
    const top = opts?.top ?? color;
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    this.quad([x1, y, z0], [x0, y, z0], [x0, y + h, z0], [x1, y + h, z0], color, 0.9); // back
    this.quad([x0, y + h2, z1], [x1, y + h2, z1], [x1, y + h, z0], [x0, y + h, z0], top); // slope
    if (h2 > 0) this.quad([x0, y, z1], [x1, y, z1], [x1, y + h2, z1], [x0, y + h2, z1], color, 0.9);
    this.quad([x1, y, z1], [x1, y, z0], [x1, y + h, z0], [x1, y + h2, z1], color); // right
    this.quad([x0, y, z0], [x0, y, z1], [x0, y + h2, z1], [x0, y + h, z0], color); // left
    return this;
  }

  /**
   * A grid of windows on a wall. The wall is the vertical plane through
   * (x, z) whose outside faces the angle `ry` (0 = front/+z, π/2 = right/+x).
   * `width` × `height` is the glazed area; y is its lower edge.
   * opts: color (glass by day), lit (share of windows glowing at night),
   *       gapX/gapY (share of each cell left as wall), glow (night colour)
   */
  windows(x, y, z, ry, width, height, cols, rows, opts) {
    const gapX = opts?.gapX ?? 0.34;
    const gapY = opts?.gapY ?? 0.4;
    const color = opts?.color ?? 0x3d5566;
    const lit = opts?.lit ?? 0.45;
    const glow = opts?.glow ?? 0xffd98a;
    const cw = width / cols;
    const ch = height / rows;
    const solid = this.cur;
    const glowLayer = this.night ? this._layer('glow') : null;
    this.at(x, y, z, ry, () => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = -width / 2 + (c + 0.5) * cw;
          const x0 = cx - (cw * (1 - gapX)) / 2;
          const x1 = cx + (cw * (1 - gapX)) / 2;
          const y0 = r * ch + (ch * gapY) / 2;
          const y1 = (r + 1) * ch - (ch * gapY) / 2;
          this.quad([x0, y0, 0.012], [x1, y0, 0.012], [x1, y1, 0.012], [x0, y1, 0.012], color, 1, solid);
          if (glowLayer && this.rand() < lit) {
            const tone = this.rand() < 0.25 ? shade(glow, 0.8) : glow;
            this.quad([x0, y0, 0.02], [x1, y0, 0.02], [x1, y1, 0.02], [x0, y1, 0.02], tone, 1, glowLayer);
          }
        }
      }
    });
    return this;
  }

  /**
   * A box with windows — the workhorse of every building.
   * opts.win: { cols, rows, faces ('fblr' = front, back, left, right), margin, base, … windows() options }
   * `cols`/`rows` may be left out: then they follow from the size (one bay ≈ 0.55, one storey ≈ 0.6).
   */
  block(x, y, z, w, h, d, color, opts) {
    if (opts?.ry) return this.at(x, y, z, opts.ry, () => this.block(0, 0, 0, w, h, d, color, { ...opts, ry: 0 }));
    this.box(x, y, z, w, h, d, color, opts);
    const win = opts?.win;
    if (!win) return this;
    const faces = win.faces ?? 'fblr';
    const margin = win.margin ?? 0.12;
    const base = win.base ?? 0.1;
    const rows = win.rows ?? Math.max(1, Math.round((h - base) / 0.6));
    const usable = h - base - (win.cap ?? 0.06);
    const side = (len) => win.cols ?? Math.max(1, Math.round((len - margin * 2) / (win.bay ?? 0.55)));
    if (faces.includes('f')) this.windows(x, y + base, z + d / 2, 0, w - margin * 2, usable, side(w), rows, win);
    if (faces.includes('b')) this.windows(x, y + base, z - d / 2, Math.PI, w - margin * 2, usable, side(w), rows, win);
    if (faces.includes('r')) this.windows(x + w / 2, y + base, z, Math.PI / 2, d - margin * 2, usable, win.colsSide ?? side(d), rows, win);
    if (faces.includes('l')) this.windows(x - w / 2, y + base, z, -Math.PI / 2, d - margin * 2, usable, win.colsSide ?? side(d), rows, win);
    return this;
  }

  /** A sign or lamp that glows at night (and is an ordinary coloured box by day). */
  lamp(x, y, z, w, h, d, color, glow = color) {
    this.box(x, y, z, w, h, d, color, { ao: 1 });
    if (this.night) {
      const keep = this.cur;
      this.cur = this._layer('glow');
      this.box(x, y - 0.004, z, w + 0.012, h + 0.008, d + 0.012, glow, { ao: 1 });
      this.cur = keep;
    }
    return this;
  }

  /**
   * The pool of light a lamp throws on the ground: bright in the middle,
   * fading to nothing at the rim. It goes to the `pool` layer, which is
   * drawn at night only and added to whatever lies underneath.
   */
  pool(x, y, z, r, color = 0xffc98a, seg = 10) {
    if (!this.night) return this;
    const layer = this._layer('pool');
    const centre = [x, y, z];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU;
      const a1 = ((i + 1) / seg) * TAU;
      // rim, rim, centre, centre: the two first corners (the rim) are shaded to black
      this.quad([x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], centre, centre, color, 0, layer);
    }
    return this;
  }

  // --- output ------------------------------------------------------------------------

  /** Number of triangles added so far (all layers). */
  get triangles() {
    let n = 0;
    for (const layer of this.layers.values()) n += layer.idx.length / 3;
    return n;
  }

  /** BufferGeometries by layer name (empty layers are left out). */
  build() {
    const out = {};
    for (const [name, layer] of this.layers) {
      if (!layer.count) continue;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(layer.pos), 3));
      g.setAttribute('normal', new BufferAttribute(new Int8Array(layer.nor), 3, true));
      g.setAttribute('color', new BufferAttribute(new Uint8Array(layer.col), 3, true));
      g.setIndex(layer.count > 65535 ? new BufferAttribute(new Uint32Array(layer.idx), 1) : new BufferAttribute(new Uint16Array(layer.idx), 1));
      g.computeBoundingBox();
      g.computeBoundingSphere();
      out[name] = g;
    }
    return out;
  }
}
