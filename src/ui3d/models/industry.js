// Industry and research: factory, research centre.

import { C } from '../palette.js';
import { mix, shade } from '../kit.js';
import { PLOT, registerModel } from './index.js';
import { HALF, ac, bush, car, chimney, container, crates, dock, fence, flag, hedge, lamp, lorry, pine, tree, truck } from './props.js';
import { skylights, solar } from './retail.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Bits both models are built from
// ---------------------------------------------------------------------------

/**
 * Both models are laid out for a plot of 10 × 5 and spread out on a bigger
 * one; on a smaller plot they are drawn at a smaller scale instead. `draw`
 * gets the plot to lay out for; the scale comes back, for whatever the model
 * hands on in its own coordinates.
 */
function onPlot(b, lot, draw) {
  const edge = 0.1; // the strip left free round the model, which is not to shrink with it
  const k = Math.min(1, (lot.w - edge) / (10 - edge), (lot.d - edge) / (5 - edge));
  b.at(0, 0, 0, 0, () => draw({ w: (lot.w - edge) / k + edge, d: (lot.d - edge) / k + edge }), k);
  return k;
}

/**
 * A girder from point `p` to point `q` (the middle of its underside), `w` wide
 * and `h` high: conveyor galleries, sloping pipes, struts. Not for upright ones.
 */
function beam(b, p, q, w, h, color, top = color) {
  const dx = q[0] - p[0];
  const dz = q[2] - p[2];
  const len = Math.hypot(dx, dz) || 1;
  const sx = ((dz / len) * w) / 2; // half the width, square to the run
  const sz = ((-dx / len) * w) / 2;
  const at = (o, side, up) => [o[0] + side * sx, o[1] + up * h, o[2] + side * sz];
  b.quad(at(q, 1, 0), at(p, 1, 0), at(p, 1, 1), at(q, 1, 1), color, 0.9);
  b.quad(at(p, -1, 0), at(q, -1, 0), at(q, -1, 1), at(p, -1, 1), color, 0.9);
  b.quad(at(p, 1, 1), at(p, -1, 1), at(q, -1, 1), at(q, 1, 1), top);
  b.quad(at(p, -1, 0), at(p, 1, 0), at(q, 1, 0), at(q, -1, 0), shade(color, 0.8));
  b.quad(at(p, 1, 0), at(p, -1, 0), at(p, -1, 1), at(p, 1, 1), color);
  b.quad(at(q, -1, 0), at(q, 1, 0), at(q, 1, 1), at(q, -1, 1), color);
}

/** A storage tank standing on height `y`, one band in the owner's colour; `cone` makes it a silo. */
function tank(b, x, y, z, r, h, color, band, cone = false) {
  b.cyl(x, y, z, r, h, color, { seg: 10, cap: false });
  b.cyl(x, y + h * 0.6, z, r + 0.014, h * 0.15, band, { seg: 10, cap: false, ao: 1 });
  if (cone) b.cone(x, y + h, z, r * 1.04, r * 0.7, shade(color, 0.9), { seg: 10 });
  else b.ball(x, y + h, z, r, shade(color, 0.95), { seg: 10, rings: 2, half: true, sy: 0.42 });
}

/** A flat roof on walls that end at height `y`: a slab with a rim, the roofing set into it. Returns the height to stand things on. */
function flatRoof(b, x, y, z, w, d, rim = C.white, color = C.roofFlat) {
  b.box(x, y - 0.02, z, w + 0.1, 0.12, d + 0.1, rim, { ao: 1 });
  b.plane(x, y + 0.104, z, w - 0.08, d - 0.08, color);
  return y + 0.1;
}

/**
 * Light behind glazing that is drawn elsewhere: `cols` × `rows` bays on the
 * wall through (x, z) facing `ry`, a share of them lit at night. `head` is
 * what each row leaves dark at its top (a floor slab, a lintel).
 */
function lights(b, x, y, z, ry, w, h, cols, rows, lit = 0.5, glow = C.lampCool, head = 0.03) {
  if (!b.night) return;
  const cw = w / cols;
  const ch = h / rows;
  b.layer('glow').at(x, y, z, ry, () => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (b.rand() >= lit) continue;
        const x0 = -w / 2 + c * cw + 0.02;
        const x1 = x0 + cw - 0.04;
        const y0 = r * ch + 0.03;
        const y1 = (r + 1) * ch - head;
        b.quad([x0, y0, 0.022], [x1, y0, 0.022], [x1, y1, 0.022], [x0, y1, 0.022], b.rand() < 0.3 ? shade(glow, 0.8) : glow);
      }
    }
  });
  b.layer('solid');
}

/** A ribbon window: one long pane on the wall through (x, z) facing `ry`, some of its `bays` lit at night. */
function ribbon(b, x, y, z, ry, w, h, bays, lit = 0.5, color = C.glass) {
  b.layer('glass').at(x, y, z, ry, () => b.quad([-w / 2, 0, 0.012], [w / 2, 0, 0.012], [w / 2, h, 0.012], [-w / 2, h, 0.012], color));
  b.layer('solid');
  lights(b, x, y, z, ry, w, h, bays, 1, lit);
}

// ---------------------------------------------------------------------------
// Factory: brick and panel halls under north-light roofs, chimneys, silos and
// tanks banded in the owner's colour, a yard with loading docks behind a fence.
//   level 1  the old brick hall with its boiler house and one chimney
//   level 2  a second, taller hall with the docks, two silos, lorries
//   level 3  a third (dispatch) hall, a tall boiler house with three stacks,
//            a tank farm piped to it over the yard road, a conveyor climbing
//            to three silos
// ---------------------------------------------------------------------------

/**
 * A north-light roof: `n` teeth side by side along x, each a glazed upright
 * looking right (+x) and a slope falling left, with a capping along the ridge
 * (which is what tells the teeth apart when only the slopes are in view).
 */
function sawtooth(b, x, y, z, w, d, n, h, wall, roof, cap, lit) {
  const tw = w / n;
  const panes = Math.max(2, Math.round(d / 0.55));
  const len = Math.hypot(tw, h);
  const up = (0.014 * tw) / len; // the capping lies this far off the slope
  const out = (0.014 * h) / len;
  for (let i = 0; i < n; i++) {
    const tx = x - w / 2 + (i + 0.5) * tw;
    // in this frame +x runs along the ridge and the upright is at the back (−z)
    b.at(tx, y, z, -HALF, () => {
      b.wedge(0, 0, 0, d, h, tw, wall, { top: roof });
      const z0 = -tw / 2 + out;
      b.quad([-d / 2, h * 0.86 + up, z0 + tw * 0.14], [d / 2, h * 0.86 + up, z0 + tw * 0.14], [d / 2, h + up, z0], [-d / 2, h + up, z0], cap);
    });
    b.layer('glass').windows(tx + tw / 2, y + 0.05, z, HALF, d - 0.14, h - 0.1, panes, 1, { color: C.glassLight, gapX: 0.1, gapY: 0, lit, glow: C.lampWarm });
    b.layer('solid');
  }
}

/** A production hall on the yard (its floor at 0.04): walls `h` high, a plinth, an eaves course and the sawtooth roof. */
function hall(b, x, z, w, d, h, wall, roof, cap, lit) {
  b.box(x, 0.04, z, w, h, d, wall);
  b.box(x, 0.04, z, w + 0.05, 0.14, d + 0.05, C.concreteDark, { ao: 0.9 });
  b.box(x, h - 0.06, z, w + 0.05, 0.08, d + 0.05, shade(wall, 0.84), { ao: 1 });
  sawtooth(b, x, 0.04 + h, z, w, d, Math.max(2, Math.round(w / 0.64)), 0.36, wall, roof, cap, lit);
}

/** A chimney (see props) that wears a ring of red warning light at night; returns where its smoke starts. */
function stack(b, x, y, z, r, h, color) {
  const top = chimney(b, x, y, z, r, h, color);
  if (b.night) b.layer('glow').cyl(x, y + h - 0.12, z, r * 0.78, 0.07, C.lampRed, { seg: 8, cap: false }).layer('solid');
  return top;
}

registerModel(
  'factory',
  (b, { level, color, lot: plot }) => {
    const smoke = [];
    const k = onPlot(b, plot, (lot) => {
      const u = lot.w / 10; // how far apart things stand …
      const v = lot.d / 5;
      const su = Math.min(u, 1.3); // … and how big they are: buildings grow less than the plot
      const sv = Math.min(v, 1.3);
      const xl = -lot.w / 2 + 0.15;
      const xr = lot.w / 2 - 0.15;
      const zb = -lot.d / 2 + 0.15;
      const zs = lot.d / 2 - 0.26; // the fence along the street
      const gate = [-0.95 * u, 0.25 * u]; // … and the gap in it
      const win = { color: C.glass, gapX: 0.4, gapY: 0, lit: 0.55 };

      // The old hall in the middle of the plot: everything else grows round it
      const aw = 3.2 * su;
      const ad = 2.2 * sv;
      const ah = 1.15;
      const ar = aw / 2; // its right wall
      const az = zb + ad / 2;
      const af = zb + ad; // its front wall

      // --- ground: asphalt where lorries turn, grass on the land kept for later, a kerb with a gap at the gate
      const p0 = level === 1 ? -ar - 0.7 * u : -lot.w / 2 + 0.06;
      const p1 = level === 1 ? xr - 0.95 * u : lot.w / 2 - 0.06;
      b.box((p0 + p1) / 2, 0, -0.01, p1 - p0, 0.04, lot.d - 0.12, C.asphalt, { ao: 1 });
      if (level === 1) {
        b.box((-lot.w / 2 + 0.06 + p0) / 2, 0, -0.01, p0 + lot.w / 2 - 0.06, 0.05, lot.d - 0.12, C.grass, { ao: 1 });
        b.box((lot.w / 2 - 0.06 + p1) / 2, 0, -0.01, lot.w / 2 - 0.06 - p1, 0.05, lot.d - 0.12, C.grass, { ao: 1 });
      }
      b.box((-lot.w / 2 + 0.05 + gate[0]) / 2, 0, lot.d / 2 - 0.12, gate[0] + lot.w / 2 - 0.05, 0.07, 0.14, C.curb, { ao: 1 });
      b.box((lot.w / 2 - 0.05 + gate[1]) / 2, 0, lot.d / 2 - 0.12, lot.w / 2 - 0.05 - gate[1], 0.07, 0.14, C.curb, { ao: 1 });

      // --- hall A: brick under a dark roof; the sign band in the owner's colour runs along its front and round the corner
      hall(b, 0, az, aw, ad, ah, C.brick, C.roofDark, C.roofFlat, 0.75);
      const band = ah - 0.34;
      b.box(0, band, af + 0.02, aw + 0.1, 0.28, 0.08, color, { ao: 1 });
      b.box(ar + 0.02, band, af - 0.38, 0.08, 0.28, 0.8, color, { ao: 1 });
      b.lamp(0, band + 0.04, af + 0.065, aw * 0.34, 0.2, 0.02, C.white, C.lampCool); // the name on it
      b.box(0, 0.04, af + 0.02, 0.9, 0.74, 0.05, C.steelDark, { ao: 1 }); // the big door under a lintel
      b.box(0, 0.78, af + 0.02, 1.0, 0.05, 0.07, C.concrete, { ao: 1 });
      b.pool(0, 0.075, af + 0.75, 1.0, C.lampWarm, 8);
      for (const s of [-1, 1]) b.windows(s * aw * 0.31, 0.36, af, 0, aw * 0.3, 0.4, 3, 1, win);
      b.windows(0, 0.4, zb, Math.PI, aw - 0.4, 0.42, Math.round(aw / 0.55), 1, win);
      b.windows(ar, 0.4, af - ad * 0.22, HALF, ad * 0.36, 0.38, 2, 1, win);
      if (level === 1) b.windows(-ar, 0.4, az, -HALF, ad - 0.4, 0.42, 4, 1, win);

      if (level < 3) {
        // --- right of it: the boiler house under a lean-to roof, its flue and chimney
        const bw = 1.0 * su;
        const bd = 1.1 * sv;
        const bx = ar + bw / 2 - 0.05;
        const bz = zb + 0.05 + bd / 2;
        b.box(bx, 0.04, bz, bw, 0.8, bd, C.brick);
        b.wedge(bx, 0.84, bz, bd + 0.08, 0.3, bw + 0.1, C.brick, { ry: HALF, top: C.roofDark, h2: 0.05 });
        b.box(bx + 0.1, 0.04, bz + bd / 2 + 0.005, 0.3, 0.5, 0.04, C.steelDark, { ao: 1 });
        b.windows(bx + bw / 2, 0.36, bz, HALF, bd - 0.3, 0.3, 2, 1, win);
        const cx = bx + bw / 2 + 0.45;
        const cz = zb + 0.5;
        b.box(cx, 0.04, cz, 0.62, 0.3, 0.62, C.brickDark);
        b.box((bx + bw / 2 + cx) / 2, 0.42, cz, cx - bx - bw / 2, 0.18, 0.18, C.steelDark, { ao: 1 });
        smoke.push(stack(b, cx, 0.34, cz, 0.24, 2.9 + level * 0.3));
      } else {
        // --- … which grows into a tall boiler house: long windows, plant on the roof, a steel stack
        const qw = 1.5 * su;
        const qd = 1.4 * sv;
        const qh = 1.7;
        const qx = ar + qw / 2 - 0.05;
        const qz = zb + 0.04 + qd / 2;
        const qf = qz + qd / 2;
        b.box(qx, 0.04, qz, qw, qh, qd, C.brickDark);
        b.box(qx, 0.04, qz, qw + 0.05, 0.14, qd + 0.05, C.concreteDark, { ao: 0.9 });
        const roof = flatRoof(b, qx, 0.04 + qh, qz, qw, qd, C.concrete);
        const tall = { ...win, gapX: 0.5, lit: 0.8 };
        b.windows(qx + 0.12, 0.62, qf, 0, qw - 0.5, 0.92, 3, 1, tall);
        b.windows(qx + qw / 2, 0.62, qz + 0.14, HALF, qd - 0.5, 0.92, 3, 1, tall);
        b.windows(qx, 0.62, qz - qd / 2, Math.PI, qw - 0.3, 0.92, 4, 1, tall);
        b.box(qx - qw * 0.3, 0.04, qf + 0.02, 0.3, 0.5, 0.04, C.steelDark, { ao: 1 });
        b.box(qx + qw / 2 + 0.035, 0.18, qz - qd * 0.36, 0.07, qh - 0.2, 0.07, C.steel, { ao: 1 }); // a riser up the wall
        b.cyl(qx + qw * 0.22, roof, qz - qd * 0.2, 0.05, 0.22, C.steel, { seg: 6, r2: 0.17 }); // a cyclone and its duct
        b.cyl(qx + qw * 0.22, roof + 0.22, qz - qd * 0.2, 0.17, 0.26, C.steel, { seg: 6, top: C.steelDark });
        b.box(qx + qw * 0.22, roof + 0.3, qz + qd * 0.1, 0.1, 0.1, qd * 0.5, C.steel, { ao: 1 });
        const tx = qx - qw * 0.25;
        const tz = qz - qd * 0.15;
        b.cyl(tx, roof, tz, 0.085, 1.4, C.steel, { seg: 6, r2: 0.07, top: C.dark });
        b.cyl(tx, roof + 1.1, tz, 0.09, 0.1, C.red, { seg: 6, cap: false, ao: 1 });
        smoke.push([tx, roof + 1.5, tz]);
        // two brick chimneys beside it, a flue to each
        const cx = qx + qw / 2 + 0.45;
        for (const [i, cz] of [zb + 0.38, zb + 1.08 * sv].entries()) {
          b.box(cx, 0.04, cz, 0.6, 0.3, 0.6, C.brickDark);
          b.box(cx - 0.24, 0.62, cz, 0.5, 0.2, 0.2, C.steelDark, { ao: 1 });
          smoke.push(stack(b, cx, 0.34, cz, 0.25 - i * 0.03, 3.9 - i * 0.55));
        }

        // --- the tank farm on its pad, piped to the boiler house on a bridge over the yard road
        const fx = 2.8 * u;
        const fz = 0.95 * v;
        b.box(fx, 0.04, fz, 1.9, 0.1, 1.7, C.concreteDark, { top: C.concrete, ao: 1 });
        for (const s of [-1, 1]) for (const t of [-1, 1]) tank(b, fx + s * 0.47, 0.14, fz + t * 0.42, 0.37, 0.88, C.white, color);
        const by = 1.36;
        const z0 = fz - 0.72;
        const px = Math.min(fx, qx + qw / 2 - 0.2); // where the pipes meet the wall
        b.box(fx, 0.14, z0, 0.08, by - 0.07, 0.08, C.steel, { ao: 1 });
        if (fx > px) b.box((fx + px) / 2, by, z0, fx - px + 0.2, 0.07, 0.07, C.steel, { ao: 1 });
        b.box(px - 0.06, by, (z0 + qf) / 2, 0.07, 0.07, z0 - qf, C.steel, { ao: 1 });
        b.box(px + 0.07, by, (z0 + qf) / 2, 0.06, 0.06, z0 - qf, C.white, { ao: 1 });
        for (const pz of [z0 - 0.3, qf + 0.2]) {
          b.box(px + 0.24, 0.04, pz, 0.06, by - 0.04, 0.06, C.steelDark, { ao: 1 }); // trestles
          b.box(px + 0.03, by - 0.05, pz, 0.48, 0.05, 0.06, C.steelDark, { ao: 1 });
        }
      }

      if (level >= 2) {
        // --- silos along the right edge under a gallery; at level 3 a conveyor climbs to it from an intake by the street
        const sx = xr - 0.5;
        const s0 = zb + 0.42;
        const s1 = s0 + (level - 1) * 0.74 * sv;
        const top = 0.04 + 1.65 + 0.21;
        for (let i = 0; i < level; i++) tank(b, sx, 0.04, s0 + i * 0.74 * sv, 0.35, 1.65, C.panel, color, true);
        b.box(sx, top, (s0 + s1) / 2, 0.24, 0.18, s1 - s0 + 0.4, C.panelDark, { top: C.steelDark, ao: 1 });
        if (level === 3) {
          const iz = Math.min(zs - 0.42, s1 + 2.4);
          b.box(sx, 0.04, iz, 0.6, 0.48, 0.56, C.panelDark, { top: C.steelDark });
          beam(b, [sx, 0.4, iz - 0.1], [sx, top, s1 + 0.2], 0.22, 0.18, C.steel, C.steelDark);
          b.box(sx, top - 0.06, s1 + 0.24, 0.34, 0.32, 0.3, C.panelDark, { top: C.steelDark, ao: 1 }); // the head of the conveyor
          const mz = (iz - 0.1 + s1 + 0.2) / 2;
          b.box(sx, 0.04, mz, 0.07, (0.4 + top) / 2 - 0.04, 0.07, C.steelDark, { ao: 1 });
        }

        // --- hall B on the left: panel walls, taller, a stripe in the owner's colour, the loading docks
        const bw = -ar - 0.15 - xl;
        const bd = 2.0 * sv;
        const bh = 1.4;
        const bx = (xl - ar - 0.15) / 2;
        const bf = zb + bd;
        hall(b, bx, zb + bd / 2, bw, bd, bh, C.panel, C.roofLight, C.roofGrey, 0.85);
        b.box(bx, bh - 0.52, bf + 0.01, bw + 0.06, 0.08, 0.06, color, { ao: 1 });
        const high = { ...win, gapX: 0.3 };
        b.windows(bx, bh - 0.36, bf, 0, bw - 0.3, 0.22, 8, 1, high);
        b.windows(bx, bh - 0.36, zb, Math.PI, bw - 0.3, 0.22, 8, 1, high);
        b.windows(xl, bh - 0.36, zb + bd / 2, -HALF, bd - 0.3, 0.22, 5, 1, high);
        b.box(bx + bw * 0.36, 0.04, bf + 0.02, 0.28, 0.5, 0.04, C.steelDark, { ao: 1 });
        if (level === 2) {
          b.plane(bx - 0.45, 0.047, bf + 0.9, 2.3, 1.8, C.concreteDark); // apron before the docks
          dock(b, bx - 0.9, bf, 0, 0.7);
          dock(b, bx, bf, 0, 0.7);
          b.pool(bx - 0.45, 0.075, bf + 0.7, 1.2, C.lampWarm, 8);
          truck(b, bx, bf + 1.02, 0, color);
        } else {
          // --- hall C before it: the dispatch hall, its docks on the yard side, a lorry at one of them
          const cw = 1.9 * su;
          const cd = 1.8 * sv;
          const cx = xl + cw / 2;
          const cz = bf + 0.05 + cd / 2;
          const cr = xl + cw;
          hall(b, cx, cz, cw, cd, 0.85, C.panel, C.roofLight, C.roofGrey, 0.85);
          b.box(cx, 0.52, cz, cw + 0.06, 0.07, cd + 0.06, color, { ao: 1 });
          b.windows(cx, 0.24, cz + cd / 2, 0, cw - 0.4, 0.22, 3, 1, win);
          b.windows(xl, 0.24, cz, -HALF, cd - 0.4, 0.22, 3, 1, win);
          b.plane(cr + 1.25, 0.047, cz, 2.5, cd, C.concreteDark);
          for (const s of [-1, 1]) dock(b, cr, cz + s * 0.42, HALF, 0.6);
          lorry(b, cr + 1.41, cz + 0.42, HALF, C.plasterCool);
        }
      }

      // --- by the street: the gatehouse left of the gate, the barrier, fence, flag and a lamp
      const gx = gate[0] - 0.47;
      const gz = zs - 0.32;
      const span = gate[1] - gate[0];
      b.block(gx, 0.04, gz, 0.7, 0.5, 0.5, C.plaster, { win: { cols: 2, colsSide: 1, rows: 1, base: 0.2, cap: 0.08, faces: 'flr', gapX: 0.2, gapY: 0, lit: 1 } });
      b.box(gx, 0.54, gz, 0.86, 0.06, 0.66, C.roofDark, { ao: 1 });
      for (const x of [gate[0] - 0.04, gate[1] + 0.04]) b.box(x, 0.04, zs, 0.08, 0.36, 0.08, C.steelDark, { ao: 1 });
      b.box(gate[0] + span * 0.38, 0.32, zs, span * 0.76, 0.04, 0.04, C.white, { ao: 1 }); // the barrier, red at its tip
      b.box(gate[0] + span * 0.84, 0.32, zs, span * 0.16, 0.04, 0.04, C.red, { ao: 1 });
      b.plane((gate[0] + gate[1]) / 2, 0.047, zs - 0.6, span - 0.2, 0.07, C.marking); // stop line
      fence(b, xl - 0.05, zs, gx - 0.4, zs, C.steelDark, 0.32);
      fence(b, gate[1] + 0.08, zs, xr + 0.05, zs, C.steelDark, 0.32);
      flag(b, gate[1] + 0.45, zs - 0.3, color, 1.6);
      lamp(b, gx - 0.55, zs - 0.2, Math.PI);

      // --- in the yard
      if (level === 1) {
        truck(b, 0, af + 1.1, 0, color);
        crates(b, 1.0 * u, af + 0.3, 2);
        crates(b, 1.38 * u, af + 0.34, 1);
        crates(b, 2.9 * u, 0.3 * v, 2);
        container(b, 3.3 * u, 0.04, 1.0 * v, 0.2, C.orange);
        tree(b, -3.9 * u, 1.3 * v, 0.95);
        tree(b, -3.2 * u, -1.2 * v, 0.8);
        bush(b, -4.4 * u, -0.2 * v);
        bush(b, -2.8 * u, 1.6 * v);
        pine(b, 4.4 * u, -1.5 * v, 0.9);
        bush(b, 4.3 * u, 1.3 * v);
      } else if (level === 2) {
        lorry(b, -1.5 * u, 0.75 * v, HALF - 0.25, C.plasterCool);
        container(b, 2.7 * u, 0.04, 1.3 * v, HALF, C.orange);
        container(b, 2.7 * u, 0.04, 0.72 * v, HALF, color);
        crates(b, 1.5 * u, 0.2 * v, 2);
        crates(b, 3.8 * u, 0.5 * v, 2);
        tree(b, 4.3 * u, 1.6 * v, 0.8);
      } else {
        container(b, xl + 0.75, 0.04, zs - 0.36, HALF, C.orange);
        container(b, xl + 2.1, 0.04, zs - 0.36, HALF, C.green);
        container(b, xl + 0.85, 0.54, zs - 0.36, HALF, color);
        truck(b, 0, af + 1.1, 0, color);
      }
    });
    return { smoke: smoke.map((p) => p.map((c) => c * k)) };
  },
  { lot: PLOT.industrial },
);

// ---------------------------------------------------------------------------
// Research centre: a white campus on a mown lawn. The buildings stand in an L
// round a court that opens to the street; the owner's colour is on the sign,
// the stripe under the roofs, the flags and the crown of the tower.
//   level 1  a two-storey pavilion of ribbon windows, a radome and a mast
//   level 2  a clean-room wing on a glazed link, an observatory dome
//   level 3  a glass atrium tower, a tracking dish, a pond in the court
// ---------------------------------------------------------------------------

/** An observatory dome on height `y`, its shutter slit looking towards `ry` (red light shows in it at night). */
function dome(b, x, y, z, r, color, ry = 0) {
  const seg = 12;
  const rings = 4;
  // The slit runs up the facets between 60° and 90° round the dome, so the dome is turned half a facet back
  b.at(x, y, z, ry - Math.PI / 12, () => {
    b.ball(0, 0, 0, r, color, { seg, rings, half: true });
    const R = r + 0.016;
    const edge = (i, j) => {
      const phi = (j / rings) * HALF;
      const th = (i / seg) * TAU;
      return [Math.sin(phi) * Math.cos(th) * R, Math.cos(phi) * R, Math.sin(phi) * Math.sin(th) * R];
    };
    // a point on ring j, the share f of the way across the facet — so the strip lies flat on it
    const q = (j, f) => {
      const a = edge(2, j);
      const c = edge(3, j);
      return [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] + (c[2] - a[2]) * f];
    };
    const slit = (tone) => {
      b.tri(q(0, 0), q(1, 0.74), q(1, 0.26), tone);
      for (let j = 1; j < rings; j++) b.quad(q(j + 1, 0.74), q(j + 1, 0.26), q(j, 0.26), q(j, 0.74), tone);
    };
    slit(C.glassDark);
    if (b.night) {
      b.layer('glow');
      slit(shade(C.lampRed, 0.5));
      b.layer('solid');
    }
  });
}

/** A dish aerial on a mast: its hub at (x, y, z), `r` its radius, looking towards `ry`, tipped `el` above the horizon. */
function dish(b, x, y, z, r, ry, el, accent) {
  b.at(x, y, z, ry, () => {
    const seg = 10;
    const ay = Math.sin(el);
    const az = Math.cos(el);
    const deep = r * 0.36;
    const on = (t) => [0, t * ay, t * az]; // a point on the axis the dish looks along
    const rim = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU;
      rim.push([Math.cos(a) * r, deep * ay + Math.sin(a) * r * az, deep * az - Math.sin(a) * r * ay]);
    }
    for (let i = 0; i < seg; i++) {
      b.tri(on(deep * 0.3), rim[i], rim[(i + 1) % seg], C.white); // the bowl
      b.tri(on(0), rim[(i + 1) % seg], rim[i], C.panelDark); // its back
    }
    beam(b, on(deep * 0.3), on(r * 0.95), 0.04, 0.04, C.steelDark);
    b.box(0, r * 0.95 * ay - 0.02, r * 0.95 * az, r * 0.2, r * 0.2, r * 0.2, accent, { ao: 1, bottom: true }); // the feed
    b.cyl(0, -y, 0, r * 0.17, y - r * 0.15, C.panelDark, { seg: 6, r2: r * 0.12 });
    b.box(0, -r * 0.22, 0, r * 0.44, r * 0.26, r * 0.34, C.steelDark, { ao: 1 }); // the yoke under the hub
  });
}

/** A roof-top mast with cross-arms and a red light on top. */
function mast(b, x, y, z, h) {
  b.box(x, y, z, 0.035, h, 0.035, C.steelDark, { ao: 1 });
  b.box(x, y + h * 0.55, z, 0.3, 0.025, 0.025, C.steelDark, { ao: 1 });
  b.box(x, y + h * 0.78, z, 0.025, 0.025, 0.22, C.steelDark, { ao: 1 });
  b.lamp(x, y + h, z, 0.05, 0.05, 0.05, C.red, C.lampRed);
}

registerModel(
  'lab',
  (b, { level, color, lot: plot }) => {
    onPlot(b, plot, (lot) => {
      const u = lot.w / 10; // how far apart things stand …
      const v = lot.d / 5;
      const su = Math.min(u, 1.3); // … and how big they are: buildings grow less than the plot
      const sv = Math.min(v, 1.3);
      const xl = -lot.w / 2 + 0.15;
      const xr = lot.w / 2 - 0.15;
      const zb = -lot.d / 2 + 0.15;
      const zs = lot.d / 2 - 0.19; // the back of the kerb
      const G = 0.05; // the lawn everything stands on
      const glass = mix(C.glass, C.glassLight, 0.3);

      // The pavilion at the back: there from the start, the campus grows to both sides of it
      const pw = 3.6 * su;
      const pd = 1.6 * sv;
      const ph = 1.3;
      const px = -0.4 * u;
      const pz = zb + pd / 2;
      const pf = zb + pd; // its front wall
      const ex = px + 0.2 * su; // the entrance, and the path to it from the street
      const ww = 1.5 * su; // the wing, across a link from the pavilion's left end
      const wx = px - pw / 2 - 0.4 * su - ww / 2;

      // The car park by the street on the right
      const bays = 2 + level;
      const cw = bays * 0.56 + 0.3;
      const cx = xr - 0.25 - cw / 2;
      const cz = zs - 0.72;
      const c0 = cz - 0.68; // where its asphalt begins
      const cl = cx - cw / 2;

      // --- ground: lawn, kerb, the car park and the paths
      b.box(0, 0, -0.01, lot.w - 0.12, G, lot.d - 0.12, C.grassLight, { ao: 1 });
      b.box((-lot.w / 2 + 0.05 + cl) / 2, 0, lot.d / 2 - 0.12, cl + lot.w / 2 - 0.05, 0.07, 0.14, C.curb, { ao: 1 });
      b.box((lot.w / 2 - 0.05 + cl + cw) / 2, 0, lot.d / 2 - 0.12, lot.w / 2 - 0.05 - cl - cw, 0.07, 0.14, C.curb, { ao: 1 });
      b.box(cx, 0, (c0 + lot.d / 2 - 0.05) / 2, cw, G + 0.008, lot.d / 2 - 0.05 - c0, C.asphalt, { ao: 1 });
      for (let i = 0; i <= bays; i++) b.plane(cl + 0.15 + i * 0.56, G + 0.016, cz, 0.035, 1.0, C.marking);
      b.at(cl + 0.43, G - 0.02, cz, 0, () => {
        car(b, 0, 0.03, 0, 3);
        if (level >= 2) car(b, (bays - 1) * 0.56, -0.02, Math.PI, 0);
        if (level >= 3) car(b, 1.12, 0, 0, 5);
      });
      b.plane(ex, G + 0.008, (pf + zs) / 2, 0.5, zs - pf, C.pavement); // from the street to the door
      b.plane((ex + 0.25 + cl) / 2, G + 0.008, c0 + 0.2, cl - ex - 0.25, 0.34, C.pavement); // … and from the cars

      // --- the pavilion: two storeys of ribbon windows, the stripe under the roof slab
      b.box(px, G, pz, pw, ph, pd, C.white);
      b.box(px, G, pz, pw + 0.04, 0.1, pd + 0.04, C.concrete, { ao: 0.9 });
      b.box(px, G + ph - 0.14, pz, pw + 0.03, 0.08, pd + 0.03, color, { ao: 1 });
      const roof = flatRoof(b, px, G + ph, pz, pw, pd);
      for (const [i, y] of [G + 0.24, G + 0.82].entries()) {
        ribbon(b, px, y, pf, 0, pw - 0.3, 0.3, 9, 0.5, glass);
        ribbon(b, px, y, zb, Math.PI, pw - 0.3, 0.3, 9, 0.5, glass);
        if (level < 3) ribbon(b, px + pw / 2, y, pz, HALF, pd - 0.3, 0.3, 4, 0.5, glass); // the tower stands here later
        if (level < 2 || i) ribbon(b, px - pw / 2, y, pz, -HALF, pd - 0.3, 0.3, 4, 0.5, glass); // … and the link here
      }
      // entrance: a glazed lobby under a canopy in the owner's colour
      b.box(ex, G, pf + 0.14, 1.0, 0.62, 0.3, C.white, { ao: 1 });
      b.layer('glass').box(ex, G + 0.04, pf + 0.16, 0.86, 0.52, 0.3, C.glassLight, { ao: 0.95 }).layer('solid');
      lights(b, ex, G + 0.04, pf + 0.31, 0, 0.86, 0.52, 3, 1, 1);
      b.box(ex, G + 0.62, pf + 0.24, 1.2, 0.07, 0.62, color, { ao: 1, bottom: true });
      b.lamp(ex, G + 0.69, pf + 0.5, 0.7, 0.14, 0.04, C.white, C.lampCool);
      lamp(b, ex - 0.42, pf + 0.9, HALF);
      // roof: lights over the labs, coolers, a radome; a mast at first, later panels and a small dish
      skylights(b, px - pw * 0.24, roof, pz + 0.05, 2);
      ac(b, px + pw / 2 - 0.4, roof, pz - pd / 2 + 0.35);
      ac(b, px + pw / 2 - 0.85, roof, pz - pd / 2 + 0.35);
      b.cyl(px - pw / 2 + 0.42, roof, pz - 0.35, 0.12, 0.1, C.panelDark, { seg: 8 });
      b.ball(px - pw / 2 + 0.42, roof + 0.3, pz - 0.35, 0.25, C.white, { seg: 8, rings: 4 });
      if (level === 1) mast(b, px + pw * 0.28, roof, pz + 0.2, 1.0);
      else {
        solar(b, px + pw * 0.2, roof, pz + pd * 0.16, 3, 2);
        dish(b, px + pw * 0.02, roof + 0.36, pz - pd * 0.26, 0.26, Math.PI / 4, 0.6, color);
      }

      // --- by the street: the sign in the owner's colour (its light falls on the lawn), hedges
      const sx = ex + 0.95;
      b.box(sx, G, zs - 0.34, 1.0, 0.08, 0.2, C.concrete, { ao: 1 });
      b.lamp(sx, G + 0.08, zs - 0.34, 0.9, 0.3, 0.1, color, shade(color, 1.25));
      b.box(sx, G + 0.19, zs - 0.34, 0.6, 0.07, 0.14, C.white, { ao: 1 });
      b.pool(sx, 0.075, zs - 0.2, 0.75, color, 8);
      hedge(b, xl, zs - 0.12, ex - 0.45, zs - 0.12);
      if (cl - sx > 1.4) hedge(b, sx + 0.7, zs - 0.12, cl - 0.15, zs - 0.12);

      if (level >= 2) {
        // --- the clean-room wing down the left side of the court: few windows, a roof full of plant
        const wd = 3.0 * sv;
        const wh = 0.85;
        const wz = zb + 0.05 + wd / 2;
        const wf = wz + wd / 2;
        b.box(wx, G, wz, ww, wh, wd, C.panel);
        b.box(wx, G, wz, ww + 0.04, 0.1, wd + 0.04, C.concrete, { ao: 0.9 });
        b.box(wx, G + wh - 0.12, wz, ww + 0.03, 0.06, wd + 0.03, color, { ao: 1 });
        const wr = flatRoof(b, wx, G + wh, wz, ww, wd);
        ribbon(b, wx + ww / 2, G + 0.38, wz + 0.45 * sv, HALF, wd - 1.3 * sv, 0.24, 5, 0.7, glass);
        ribbon(b, wx - ww / 2, G + 0.38, wz, -HALF, wd - 0.5, 0.24, 7, 0.7, glass);
        b.box(wx, G, wf + 0.02, 0.7, 0.58, 0.04, C.panelDark, { ao: 1 }); // goods door
        b.box(wx + ww / 2 + 0.02, G, wf - 0.35, 0.04, 0.46, 0.26, C.glassDark, { ao: 1 }); // staff door
        b.box(wx + ww * 0.33, G, wf + 0.26, 0.26, 0.1, 0.26, C.steelDark, { ao: 1 });
        tank(b, wx + ww * 0.33, G + 0.1, wf + 0.26, 0.15, 0.7, C.white, color); // liquid nitrogen
        // the glazed link to the pavilion
        const lx = px - pw / 2 - 0.2 * su;
        b.layer('glass').box(lx, G + 0.06, pz + 0.1, 0.4 * su + 0.1, 0.5, 0.5, C.glassLight, { ao: 0.95 }).layer('solid');
        b.box(lx, G + 0.56, pz + 0.1, 0.4 * su + 0.1, 0.05, 0.56, C.white, { ao: 1 });
        lights(b, lx, G + 0.06, pz + 0.35, 0, 0.4 * su, 0.5, 1, 1, 1);
        // on its roof: fume stacks on a duct, air handling, roof lights
        for (let i = 0; i < 4; i++) b.cyl(wx - ww * 0.26, wr, wz - wd * 0.36 + i * 0.3, 0.055, 0.34, C.panelDark, { seg: 6, top: C.dark });
        b.box(wx - ww * 0.26, wr + 0.04, wz - wd * 0.36 + 0.45, 0.1, 0.1, 1.2, C.steel, { ao: 1 });
        b.box(wx + ww * 0.14, wr, wz - wd * 0.22, 0.5, 0.26, 0.9, C.panelDark, { top: C.steelDark });
        ac(b, wx + ww * 0.14, wr, wz + wd * 0.08);
        skylights(b, wx, wr, wz + wd * 0.3, 2, 0.3, 0.5);

        // --- the observatory in the far corner, a path to it from the cars
        const dr = 0.66;
        const dx = xr - 0.2 - dr;
        const dz = zb + 0.12 + dr;
        b.cyl(dx, G, dz, dr, 0.82, C.white, { seg: 12 });
        b.cyl(dx, G + 0.7, dz, dr + 0.02, 0.09, color, { seg: 12, cap: false, ao: 1 });
        dome(b, dx, G + 0.82, dz, dr, C.panel, Math.PI / 4);
        b.box(dx, G, dz + dr - 0.01, 0.24, 0.42, 0.06, C.steelDark, { ao: 1 });
        b.plane(dx, G + 0.008, (dz + dr + c0) / 2, 0.3, c0 - dz - dr, C.pavement);
        lamp(b, cl + cw - 0.45, c0 + 0.08, -HALF, 1.15);
        for (let i = 0; i < 3; i++) flag(b, ex - 0.8 - i * 0.3, zs - 0.42, color, 1.3 + (i === 1) * 0.15);
      }

      if (level >= 3) {
        // --- the atrium tower: glass between white floor slabs, the owner's colour as its crown
        const tw = 1.4 * su;
        const td = 1.4 * sv;
        const th = 3.4;
        const tx = px + pw / 2 + tw / 2 - 0.05;
        const tz = zb + 0.05 + td / 2;
        b.layer('glass').box(tx, G + 0.1, tz, tw, th - 0.4, td, C.glassLight, { ao: 0.95 }).layer('solid');
        for (let i = 0; i <= 5; i++) b.box(tx, G + i * 0.6, tz, tw + 0.05, 0.1, td + 0.05, C.white, { ao: 1 });
        lights(b, tx, G + 0.1, tz + td / 2, 0, tw - 0.1, 3.0, 3, 5, 0.7, C.lampCool, 0.13);
        lights(b, tx + tw / 2, G + 0.1, tz, HALF, td - 0.1, 3.0, 3, 5, 0.7, C.lampCool, 0.13);
        lights(b, tx, G + 0.1, tz - td / 2, Math.PI, tw - 0.1, 3.0, 3, 5, 0.6, C.lampCool, 0.13);
        lights(b, tx - tw / 2, G + 1.9, tz, -HALF, td - 0.1, 1.2, 3, 2, 0.6, C.lampCool, 0.13);
        b.lamp(tx, G + th - 0.3, tz, tw + 0.07, 0.26, td + 0.07, color, shade(color, 1.25));
        const tr = flatRoof(b, tx, G + th, tz, tw, td);
        b.box(tx - 0.2, tr, tz - 0.2, 0.6, 0.3, 0.6, C.white, { top: C.roofLight }); // lift overrun, the mast on it
        mast(b, tx - 0.2, tr + 0.3, tz - 0.2, 1.0);
        ac(b, tx + 0.36, tr, tz + 0.3);
        b.box(tx, G, tz + td / 2 + 0.13, 0.7, 0.5, 0.3, C.white, { ao: 1 }); // its own door on the court
        b.box(tx, G, tz + td / 2 + 0.29, 0.4, 0.42, 0.02, C.glassDark, { ao: 1 });

        // --- the tracking dish on its pad, looking over the street
        const hx = xl + 0.85;
        const hz = 1.5 * v;
        b.cyl(hx, 0, hz, 0.5, G + 0.02, C.concrete, { seg: 10, ao: 1 });
        dish(b, hx, 0.9, hz, 0.62, Math.PI / 4, 0.7, color);

        // --- the court: a round pond on the way to the door, the firm's sphere in it, benches
        const oz = (pf + zs) / 2 + 0.15;
        b.cyl(ex, 0, oz, 0.82, G + 0.012, C.pavement, { seg: 14, ao: 1 });
        b.cyl(ex, 0, oz, 0.5, G + 0.07, C.white, { seg: 12, ao: 1 });
        b.layer('water').cyl(ex, 0, oz, 0.43, G + 0.085, C.water, { seg: 12, ao: 1 }).layer('solid');
        b.cyl(ex, G, oz, 0.04, 0.42, C.steel, { seg: 5, cap: false });
        b.ball(ex, G + 0.52, oz, 0.16, color, { seg: 8, rings: 4 });
        b.plane((ex - 0.8 + wx + ww / 2) / 2, G + 0.008, oz, ex - 0.8 - wx - ww / 2, 0.3, C.pavement); // to the wing
        for (const s of [-1, 1]) b.box(ex + s * 1.05, G, oz - 0.5, 0.12, 0.1, 0.4, C.wood, { ao: 1 });
      }

      // --- green: fewer trees as the campus fills up
      const tx = Math.min(ex + 1.5, cl - 0.4);
      if (level === 1) {
        tree(b, -3.3 * u, -1.5 * v, 1.0);
        pine(b, -4.2 * u, -0.9 * v, 1.0);
        tree(b, -3.9 * u, 0.9 * v, 0.9);
        bush(b, -2.9 * u, 0.1 * v);
        tree(b, 2.4 * u, -1.6 * v, 0.95);
        pine(b, 3.4 * u, -1.8 * v, 0.9);
        tree(b, 4.1 * u, -0.9 * v, 0.85);
        bush(b, 2.0 * u, -0.5 * v);
        tree(b, tx, zs - 1.1, 0.8);
      } else if (level === 2) {
        pine(b, xl + 0.45, zb + 0.6, 0.9);
        tree(b, -3.9 * u, 1.6 * v, 0.9);
        tree(b, 2.3 * u, -1.5 * v, 0.95);
        bush(b, 1.8 * u, -0.6 * v);
        tree(b, tx, zs - 1.1, 0.8);
        bush(b, -1.9 * u, 0.3 * v);
      } else {
        pine(b, xl + 0.45, zb + 0.6, 0.9);
        tree(b, tx, zs - 1.05, 0.8);
        tree(b, -1.65 * u, 0.15 * v, 0.8);
        bush(b, 4.3 * u, -0.3 * v);
        bush(b, 3.1 * u, -0.2 * v);
        bush(b, -2.3 * u, 1.75 * v);
      }
    });
  },
  { lot: PLOT.industrial },
);
