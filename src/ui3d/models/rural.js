// The countryside: farm, mine, forestry.
//
// A country plot is big (12 × 12) and lies in open grassland, so these models
// draw their own ground as well — fields, yards, tracks, a quarry, a forest
// floor — and most of what the camera sees of them is that ground. The track
// of each reaches the middle of the front edge, where the scene's own track
// from the lane arrives.

import { C } from '../palette.js';
import { mix, shade } from '../kit.js';
import { PLOT, registerModel } from './index.js';
import { HALF, bush, car, chimney, container, crates, fence, flag, hedge, lamp, lorry, pine, pylon, silo, tree } from './props.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Helpers shared by the three models
// ---------------------------------------------------------------------------

/**
 * These scenes are laid out for a plot of 12 × 12 or more; on a smaller one
 * the whole scene is scaled down to fit. `draw(X, Z, e)` gets the half-extents
 * of the ground it may use — a strip 0.1 wide stays free along the plot's
 * edge — and `e`, how far the track may run on into that strip. The scale
 * comes back (smoke points need it).
 */
function onPlot(b, lot, draw) {
  const k = Math.min(1, lot.w / 12, lot.d / 12);
  const free = 0.1 / k;
  b.at(0, 0, 0, 0, () => draw(lot.w / k / 2 - free, lot.d / k / 2 - free, free / 2), k);
  return k;
}

/** A flat patch of ground from corner (x0, z0) to corner (x1, z1), `y` above the grass. */
function ground(b, x0, z0, x1, z1, color, y = 0.02) {
  b.plane((x0 + x1) / 2, y, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), color);
}

/** A track of soil with two ruts, like the scene's own track that leads to the plot. */
function track(b, x0, z0, x1, z1, y = 0.034) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  b.at((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0), () => {
    b.plane(0, y, 0, 0.8, len, C.soil);
    for (const sx of [-0.2, 0.2]) b.plane(sx, y + 0.012, 0, 0.12, len, C.soilDark);
  });
}

/**
 * A straight girder from point p to point q (any direction), `w` wide and
 * `h` deep — braces, raking legs, conveyors: what the kit's upright boxes
 * cannot do. Its underside is drawn only where the camera could see it.
 * opts: top (colour of the upper face), caps (close the two ends)
 */
function beam(b, p, q, w, h, color, opts) {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const dz = q[2] - p[2];
  const flat = Math.hypot(dx, dz);
  const len = Math.hypot(flat, dy);
  // s: level and square to the beam; u: square to both, pointing up
  const s = flat > 1e-6 ? [dz / flat, 0, -dx / flat] : [1, 0, 0];
  const u = [(dy * s[2]) / len, (dz * s[0] - dx * s[2]) / len, (-dy * s[0]) / len];
  const corner = (o, i, j) => [o[0] + (s[0] * i * w + u[0] * j * h) / 2, o[1] + (u[1] * j * h) / 2, o[2] + (s[2] * i * w + u[2] * j * h) / 2];
  const p00 = corner(p, -1, -1);
  const p10 = corner(p, 1, -1);
  const p11 = corner(p, 1, 1);
  const p01 = corner(p, -1, 1);
  const q00 = corner(q, -1, -1);
  const q10 = corner(q, 1, -1);
  const q11 = corner(q, 1, 1);
  const q01 = corner(q, -1, 1);
  b.quad(q01, q11, p11, p01, opts?.top ?? color);
  b.quad(q10, p10, p11, q11, color);
  b.quad(p00, q00, q01, p01, color);
  if (Math.abs(dy) > flat * 0.45) b.quad(p00, p10, q10, q00, color);
  if (opts?.caps) {
    b.quad(q00, q10, q11, q01, color);
    b.quad(p10, p00, p01, p11, color);
  }
}

/** Corners of a polygon standing in the y–z plane, a flat side down: [y, z] pairs. */
function ring(cy, cz, r, seg, sy = 1) {
  const phase = (0.75 * seg - 0.5) % 1;
  const out = [];
  for (let i = 0; i < seg; i++) {
    const a = ((i + phase) / seg) * TAU;
    out.push([cy + Math.sin(a) * r * sy, cz + Math.cos(a) * r]);
  }
  return out;
}

/** Fill a polygon of ring() corners at `x`; it faces +x (dir = 1) or −x (−1). */
function disc(b, x, pts, color, dir = 1) {
  const at = (i) => [x, pts[i][0], pts[i][1]];
  for (let i = 1; i < pts.length - 1; i++) {
    if (dir > 0) b.tri(at(0), at(i + 1), at(i), color);
    else b.tri(at(0), at(i), at(i + 1), color);
  }
}

/**
 * A cylinder lying on its side, its axis along x (the kit's own stand
 * upright): logs, bales, wheels, tunnels. It rests on height `y`.
 * opts: seg, cap (colour of the two ends), ry, half (upper half only: an arch), sy (squash)
 */
function drum(b, x, y, z, r, len, color, opts) {
  if (opts?.ry) return b.at(x, y, z, opts.ry, () => drum(b, 0, 0, 0, r, len, color, { ...opts, ry: 0 }));
  const seg = opts?.seg ?? 6;
  const sy = opts?.sy ?? 1;
  let pts;
  if (opts?.half) {
    pts = [];
    for (let i = 0; i <= seg; i++) pts.push([y + Math.sin((i / seg) * Math.PI) * r * sy, z + Math.cos((i / seg) * Math.PI) * r]);
  } else {
    pts = ring(y + r * sy * Math.cos(Math.PI / seg), z, r, seg, sy);
  }
  const x0 = x - len / 2;
  const x1 = x + len / 2;
  const sides = opts?.half ? seg : pts.length;
  for (let i = 0; i < sides; i++) {
    const [ya, za] = pts[i];
    const [yb, zb] = pts[(i + 1) % pts.length];
    b.quad([x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb], color);
  }
  disc(b, x1, pts, opts?.cap ?? color, 1);
  disc(b, x0, pts, opts?.cap ?? color, -1);
  return b;
}

/**
 * Crop rows on a patch `w` × `d` centred on (x, z): low ridges running along
 * z (ry = HALF: along x) whose two flanks catch the sun differently. `tones`
 * are used in turn from row to row.
 */
function rows(b, x, y, z, w, d, pitch, h, tones, ry = 0) {
  if (ry) return b.at(x, 0, z, ry, () => rows(b, 0, y, 0, d, w, pitch, h, tones));
  const n = Math.max(1, Math.round(w / pitch));
  const step = w / n;
  const rw = step * 0.36;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  for (let i = 0; i < n; i++) {
    const cx = x - w / 2 + (i + 0.5) * step;
    const tone = tones[i % tones.length];
    b.quad([cx + rw, y, z1], [cx + rw, y, z0], [cx, y + h, z0], [cx, y + h, z1], tone);
    b.quad([cx - rw, y, z0], [cx - rw, y, z1], [cx, y + h, z1], [cx, y + h, z0], tone);
  }
  return b;
}

/** A field of row crops between two corners: a `base` of soil or turf with ridges of `tones` on it. */
function rowField(b, x0, z0, x1, z1, base, tones, opts) {
  ground(b, x0, z0, x1, z1, base);
  const m = 0.1; // headland left free at the edges
  rows(b, (x0 + x1) / 2, 0.02, (z0 + z1) / 2, x1 - x0 - m * 2, z1 - z0 - m * 2, opts?.pitch ?? 0.34, opts?.h ?? 0.06, tones, opts?.ry ?? 0);
}

/** A small round tree: orchards, young woods. About a third of the triangles of props' tree(). */
function sapling(b, x, z, s = 1, green = C.leaf, seg = 5) {
  b.cyl(x, 0, z, 0.035 * s, 0.24 * s, C.trunk, { seg: 4, cap: false });
  b.ball(x, 0.42 * s, z, 0.25 * s, green, { seg, rings: 3, sy: 0.95 });
}

/** A young spruce: two tiers, no trunk to speak of — the filler of the forest, at under half the cost of props' pine(). */
function fir(b, x, z, s = 1, tint = b.rand()) {
  const green = tint > 0.5 ? C.pine : C.pineDark;
  b.at(x, 0, z, tint * TAU, () => {
    b.cone(0, 0.16, 0, 0.45, 0.9, green, { seg: 5 });
    b.cone(0, 0.74, 0, 0.31, 0.92, shade(green, 1.1), { seg: 5 });
  }, s);
}

/** A pond: a low-poly outline of water with a bank round it. */
function pond(b, x, z, r, bank = C.soil) {
  const n = 7;
  const at = (i, k, y) => {
    const a = (i / n) * TAU;
    const rr = r * k * (0.82 + 0.18 * Math.sin(i * 2.4));
    return [x + Math.cos(a) * rr * 1.35, y, z + Math.sin(a) * rr];
  };
  for (let i = 0; i < n; i++) b.tri([x, 0.034, z], at(i + 1, 1.22, 0.034), at(i, 1.22, 0.034), bank);
  b.layer('water');
  for (let i = 0; i < n; i++) b.tri([x, 0.048, z], at(i + 1, 1, 0.048), at(i, 1, 0.048), C.water);
  b.layer('solid');
}

/** A wheel standing on the ground, its axle along x; `hub` paints the rim on its outer side. */
function wheel(b, x, z, r, w, hub) {
  drum(b, x, 0, z, r, w, C.black, { seg: 8 });
  if (hub) disc(b, x + Math.sign(x) * (w / 2 + 0.012), ring(r * Math.cos(Math.PI / 8), z, r * 0.5, 6), hub, Math.sign(x));
}

// ---------------------------------------------------------------------------
// Farm: a farmstead round a dirt yard — the red barn, grain silos, the
// farmhouse by the track — among fields whose rows run this way and that.
//   level 1  a small farmstead: barn, silo, a polytunnel, a paddock, two fields
//   level 2  a cowshed and a second silo, three tunnels, an orchard, fields behind as well
//   level 3  agribusiness: two long sheds, a row of silos with an elevator, a block of
//            glasshouses, fields to the plot's very edge and a combine in the wheat
// ---------------------------------------------------------------------------

const BARN_RED = mix(C.roofRed, C.brickDark, 0.35);
const DIRT = mix(C.soil, C.sand, 0.45);
const TUNNEL = mix(C.white, C.plasterMint, 0.35);
const PANE = mix(C.glassLight, C.white, 0.3);

/**
 * A barn with a gambrel (two-pitch) roof, its ridge along z; the big door and
 * the owner's name are in the front gable.
 */
function barn(b, x, z, w, d, wallH, roofH, color) {
  const over = 0.07;
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  const kx = w * 0.29; // the knee of the roof
  const ky = wallH + roofH * 0.62;
  const top = wallH + roofH;
  const ey = wallH - (over * (ky - wallH)) / (w / 2 - kx); // the eaves hang a little lower
  const roof = C.roofDark;
  b.box(x, 0, z, w, wallH, d, BARN_RED);
  // gable ends
  const front = [[x0, wallH, z1], [x1, wallH, z1], [x + kx, ky, z1], [x, top, z1], [x - kx, ky, z1]];
  const back = [[x1, wallH, z0], [x0, wallH, z0], [x - kx, ky, z0], [x, top, z0], [x + kx, ky, z0]];
  for (const g of [front, back]) for (let i = 1; i < 4; i++) b.tri(g[0], g[i], g[i + 1], BARN_RED);
  // roof: two steep lower slopes, two flatter upper ones
  const e0 = z0 - 0.02;
  const e1 = z1 + over;
  b.quad([x1 + over, ey, e1], [x1 + over, ey, e0], [x + kx, ky, e0], [x + kx, ky, e1], shade(roof, 0.94));
  b.quad([x + kx, ky, e1], [x + kx, ky, e0], [x, top, e0], [x, top, e1], roof);
  b.quad([x0 - over, ey, e0], [x0 - over, ey, e1], [x - kx, ky, e1], [x - kx, ky, e0], shade(roof, 1.04));
  b.quad([x - kx, ky, e0], [x - kx, ky, e1], [x, top, e1], [x, top, e0], shade(roof, 1.1));
  // white barge boards along the front edge of the roof
  beam(b, [x1 + over, ey, e1], [x + kx, ky, e1], 0.03, 0.05, C.white);
  beam(b, [x + kx, ky, e1], [x, top, e1], 0.03, 0.05, C.white);
  beam(b, [x0 - over, ey, e1], [x - kx, ky, e1], 0.03, 0.05, C.white);
  beam(b, [x - kx, ky, e1], [x, top, e1], 0.03, 0.05, C.white);
  // the door: white frame, cross-braced leaves; the name above it, then the hayloft hatch
  const dh = Math.min(0.62, wallH - 0.2);
  b.box(x, 0, z1, 0.82, dh + 0.05, 0.03, C.white, { ao: 1 });
  b.box(x, 0, z1 + 0.012, 0.72, dh, 0.03, C.woodDark, { ao: 0.9 });
  beam(b, [x - 0.34, 0.03, z1 + 0.034], [x + 0.34, dh - 0.03, z1 + 0.034], 0.02, 0.035, C.white);
  beam(b, [x + 0.34, 0.03, z1 + 0.036], [x - 0.34, dh - 0.03, z1 + 0.036], 0.02, 0.035, C.white);
  b.box(x, dh + 0.075, z1, 0.98, 0.2, 0.03, C.white, { ao: 1 });
  b.lamp(x, dh + 0.1, z1 + 0.02, 0.9, 0.15, 0.04, color, shade(color, 1.2));
  b.box(x, wallH + roofH * 0.2, z1, 0.3, 0.28, 0.03, C.white, { ao: 1 });
  b.box(x, wallH + roofH * 0.2 + 0.03, z1 + 0.012, 0.22, 0.22, 0.03, C.woodDark, { ao: 1 });
  b.box(x, wallH + roofH * 0.25, z0, 0.3, 0.28, 0.03, C.woodDark, { ao: 1 });
  // small stable windows down both sides
  b.windows(x1, 0.3, z, HALF, d - 0.5, 0.26, 4, 1, { lit: 0.25, gapX: 0.55, gapY: 0.1 });
  b.windows(x0, 0.3, z, -HALF, d - 0.5, 0.26, 4, 1, { lit: 0.25, gapX: 0.55, gapY: 0.1 });
}

/** A long modern livestock shed: low panel walls, a pale shallow roof with vents, ridge along z. */
function longShed(b, x, z, w, d) {
  b.gable(x, 0, z, w, d, 0.5, 0.3, C.panel, C.roofLight, { axis: 'z', over: 0.06 });
  b.box(x, 0, z + d / 2, w * 0.5, 0.42, 0.03, C.steelDark, { ao: 1 });
  b.box(x, 0, z - d / 2, w * 0.5, 0.42, 0.03, C.steelDark, { ao: 1 });
  const n = Math.round(d / 0.45);
  b.windows(x + w / 2, 0.2, z, HALF, d - 0.3, 0.2, n, 1, { lit: 0.3, gapX: 0.5, gapY: 0.1 });
  b.windows(x - w / 2, 0.2, z, -HALF, d - 0.3, 0.2, n, 1, { lit: 0.3, gapX: 0.5, gapY: 0.1 });
  for (let i = -1; i <= 1; i++) b.box(x, 0.77, z + i * d * 0.3, 0.16, 0.08, 0.34, C.panelDark, { ao: 1, top: C.steelDark });
}

/** A feed bin on legs beside a shed. */
function feedBin(b, x, z) {
  b.box(x, 0, z, 0.3, 0.3, 0.3, C.steelDark, { ao: 1 });
  b.cyl(x, 0.14, z, 0.06, 0.24, C.panelDark, { seg: 6, r2: 0.21, cap: false });
  b.cyl(x, 0.38, z, 0.21, 0.5, C.panel, { seg: 6, cap: false });
  b.cone(x, 0.88, z, 0.22, 0.14, shade(C.panel, 0.9), { seg: 6 });
}

/** The farmhouse: plastered walls under a red roof, a porch over the door. Faces +z. */
function farmhouse(b, x, z, w = 1.5) {
  const d = 1.1;
  const f = z + d / 2;
  b.block(x, 0, z, w, 0.64, d, C.plaster, { win: { faces: 'blr', cols: 3, colsSide: 2, rows: 1, base: 0.2, cap: 0.12, lit: 0.6 } });
  b.gable(x, 0.64, z, w, d, 0, 0.5, C.plaster, C.roofRed, { over: 0.1 });
  b.box(x, 0, z, w + 0.04, 0.1, d + 0.04, C.stone, { ao: 0.9 });
  b.box(x, 0.1, f, 0.22, 0.38, 0.03, C.woodDark, { ao: 1 });
  b.wedge(x, 0.5, f + 0.13, 0.5, 0.1, 0.26, C.roofRed);
  for (const sx of [-1, 1]) {
    b.windows(x + sx * (w / 2 - 0.36), 0.2, f, 0, 0.36, 0.32, 1, 1, { lit: 0.8 });
    b.box(x + sx * 0.21, 0, f + 0.22, 0.04, 0.5, 0.04, C.white, { ao: 1 });
  }
  b.box(x + w / 2 - 0.36, 0.8, z - 0.18, 0.17, 0.48, 0.17, C.brick, { top: C.dark });
}

/** A polytunnel: an arch of pale film over the beds, running along z. */
function tunnel(b, x, z, w, len) {
  drum(b, x, 0, z, w / 2, len, TUNNEL, { half: true, sy: 0.8, seg: 5, ry: HALF, cap: shade(TUNNEL, 0.86) });
  b.box(x, 0, z + len / 2, 0.24, 0.22, 0.03, C.steelDark, { ao: 1 });
  b.box(x, 0, z - len / 2, 0.24, 0.22, 0.03, C.steelDark, { ao: 1 });
}

/**
 * A block of glasshouses: `n` glazed spans side by side, ridges along z, on a
 * low footing. At night some spans glow from the grow lights inside.
 */
function glasshouses(b, x, z, w, d, n) {
  const wallH = 0.34;
  const top = wallH + 0.2;
  const span = w / n;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  b.box(x, 0, z, w + 0.06, 0.08, d + 0.06, C.concrete, { ao: 1 });
  b.layer('glass').box(x, 0.08, z, w, wallH - 0.08, d, C.glassLight, { ao: 0.92 });
  for (let i = 0; i < n; i++) {
    const xa = x - w / 2 + i * span;
    const xm = xa + span / 2;
    const xb = xa + span;
    b.quad([xa, wallH, z0], [xa, wallH, z1], [xm, top, z1], [xm, top, z0], PANE);
    b.quad([xb, wallH, z1], [xb, wallH, z0], [xm, top, z0], [xm, top, z1], PANE);
    b.tri([xa, wallH, z1], [xb, wallH, z1], [xm, top, z1], PANE);
    b.tri([xb, wallH, z0], [xa, wallH, z0], [xm, top, z0], PANE);
    if (b.night && b.rand() < 0.6) {
      // grow lights: the roof of this span shines
      const glow = shade(C.lampWarm, 0.62);
      const ye = wallH + 0.014 + (0.04 * (top - wallH)) / (span / 2); // just above the pane, a little in from the gutter
      b.layer('glow');
      b.quad([xa + 0.04, ye, z0 + 0.05], [xa + 0.04, ye, z1 - 0.05], [xm, top + 0.014, z1 - 0.05], [xm, top + 0.014, z0 + 0.05], glow);
      b.quad([xb - 0.04, ye, z1 - 0.05], [xb - 0.04, ye, z0 + 0.05], [xm, top + 0.014, z0 + 0.05], [xm, top + 0.014, z1 - 0.05], glow);
      b.layer('glass');
    }
  }
  b.layer('solid');
  // white frame: gutters in the valleys, ridge caps, the two end frames
  for (let i = 0; i <= n; i++) b.plane(x - w / 2 + i * span, wallH + 0.014, z, 0.07, d + 0.02, C.white);
  for (let i = 0; i < n; i++) b.plane(x - w / 2 + (i + 0.5) * span, top + 0.028, z, 0.035, d, C.white);
  b.box(x, wallH - 0.03, z1, w + 0.03, 0.045, 0.03, C.white, { ao: 1 });
  b.box(x, wallH - 0.03, z0, w + 0.03, 0.045, 0.03, C.white, { ao: 1 });
}

/** A round bale of hay or straw, lying with its axis along x (ry turns it). */
function bale(b, x, z, ry = 0, color = C.hay) {
  drum(b, x, 0, z, 0.17, 0.26, color, { seg: 6, cap: shade(color, 0.88), ry });
}

/** A cow: at this size a body on a dark block of legs, a head and one black patch say it all. */
function cow(b, x, z, ry, brown = false) {
  const coat = brown ? C.roofBrown : C.white;
  b.at(x, 0, z, ry, () => {
    b.box(0, 0, 0, 0.1, 0.1, 0.28, C.dark, { ao: 1 });
    b.box(0, 0.09, 0, 0.15, 0.13, 0.36, coat, { ao: 0.94 });
    b.box(0, 0.13, 0.21, 0.1, 0.11, 0.13, brown ? shade(coat, 0.85) : C.dark, { ao: 1 });
    if (!brown) b.box(0, 0.1, -0.05, 0.156, 0.124, 0.13, C.dark, { ao: 1 });
  });
}

/** A tractor in the owner's colour, about 0.95 long, facing +z. */
function tractor(b, x, z, ry, color) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0.13, 0.04, 0.2, 0.1, 0.78, C.dark, { ao: 1 }); // frame
    b.box(0, 0.22, 0.24, 0.24, 0.17, 0.42, color, { ao: 0.9 }); // bonnet
    b.box(0, 0.22, -0.2, 0.3, 0.13, 0.34, color, { ao: 0.9 }); // rear, mudguards
    b.box(0, 0.35, -0.18, 0.27, 0.22, 0.3, C.glassDark, { ao: 1 }); // cab
    b.box(0, 0.57, -0.18, 0.32, 0.035, 0.35, C.white, { ao: 1 });
    b.box(0.085, 0.39, 0.3, 0.035, 0.2, 0.035, C.dark, { ao: 1 }); // exhaust
    for (const s of [-1, 1]) {
      wheel(b, s * 0.215, -0.2, 0.2, 0.11, C.yellow);
      drum(b, s * 0.17, 0, 0.3, 0.115, 0.09, C.black, { seg: 6 });
    }
  });
}

/** A trailer with bales, hitched behind a tractor (its drawbar at +z). */
function trailer(b, x, z, ry) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0, -0.08, 0.42, 0.15, 0.2, C.black, { ao: 1 }); // the axle's two wheels in one
    b.box(0, 0.14, 0, 0.38, 0.06, 0.8, C.wood, { ao: 1 });
    b.box(0, 0.15, 0.5, 0.05, 0.04, 0.24, C.dark, { ao: 1 });
    b.box(0, 0.2, 0.02, 0.34, 0.2, 0.7, C.hay, { ao: 0.92 });
    b.box(0, 0.4, -0.06, 0.32, 0.17, 0.44, shade(C.hay, 0.93), { ao: 0.95 });
  });
}

/** A combine harvester in the owner's colour, cutting towards +z. */
function combine(b, x, z, ry, color) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0.17, -0.12, 0.5, 0.42, 0.95, color, { ao: 0.88 }); // body
    b.box(0, 0.59, -0.28, 0.4, 0.06, 0.5, shade(color, 0.78), { ao: 1 }); // grain tank
    b.box(0, 0.36, 0.44, 0.38, 0.3, 0.22, C.glassDark, { ao: 1 }); // cab
    b.box(0, 0.66, 0.44, 0.42, 0.035, 0.27, C.white, { ao: 1 });
    b.box(0, 0.03, 0.74, 1.34, 0.13, 0.22, C.steelDark, { ao: 0.9 }); // header …
    drum(b, 0, 0.1, 0.84, 0.13, 1.28, C.red, { seg: 6 }); // … and its reel
    beam(b, [0.2, 0.6, -0.3], [0.78, 0.74, -0.3], 0.07, 0.07, C.white, { caps: true }); // unloading spout
    for (const s of [-1, 1]) wheel(b, s * 0.31, 0.22, 0.2, 0.13, C.yellow);
    b.box(0, 0, -0.42, 0.52, 0.16, 0.2, C.black, { ao: 1 });
  });
}

registerModel(
  'farm',
  (b, { level, color, lot }) => {
    onPlot(b, lot, (X, Z, e) => {
      const big = level === 3;
      const inset = big ? 0 : 0.5; // only the big farm ploughs to the very edge
      const fx = X - inset;
      const fz = Z - inset;
      const yardR = [0.85, 1.6, 2.45][level - 1];

      // The yard and the track to the road
      ground(b, level === 1 ? -2.6 : -2.55, -4.45, yardR, -0.25, DIRT);
      track(b, 0, -0.25, 0, Z + e, 0.022);

      // Wheat, front right: a standing crop with tramlines; the big farm is harvesting it
      const wz0 = big ? 0.1 : 0.45;
      const cut = big ? fx - 1.75 : fx; // right of this line the wheat is already cut
      const wheat = (x0, z0, x1, z1) => {
        b.box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, 0.11, z1 - z0, C.cropDark, { top: C.crop, ao: 0.9 });
        for (let sx = x0 + 0.3; sx < x1 - 0.1; sx += 0.42) b.plane(sx, 0.122, (z0 + z1) / 2, 0.05, z1 - z0 - 0.02, C.cropDark);
      };
      wheat(0.9, wz0, cut, fz);
      if (big) {
        const cz = 3.3; // where the combine is
        ground(b, cut, wz0, fx, fz, C.hay);
        for (let sx = cut + 0.3; sx < fx; sx += 0.42) b.plane(sx, 0.032, (wz0 + fz) / 2, 0.06, fz - wz0 - 0.1, C.cropDark);
        wheat(cut, wz0, cut + 1.34, cz - 1.0);
        combine(b, cut + 0.67, cz, Math.PI, color);
        bale(b, fx - 0.25, 1.2, 0.3);
        bale(b, fx - 0.22, 3.1, HALF);
        bale(b, cut + 0.7, 4.9, 0.2);
      }

      // Row crops, front left
      const gz0 = 2.35;
      const orchard = big ? -3.75 : -fx; // the big farm keeps its fruit trees at the end of this field
      rowField(b, orchard, gz0, -0.95, fz, C.soil, [C.leaf, C.leafLight], { ry: HALF, h: 0.07 });
      if (big) {
        ground(b, -fx, gz0, orchard - 0.15, fz, C.meadow);
        for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) sapling(b, -fx + 0.5 + i * 0.95, gz0 + 0.5 + j * ((fz - gz0 - 1) / 3), 1, j % 2 ? C.leaf : C.leafDark);
      }

      // Behind the farm: a hay meadow with bales, and plough-land
      if (level >= 2) {
        const mz = -4.72;
        ground(b, -fx, -fz, 2.05, mz, C.grassLight);
        rows(b, (2.05 - fx) / 2, 0.02, (mz - fz) / 2, fx + 2.05 - 0.3, fz + mz - 0.16, 0.36, 0.05, [C.hay], HALF);
        for (const [sx, sz, ry] of [[-4.6, 0.25, 0.2], [-2.1, 0.4, 1.3], [0.9, 0.3, 0.5]]) bale(b, sx, -fz + sz, ry);
        rowField(b, 2.4, -fz, fx, -4.05, C.soil, [C.soilDark], { pitch: 0.3, h: 0.05 });
      }

      // The barn and the silos behind the yard
      barn(b, -1.35, -3.2, 1.6, 2.2, 0.95, 0.78, color);
      for (let i = 0; i < level; i++) {
        const sx = 0.15 + i * 0.8;
        silo(b, sx, -3.85, 0.36, 1.75 + (i % 2) * 0.2, C.panel, true);
        b.cyl(sx, 1.26, -3.85, 0.372, 0.16, color, { seg: 12, cap: false });
      }
      if (big) {
        // the elevator that fills them: a leg with spouts to every silo
        b.box(0.55, 0, -4.28, 0.13, 2.6, 0.13, C.steel, { ao: 0.9 });
        b.box(0.55, 2.6, -4.28, 0.2, 0.14, 0.2, C.steelDark, { ao: 1 });
        for (let i = 0; i < 3; i++) beam(b, [0.55, 2.58, -4.26], [0.15 + i * 0.8, 2.02 + (i % 2) * 0.2, -3.87], 0.05, 0.05, C.steel);
      }

      // Livestock on the left: a paddock at first, long sheds later
      const paddock = (x0, z0, x1, z1, open) => {
        ground(b, x0, z0, x1, z1, mix(C.meadow, C.soil, 0.4), 0.034);
        if (open !== 'r') fence(b, x1, z0, x1, z1, C.wood, 0.22);
        if (open !== 'b') fence(b, x0, z0, x1, z0, C.wood, 0.22);
        fence(b, x0, z0, x0, z1, C.wood, 0.22);
        fence(b, x0, z1, x1, z1, C.wood, 0.22);
        b.box(x0 + 0.3, 0, z0 + 0.22, 0.4, 0.1, 0.16, C.steelDark, { ao: 1, top: C.water }); // trough
      };
      if (level === 1) {
        paddock(-4.25, -3.7, -2.15, -2.0, 'r');
        cow(b, -3.6, -2.7, 0.7);
        cow(b, -2.75, -3.2, -1.9, true);
        cow(b, -3.2, -2.3, 2.6);
      } else {
        longShed(b, -3.2, -2.5, 1.3, 2.6);
        feedBin(b, -2.4, -3.95);
        if (big) {
          longShed(b, -4.75, -2.5, 1.3, 2.6);
          feedBin(b, -3.98, -3.95);
          paddock(-5.75, -0.95, -3.45, 0.85, 'b');
          for (const [sx, sz, ry, br] of [[-5.2, -0.3, 0.6, 0], [-4.5, 0.35, -2.2, 1], [-4.0, -0.45, 1.9, 0], [-5.1, 0.45, 2.9, 0], [-3.85, 0.3, -0.6, 1]]) cow(b, sx, sz, ry, !!br);
        } else {
          paddock(-5.7, -3.8, -3.85, -1.2, 'r');
          for (const [sx, sz, ry, br] of [[-5.2, -3.1, 0.6, 0], [-4.5, -2.5, -2.2, 1], [-4.9, -1.75, 1.9, 0], [-4.3, -3.4, 2.9, 0]]) cow(b, sx, sz, ry, !!br);
        }
      }

      // Under cover on the right: polytunnels, then glasshouses and a machine shed
      if (big) {
        glasshouses(b, (2.8 + X) / 2, -2.15, X - 2.8, 3.1, 6);
        b.gable(1.75, 0, -1.7, 1.15, 2.0, 0.62, 0.34, C.panel, C.roofGreen, { axis: 'z', over: 0.06 });
        b.box(1.175, 0, -1.7, 0.03, 0.5, 1.5, C.dark, { ao: 1 }); // its open side faces the yard
        b.box(1.75, 0, -0.7, 0.6, 0.5, 0.03, C.steelDark, { ao: 1 });
        b.windows(2.325, 0.28, -1.7, HALF, 1.7, 0.22, 4, 1, { lit: 0.2, gapX: 0.5, gapY: 0.1 });
      } else {
        const n = level === 1 ? 1 : 3;
        for (let i = 0; i < n; i++) tunnel(b, (level === 1 ? 1.8 : 2.5) + i * 0.98, -2.2, 0.84, 2.6);
      }

      // The farmhouse by the track, its garden, the gate
      farmhouse(b, -2.2, 0.75, big ? 1.8 : 1.5);
      hedge(b, -3.3, 1.75, -0.65, 1.75);
      tree(b, -0.95, 0.95, 0.85, 0.3);
      bush(b, -3.25, 1.3, 0.9, 0.7);
      if (level === 2) {
        ground(b, -5.65, -0.75, -3.6, 1.75, C.meadow);
        for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) sapling(b, -5.2 + i * 1.05, -0.3 + j * 0.8, 1, j % 2 ? C.leaf : C.leafDark);
      } else if (level === 1) {
        tree(b, -4.4, 0.6, 1.05, 0.55);
        pond(b, 3.9, -3.0, 0.62);
        tree(b, 4.9, -3.7, 0.95, 0.05);
        bush(b, 3.0, -3.5, 1, 0.2);
      }
      flag(b, 0.62, Z - 0.25, color, 1.3);
      if (level >= 2) pylon(b, -0.72, Z - 0.3, color, 1.2);

      // Life in the yard: straw by the barn, the tractor, a lamp
      for (const [sx, sz, sy] of [[-0.35, -2.6, 0], [-0.35, -2.92, 0], [-0.35, -2.76, 0.2]]) b.box(sx, sy, sz, 0.3, 0.2, 0.3, shade(C.hay, sy ? 0.95 : 1), { ao: 0.92 });
      lamp(b, -0.55, -0.45, 0);
      if (level === 1) tractor(b, -0.3, -1.4, 0.5, color);
      else {
        tractor(b, 0, 2.6, 0, color);
        trailer(b, 0, 1.62, 0);
        if (big) tractor(b, 4.3, -5.0, -HALF, color);
      }
    });
  },
  { lot: PLOT.rural },
);

// ---------------------------------------------------------------------------
// Mine: the benches of a quarry cut into a hill at the back, a headframe over
// the shaft with its winding house, the plant that crushes and sorts, belts
// to the stockpiles, lorries in the yard.
//   level 1  one small headframe, a crusher with a single belt, two benches
//   level 2  a taller frame with twin wheels, a bigger plant, three benches, an excavator
//   level 3  a second shaft, four benches, six stockpiles, floodlights
// ---------------------------------------------------------------------------

const STRATA = [C.soil, mix(C.rock, C.sand, 0.5), C.rock, C.rockDark]; // from the surface down
const COAL = C.dark;
const ORE = mix(C.brick, C.cropDark, 0.5);
const PIT = mix(C.rock, C.gravel, 0.5);

/**
 * A quarry: `n` benches of rock stepping up from the pit floor towards the
 * back (−z) and the left (−x); (px, pz) is the floor's back-left corner. The
 * strata show in the risers and the lowest carries the seam; behind the top
 * bench the hill falls away as a grassy slope. The back arm runs right as far
 * as `ex`, the left arm forward as far as `ez`, each bench ending a little
 * sooner than the one below.
 */
function quarry(b, px, pz, n, ex, ez) {
  const tread = 0.5;
  const rise = 0.34;
  const slope = 0.7;
  let xo = px;
  let zo = pz;
  let xr = ex;
  let zf = ez;
  for (let i = 1; i <= n; i++) {
    const wide = i === n ? tread + 0.1 : tread;
    const wall = STRATA[Math.min(STRATA.length - 1, n - i)];
    const opts = { top: i === n ? C.grassDark : mix(wall, C.gravel, 0.55), ao: 0.88 };
    xr = ex - (i - 1) * 0.5;
    zf = ez - (i - 1) * 0.5;
    b.box((xo - wide + xr) / 2, 0, zo - wide / 2, xr - xo + wide, i * rise, wide, wall, opts); // back arm, with the corner
    b.box(xo - wide / 2, 0, (zo + zf) / 2, wide, i * rise, zf - zo, wall, opts); // left arm
    xo -= wide;
    zo -= wide;
  }
  // the hill behind
  const H = n * rise;
  b.wedge((xo + xr) / 2, 0, zo - slope / 2, xr - xo, H, slope, C.grassDark, { ry: Math.PI });
  b.wedge(xo - slope / 2, 0, (zo + zf) / 2, zf - zo, H, slope, C.grassDark, { ry: -HALF });
  b.tri([xo, H, zo], [xo - slope, 0, zo - slope], [xo - slope, 0, zo], C.grassDark);
  b.tri([xo, H, zo], [xo, 0, zo - slope], [xo - slope, 0, zo - slope], C.grassDark);
  // the seam at the foot of the lowest bench, a ramp up to it, fallen rock
  b.box((px + ex) / 2 + 0.6, 0.04, pz, ex - px - 1.6, 0.12, 0.03, C.black, { ao: 1 });
  b.box(px, 0.04, (pz + ez) / 2, 0.03, 0.12, ez - pz - 0.5, C.black, { ao: 1 });
  b.wedge(px + 0.8, 0, pz + 0.25, 0.5, rise, 1.6, mix(STRATA[Math.min(3, n - 1)], C.gravel, 0.55), { ry: HALF });
  b.box(px + 2.3, 0, pz + 0.3, 0.3, 0.16, 0.24, C.rockDark, { ry: 0.5, ao: 0.9 });
  b.box(px + 0.3, 0, pz + 2.2, 0.22, 0.13, 0.26, C.rock, { ry: -0.3, ao: 0.9 });
  b.box(px - 0.3, rise, pz + 1.4, 0.2, 0.12, 0.2, C.rockDark, { ry: 0.8, ao: 0.9 });
  b.cone(px + 3.1, 0, pz + 0.22, 0.3, 0.2, C.rockDark, { seg: 5 });
  b.cone(px + 0.2, 0, pz + 3.0, 0.26, 0.17, C.rock, { seg: 5 });
  if (n > 2) b.cone(px + 1.6, rise, pz - 0.3, 0.2, 0.14, C.rock, { seg: 5 });
  // what still grows on top
  b.at(xo + 0.3, H, zo + 0.3, 0, () => {
    fir(b, 0, 0, 0.8, 0.7);
    fir(b, 0.1, zf - zo - 1.0, 0.65, 0.2);
    bush(b, xr - xo - 1.0, 0, 1, 0.3);
    bush(b, 0, (zf - zo) * 0.45, 0.9, 0.8);
  });
}

/** The sheave of a headframe: a spoked wheel in the y–z plane (axle along x), centred on (x, y, z). */
function sheave(b, x, y, z, r, color) {
  const seg = 10;
  const w = 0.08;
  const outer = ring(y, z, r, seg);
  const inner = ring(y, z, r * 0.74, seg);
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    const [ya, za] = outer[i];
    const [yb, zb] = outer[j];
    const [yc, zc] = inner[j];
    const [yd, zd] = inner[i];
    b.quad([x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb], color);
    b.quad([x1, yb, zb], [x1, ya, za], [x1, yd, zd], [x1, yc, zc], color);
    b.quad([x0, ya, za], [x0, yb, zb], [x0, yc, zc], [x0, yd, zd], color);
    b.quad([x1, yd, zd], [x0, yd, zd], [x0, yc, zc], [x1, yc, zc], color); // the inside of the rim
  }
  const k = r * 0.56;
  beam(b, [x, y - k, z - k], [x, y + k, z + k], 0.05, 0.05, color);
  beam(b, [x, y - k, z + k], [x, y + k, z - k], 0.05, 0.05, color);
}

/**
 * A headframe: the winding tower over a shaft, `h` high — four raking legs
 * braced in zig-zag, the sheaves on top, a band in the owner's colour below
 * them. Backstays and ropes run down towards −z to the winding house (ry
 * turns the whole group).
 */
function headframe(b, x, z, ry, h, color, wheels = 2) {
  const steel = C.steelDark;
  const foot = 0.42;
  const head = 0.27;
  const half = (y) => foot + ((head - foot) * y) / h;
  b.at(x, 0, z, ry, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(b, [sx * foot, 0.01, sz * foot], [sx * head, h, sz * head], 0.07, 0.07, steel);
    const levels = [0.03, h * 0.33, h * 0.62];
    for (let i = 1; i < levels.length; i++) {
      const r0 = half(levels[i - 1]);
      const r1 = half(levels[i]);
      for (const [ax, az, bx, bz] of [[-1, 1, 1, 1], [1, 1, 1, -1], [1, -1, -1, -1], [-1, -1, -1, 1]]) {
        beam(b, [ax * r1, levels[i], az * r1], [bx * r1, levels[i], bz * r1], 0.05, 0.05, steel);
        if (i % 2) beam(b, [ax * r0, levels[i - 1], az * r0], [bx * r1, levels[i], bz * r1], 0.04, 0.04, steel);
        else beam(b, [bx * r0, levels[i - 1], bz * r0], [ax * r1, levels[i], az * r1], 0.04, 0.04, steel);
      }
    }
    b.box(0, 0, 0, 0.56, 0.42, 0.56, C.panelDark, { top: C.steelDark }); // the shaft's collar house
    b.lamp(0, h - 0.5, 0, half(h - 0.3) * 2 + 0.06, 0.4, half(h - 0.3) * 2 + 0.06, color, shade(color, 1.15));
    b.box(0, h - 0.06, 0, head * 2 + 0.32, 0.06, head * 2 + 0.32, steel, { ao: 1 });
    // the sheaves on their bearings, the ropes down to the winder
    const yc = h + 0.5;
    const zc = -0.1;
    const xs = wheels > 1 ? [-0.14, 0.14] : [0];
    for (const sx of [-0.27, 0.27]) {
      beam(b, [sx, h, 0.26], [sx, yc, zc], 0.05, 0.05, steel);
      beam(b, [sx, h, -0.3], [sx, yc, zc], 0.05, 0.05, steel);
    }
    b.box(0, yc - 0.03, zc, 0.6, 0.06, 0.06, C.steel, { ao: 1 });
    for (const sx of xs) {
      sheave(b, sx, yc, zc, 0.38, C.dark);
      beam(b, [sx, yc + 0.3, zc - 0.24], [sx, 0.78, -1.95], 0.022, 0.022, C.black);
    }
    // backstays, tied together half-way down
    for (const sx of [-1, 1]) beam(b, [sx * 0.3, h - 0.08, -head], [sx * 0.46, 0.03, -1.4], 0.08, 0.08, steel);
    beam(b, [-0.4, h * 0.42, -0.94], [0.4, h * 0.42, -0.94], 0.05, 0.05, steel);
    // the winding house
    b.gable(0, 0, -2.5, 1.0, 1.15, 0.7, 0.36, C.brick, C.roofGrey, { axis: 'z' });
    b.box(0, 0, -2.5, 1.04, 0.14, 1.19, C.concreteDark, { ao: 0.9 });
    b.windows(0.5, 0.24, -2.5, HALF, 0.95, 0.36, 3, 1, { lit: 0.8, gapX: 0.45 });
    b.windows(-0.5, 0.24, -2.5, -HALF, 0.95, 0.36, 3, 1, { lit: 0.8, gapX: 0.45 });
    b.box(0, 0.14, -3.075, 0.3, 0.42, 0.03, C.steelDark, { ao: 1 });
  });
}

/** A belt conveyor from p up to q on trestles; its end at q is where a stockpile grows. */
function conveyor(b, p, q) {
  beam(b, p, q, 0.2, 0.12, C.steelDark, { top: C.black, caps: true });
  const run = Math.hypot(q[0] - p[0], q[2] - p[2]);
  const n = Math.max(1, Math.round(run / 1.2));
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 0.25);
    const y = p[1] + (q[1] - p[1]) * t - 0.07;
    if (y > 0.2) b.box(p[0] + (q[0] - p[0]) * t, 0, p[2] + (q[2] - p[2]) * t, 0.07, y, 0.07, C.steel, { ao: 0.9 });
  }
}

/**
 * A stockpile: a cone of loose material with a lower shoulder, on ground
 * stained by it. Stains of different materials lie at different heights
 * (`layer`), so neighbouring heaps may run into each other.
 */
function heap(b, x, z, r, h, color, turn = 0.6, layer = 0) {
  ground(b, x - r * 1.15, z - r * 1.15, x + r * 1.15, z + r * 1.15, mix(C.gravel, color, 0.4), 0.058 + layer * 0.012);
  b.cone(x, 0, z, r, h, color, { seg: 9 });
  b.cone(x + Math.cos(turn) * r * 0.5, 0, z + Math.sin(turn) * r * 0.5, r * 0.62, h * 0.55, shade(color, 0.92), { seg: 7 });
}

/** A yellow excavator on tracks, its arm reaching towards +z. */
function excavator(b, x, z, ry) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0, 0, 0.38, 0.1, 0.5, C.dark, { ao: 1 });
    b.box(0, 0.1, -0.04, 0.34, 0.18, 0.38, C.yellow, { ao: 0.9 });
    b.box(-0.09, 0.28, 0.03, 0.15, 0.15, 0.2, C.glassDark, { ao: 1 });
    beam(b, [0.08, 0.24, 0.1], [0.08, 0.66, 0.5], 0.08, 0.08, C.yellow, { caps: true });
    beam(b, [0.08, 0.66, 0.5], [0.08, 0.2, 0.82], 0.06, 0.06, C.yellow, { caps: true });
    b.box(0.08, 0.06, 0.82, 0.14, 0.14, 0.14, C.dark, { ao: 1 });
  });
}

/** A floodlight mast, its lamp turned towards `ry` and lighting the ground there. */
function floodlight(b, x, z, ry, h = 2.0) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0, 0, 0.06, h, 0.06, C.steelDark, { ao: 1 });
    b.lamp(0, h - 0.04, 0.06, 0.3, 0.1, 0.1, C.white, C.lampCool);
    b.pool(0, 0.1, 1.2, 1.5, C.lampCool);
  });
}

registerModel(
  'mine',
  (b, { level, color, lot }) => {
    onPlot(b, lot, (X, Z, e) => {
      const big = level === 3;
      const n = level + 1; // benches of the quarry
      const px = -X + 0.8 + n * 0.5; // the pit floor's back-left corner
      const pz = -Z + 0.8 + n * 0.5;
      const ex = [0.2, 0.8, 1.3][level - 1];
      const ez = [-0.2, 0.5, 1.2][level - 1];
      const yardL = [-3.7, -4.7, -X][level - 1];
      const yardR = [X - 0.7, X - 0.3, X][level - 1];
      const yardZ = ez - 0.25; // where the yard meets the pit
      const shaftX = ex - 0.1; // … and the pit meets the ground round the shaft
      const zf = Z - 0.2; // the fence along the road

      // Ground: gravel in the yard and round the shaft, rock in the pit, the haul road through it all
      ground(b, yardL, yardZ, yardR, Z, C.gravel);
      ground(b, shaftX, -Z + 0.2, yardR, yardZ, C.gravel);
      ground(b, px, pz, shaftX, yardZ, PIT);
      track(b, 0, pz + 1.6, 0, Z + e);
      quarry(b, px, pz, n, ex, ez);
      excavator(b, px + 1.9, pz + 1.0, Math.PI);
      if (level >= 2) {
        pond(b, px + 1.0, pz + 2.5 + level * 0.3, 0.45, C.rockDark);
        lorry(b, px + 2.9, pz + 1.5, HALF, ORE);
      }

      // The shaft: headframe and winding house at the back, on the right
      const hz = [-3.7, -4.1, -4.6][level - 1];
      headframe(b, 2.1, hz, -HALF, 2.2 + level * 0.3, color, level > 1 ? 2 : 1);
      if (big) headframe(b, 2.1, -2.3, -HALF, 2.5, color, 1);

      // The plant: a hall under a lean-to roof with a screening tower, fed from the shaft
      const pw = 1.2 + level * 0.36;
      const pd = 1.15 + level * 0.15;
      const ph = 1.05 + level * 0.17;
      const pxc = 3.4 + level * 0.25;
      const pzc = [-0.3, 0, 0.2][level - 1];
      b.block(pxc, 0, pzc, pw, ph, pd, C.panelDark, { win: { rows: 1, base: ph - 0.44, cap: 0.14, gapX: 0.3, gapY: 0.2, lit: 0.6, glow: C.lampCool } });
      b.box(pxc, 0, pzc, pw + 0.04, 0.2, pd + 0.04, C.concreteDark, { ao: 0.9 });
      b.wedge(pxc, ph, pzc, pw + 0.1, 0.3, pd + 0.1, C.steelDark, { top: C.roofGrey });
      b.box(pxc + pw / 2, 0.2, pzc, 0.03, 0.55, 0.6, C.steelDark, { ao: 1 }); // the door on the right
      b.box(pxc - pw * 0.28, ph + 0.1, pzc - pd / 2 + 0.25, 0.24, 0.36, 0.24, C.steelDark, { top: C.dark }); // dust extraction
      b.lamp(pxc, ph - 0.62, pzc + pd / 2 + 0.012, pw * 0.5, 0.16, 0.03, color, shade(color, 1.2));
      const tx = pxc + pw / 2 - 0.35; // the tower stands on the hall's back-right corner
      const tz = pzc - pd / 2 + 0.1;
      b.box(tx, 0, tz, 0.8, ph + 0.55, 0.8, C.panelDark, { top: C.roofGrey });
      b.box(tx, ph + 0.2, tz, 0.83, 0.12, 0.83, color, { ao: 1 });
      conveyor(b, [2.3, 0.4, (big ? -2.3 : hz) + 0.3], [tx - 0.25, ph + 0.4, tz - 0.4]);

      // Belts from the plant to the stockpiles; more heaps dumped by lorry
      const fz = pzc + pd / 2;
      conveyor(b, [pxc + 0.25, ph * 0.5, fz], [pxc + 0.25, 1.2, fz + 2.0]);
      heap(b, pxc + 0.25, fz + 2.3, 0.9, 0.86, COAL, 0.4);
      if (level >= 2) {
        conveyor(b, [pxc - pw / 2, ph * 0.5, pzc + 0.25], [pxc - pw / 2 - 1.5, 1.05, pzc + 1.5]);
        heap(b, pxc - pw / 2 - 1.7, pzc + 1.75, 0.8, 0.72, ORE, 2.2, 1);
      } else {
        heap(b, 1.7, 1.2, 0.7, 0.6, ORE, 2.2, 1);
      }
      if (level === 2) {
        heap(b, 4.6, 4.95, 0.62, 0.52, COAL, 3.5);
        heap(b, 1.6, 3.9, 0.6, 0.5, C.sand, 1.2, 2);
      }
      if (big) {
        heap(b, 4.75, 5.0, 0.62, 0.52, COAL, 3.6);
        heap(b, 2.9, 4.7, 0.75, 0.66, ORE, 5.2, 1);
        heap(b, 1.25, 3.65, 0.6, 0.5, C.sand, 1.2, 2);
        heap(b, -1.6, 2.4, 0.6, 0.5, C.sand, 4.0, 2);
      }

      // The office by the gate, cars, the fence along the road
      const ow = 1.1 + level * 0.25;
      const oh = big ? 1.15 : 0.62;
      b.block(-2.2, 0, 4.4, ow, oh, 0.95, C.plasterCool, { win: { rows: big ? 2 : 1, base: 0.16, cap: 0.2, lit: 0.7 } });
      b.box(-2.2, oh, 4.4, ow + 0.08, 0.07, 1.03, C.white, { ao: 1, top: C.roofFlat });
      b.box(-2.2, oh - 0.17, 4.4, ow + 0.03, 0.15, 0.98, color, { ao: 1 });
      b.box(-2.2 + ow / 2 - 0.25, 0, 4.4 + 0.475, 0.2, 0.4, 0.03, C.dark, { ao: 1 });
      if (level >= 2) {
        // the car park beside it: as many bays as the mine has levels
        const bx = -2.2 - ow / 2 - 0.35 - level * 0.56;
        ground(b, bx - 0.1, 3.85, bx + level * 0.56 + 0.1, 5.15, C.asphalt, 0.034);
        for (let i = 0; i <= level; i++) b.plane(bx + i * 0.56, 0.046, 4.5, 0.035, 1.0, C.marking);
        car(b, bx + 0.28, 4.5, 0, 4);
        if (big) car(b, bx + 1.4, 4.45, Math.PI, 1);
      }
      fence(b, yardL + 0.05, zf, -0.75, zf);
      fence(b, 0.75, zf, yardR - 0.05, zf);
      beam(b, [-0.72, 0.3, zf], [0.1, 1.0, zf], 0.04, 0.05, C.red); // the barrier, up
      pylon(b, 1.25, zf - 0.45, color, 1.25 + level * 0.12);
      flag(b, -2.2 + ow / 2 + 0.3, 4.95, color, 1.4);

      // Lorries and lights
      lorry(b, 0, 3.6 - level * 0.2, 0, COAL);
      if (level >= 2) lorry(b, 2.75, fz + 1.6, Math.PI, C.steel);
      if (level >= 2) {
        floodlight(b, 1.0, yardZ + 0.4, -2.4);
        floodlight(b, yardR - 0.3, zf - 0.4, -2.4);
      }
      if (big) floodlight(b, -4.6, 1.75, 0.9);

      // Stores on the left of the yard: a container, crates, later a workshop
      if (level >= 2) {
        container(b, -3.6, 0, yardZ + 1.2, HALF, color);
        crates(b, -2.5, yardZ + 0.95, 2);
        crates(b, -2.5, yardZ + 1.4, 1, C.woodDark);
      }
      if (big) {
        b.gable(-5.05, 0, 2.75, 1.5, 1.2, 0.62, 0.32, C.panel, C.roofGrey, { over: 0.06 });
        b.box(-5.05, 0, 3.35, 0.8, 0.5, 0.03, C.steelDark, { ao: 1 });
        b.windows(-4.3, 0.26, 2.75, HALF, 1.0, 0.24, 2, 1, { lit: 0.6 });
      }
    });
  },
  { lot: PLOT.rural },
);

// ---------------------------------------------------------------------------
// Forestry: a sawmill in a clearing — logs in, sawn timber out — with the
// forest round it on three sides, a felled strip full of stumps, and a track
// that carries on into the trees.
//   level 1  an open saw shed, the forester's cabin, a pile of logs
//   level 2  a longer shed with a store, a lookout tower, a timber lorry, young trees planted
//   level 3  a mill hall with a chimney, drying kilns, stacks all over the yard
// ---------------------------------------------------------------------------

const BARK = C.trunk;
const CUT = mix(C.plasterWarm, C.hay, 0.4);
const PLANK = mix(C.hay, C.wood, 0.3);
const FLOOR = mix(C.grassDark, C.pineDark, 0.3);
const SAWDUST = mix(C.soil, C.hay, 0.45);
const MOST_TREES = [60, 46, 40]; // by level: the bigger the yard, the less forest is left

/** A log lying along x: bark round it, pale wood at the cut ends. */
function log(b, x, y, z, r, len, ry = 0, seg = 6) {
  drum(b, x, y, z, r, len, BARK, { seg, cap: CUT, ry });
}

/** A pile of logs lying along x: `n` on the ground, one fewer on each layer above. */
function logPile(b, x, z, ry, n, len, r = 0.1) {
  b.at(x, 0, z, ry, () => {
    for (let row = 0; row < n; row++) {
      for (let i = 0; i < n - row; i++) log(b, (b.rand() - 0.5) * 0.14, row * r * 1.5, (i - (n - row - 1) / 2) * r * 2.02, r, len, 0, 5);
    }
  });
}

/** A stack of sawn timber, the boards lying along x. */
function timber(b, x, z, ry, layers = 3, len = 1.15) {
  b.at(x, 0, z, ry, () => {
    for (let i = 0; i < layers; i++) b.box(0, i * 0.15, 0, len, 0.13, 0.44, i % 2 ? shade(PLANK, 0.92) : PLANK, { ao: 0.95 });
  });
}

/** A timber lorry, the cab in the owner's colour, logs between its stakes. Faces +z; as long as props' lorry(). */
function logLorry(b, x, z, ry, color) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0.1, 0.92, 0.5, 0.46, 0.4, color, { ao: 0.85 });
    b.box(0, 0.36, 0.99, 0.505, 0.14, 0.27, C.glassDark, { ao: 1 });
    b.box(0, 0.16, -0.22, 0.52, 0.1, 1.8, C.dark, { ao: 1 });
    for (const sz of [-0.92, -0.62, 0.12, 0.95]) b.box(0, 0, sz, 0.58, 0.17, 0.24, C.black, { ao: 1 });
    for (const sz of [-1.0, 0.56]) for (const sx of [-0.25, 0.25]) b.box(sx, 0.26, sz, 0.04, 0.44, 0.04, C.steelDark, { ao: 1 });
    for (const [sx, sy] of [[-0.15, 0.26], [0.02, 0.26], [0.17, 0.26], [-0.07, 0.4], [0.1, 0.4]]) log(b, sx, sy, -0.22, 0.085, sy > 0.3 ? 1.5 : 1.6, HALF);
  });
}

/** A fire lookout: a cabin on four raking, cross-braced legs, the owner's flag on its roof. */
function lookout(b, x, z, h, color) {
  const foot = 0.46;
  const head = 0.3;
  const legs = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
  b.at(x, 0, z, 0, () => {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i];
      const [bx, bz] = legs[(i + 1) % 4];
      beam(b, [ax * foot, 0.01, az * foot], [ax * head, h, az * head], 0.06, 0.06, C.woodDark);
      beam(b, [ax * foot, 0.05, az * foot], [bx * head, h - 0.05, bz * head], 0.04, 0.04, C.woodDark);
      beam(b, [ax * 0.43, h + 0.24, az * 0.43], [bx * 0.43, h + 0.24, bz * 0.43], 0.03, 0.03, C.woodDark); // the rail
    }
    b.box(0, h, 0, 0.9, 0.05, 0.9, C.wood, { ao: 1 });
    b.block(0, h + 0.05, 0, 0.56, 0.36, 0.56, C.wood, { win: { cols: 1, rows: 1, base: 0.1, cap: 0.06, margin: 0.07, gapX: 0.1, gapY: 0.1, lit: 1 } });
    b.hip(0, h + 0.41, 0, 0.84, 0.84, 0.26, C.roofRed);
    beam(b, [0.62, 0.02, 0.2], [0.47, h, 0.2], 0.16, 0.03, C.wood); // the ladder
    b.box(0, h + 0.6, 0, 0.03, 0.5, 0.03, C.steel, { ao: 1 });
    b.box(0.14, h + 0.9, 0, 0.26, 0.18, 0.02, color, { ao: 1 });
  });
}

/**
 * The sawmill: one long pitched roof, ridge along x, from x0 to x1. Left of
 * `xm` it covers a boarded hall, right of it an open shed on posts where the
 * logs are sawn. The edge of the roof carries the owner's colour.
 */
function sawmill(b, x0, x1, xm, z, d, color) {
  const wallH = 0.82;
  const roofH = 0.52;
  const over = 0.1;
  const zf = z + d / 2;
  const zb = z - d / 2;
  b.gable((x0 + x1) / 2, wallH, z, x1 - x0, d, 0, roofH, C.wood, C.roofBrown, { over });
  const drop = (over * roofH) / (d / 2);
  for (const sz of [zf + over, zb - over]) b.box((x0 + x1) / 2, wallH - drop - 0.07, sz, x1 - x0 + over * 2, 0.09, 0.03, color, { ao: 1 });
  for (const sz of [zf + over, zb - over]) beam(b, [x1 + over, wallH - drop, sz], [x1 + over, wallH + roofH, z], 0.03, 0.07, color);
  b.lamp(x0 + Math.min(1.3, (x1 - x0) / 2), wallH - drop + 0.02, zf + over, Math.min(1.5, (x1 - x0) * 0.4), 0.26, 0.04, color, shade(color, 1.2));
  if (xm > x0) {
    // the hall: boarded walls, a sliding door, a row of windows
    b.box((x0 + xm) / 2, 0, z, xm - x0, wallH, d, C.wood, { ao: 0.85 });
    b.box((x0 + xm) / 2 - 0.3, 0, zf, 0.7, 0.56, 0.03, C.woodDark, { ao: 1 });
    if (xm - x0 > 2) b.windows((x0 + xm) / 2 + 0.6, 0.3, zf, 0, 0.8, 0.3, 2, 1, { lit: 0.7 });
    b.windows(x0, 0.3, z, -HALF, d - 0.4, 0.3, 2, 1, { lit: 0.5 });
    b.windows((x0 + xm) / 2, 0.3, zb, Math.PI, xm - x0 - 0.4, 0.3, Math.round(xm - x0), 1, { lit: 0.5 });
  }
  // the open shed: posts, the saw bench with a log on it, sawdust
  const bays = Math.max(1, Math.round((x1 - xm) / 1.2));
  for (let i = xm > x0 ? 1 : 0; i <= bays; i++) {
    const sx = xm + ((x1 - xm) * i) / bays + (i === 0 ? 0.05 : i === bays ? -0.05 : 0);
    for (const sz of [zf - 0.05, zb + 0.05]) b.box(sx, 0, sz, 0.08, wallH, 0.08, C.woodDark, { ao: 0.9 });
  }
  const sx = (xm + x1) / 2;
  const bench = Math.min(1.5, x1 - xm - 0.6);
  b.box(sx, 0, z + 0.25, bench, 0.24, 0.36, C.steelDark, { ao: 0.9 });
  log(b, sx - 0.1, 0.24, z + 0.25, 0.11, bench - 0.2);
  b.box(sx + bench / 2 - 0.2, 0.2, z + 0.25, 0.03, 0.4, 0.4, C.steel, { ao: 1 }); // the blade
  b.cone(sx + 0.5, 0, z - 0.4, 0.34, 0.3, CUT, { seg: 6 });
}

registerModel(
  'forestry',
  (b, { level, color, lot }) => {
    const smoke = [];
    const k = onPlot(b, lot, (X, Z, e) => {
      const big = level === 3;
      // the clearing grows with the mill
      const cx0 = [-2.7, -3.3, -3.85][level - 1];
      const cx1 = [2.5, 2.9, 3.3][level - 1];
      const cz0 = [-2.0, -2.5, -3.0][level - 1];
      const cz1 = level === 1 ? 3.3 : 4.3;
      const fx = cx1 - 0.5; // the forest track leaves the yard here
      const sz0 = cz0 + 1.0; // the felled strip on the right begins here

      // Ground: the yard, the felled strip, the dark floor of the forest, the tracks
      ground(b, cx0, cz0, cx1, cz1, SAWDUST);
      ground(b, cx1, sz0, X, cz1, mix(C.meadow, C.soil, 0.4));
      ground(b, -X, -Z, X, cz0, FLOOR);
      ground(b, -X, cz0, cx0, Z, FLOOR);
      ground(b, cx1, cz0, X, sz0, FLOOR);
      track(b, 0, cz1, 0, Z + e, 0.022);
      track(b, fx, -Z - e, fx, cz0);

      // The forest: conifers mostly, some leafy trees, none on the track or under the tower
      const tower = level >= 2 ? [-X + 1.3, -Z + 1.3] : null;
      const wooded = (x, z) => {
        if (tower && Math.abs(x - tower[0]) < 0.9 && Math.abs(z - tower[1]) < 0.9) return false;
        if (z < cz0 - 0.35) return Math.abs(x - fx) > 0.85;
        if (x < cx0 - 0.4) return z < cz1 + 0.3 || x < -X + 1.6;
        return x > cx1 + 0.4 && z < sz0 - 0.3;
      };
      const yard = (cx1 - cx0) * (cz1 - cz0);
      const step = Math.max(1, Math.sqrt((4 * X * Z - yard) / (139 - yard))); // a bigger plot gets no more trees, they stand wider
      const spots = [];
      for (let gx = -X + 0.5; gx < X; gx += step) {
        for (let gz = -Z + 0.5; gz < Z; gz += step) {
          const s = 0.95 + b.rand() * 0.55;
          const m = 0.56 * s;
          const x = Math.max(-X + m, Math.min(X - m, gx + (b.rand() - 0.5) * 0.6));
          const z = Math.max(-Z + m, Math.min(Z - m, gz + (b.rand() - 0.5) * 0.6));
          if (wooded(x, z)) spots.push([x, z, s]);
        }
      }
      // The triangle budget allows only so many trees: any more are thinned out evenly, and the
      // kinds follow a fixed mix (of fifteen: ten firs, two pines, two leafy trees, one big one).
      const keep = Math.min(1, MOST_TREES[level - 1] / spots.length);
      let planted = 0;
      spots.forEach(([x, z, s], i) => {
        if (Math.floor((i + 1) * keep) === Math.floor(i * keep)) return;
        const kind = (planted++ * 7 + 3) % 15;
        if (kind === 0) tree(b, x, z, s * 0.9);
        else if (kind === 4 || kind === 11) pine(b, x, z, s);
        else if (kind === 6 || kind === 13) b.at(x, 0, z, planted * 2.4, () => sapling(b, 0, 0, s * 1.9, kind === 6 ? C.leaf : C.leafLight, 6));
        else fir(b, x, z, s);
      });

      // The felled strip: stumps, a few trunks left lying, brush
      for (let i = 0; i < 5 + level * 2; i++) {
        const x = cx1 + 0.4 + b.rand() * (X - cx1 - 0.8);
        const z = sz0 + 0.3 + b.rand() * (cz1 - sz0 - 0.6);
        b.cyl(x, 0, z, 0.09 + b.rand() * 0.04, 0.1 + b.rand() * 0.06, BARK, { seg: 5, top: CUT });
      }
      log(b, cx1 + 1.3, 0, sz0 + 1.4, 0.09, 1.7, 0.5);
      log(b, X - 1.2, 0, cz1 - 1.5, 0.08, 1.5, -1.1);
      bush(b, X - 0.6, sz0 + 0.8, 1, 0.8);
      bush(b, cx1 + 0.9, cz1 - 0.5, 0.8, 0.3);

      // The mill at the back of the yard
      const md = 1.4 + level * 0.1;
      const mz = cz0 + 0.45 + md / 2;
      const mf = mz + md / 2;
      const mx0 = [-2.0, -2.9, -3.45][level - 1];
      const mx1 = [0.6, 0.9, 1.6][level - 1];
      sawmill(b, mx0, mx1, mx0 + [0, 1.1, 2.6][level - 1], mz, md, color);
      if (big) {
        // the boiler that burns the offcuts
        b.box(mx0 + 0.7, 0, mz - md / 2 - 0.3, 0.9, 0.6, 0.6, C.brick, { top: C.roofGrey });
        smoke.push(chimney(b, mx0 + 0.7, 0.6, mz - md / 2 - 0.3, 0.2, 2.0));
      }

      // Logs waiting on the right of the yard, sawn timber stacked on the left
      for (let i = 0; i < level; i++) logPile(b, cx1 - 1.05, mf + 0.75 + i * 1.05, 0, 3, 1.8 - (i % 2) * 0.15);
      const tx = mx0 + [0.5, 0.7, 1.15][level - 1];
      for (let i = 0; i < level * 2; i++) timber(b, tx + (i % 2) * 1.25, mf + 0.6 + Math.floor(i / 2) * 0.72, 0, 2 + ((i * 2) % 3 ? 1 : 0), 1.15);

      // Kilns where the timber dries: three chambers, their doors towards the yard
      if (big) {
        for (let i = 0; i < 3; i++) {
          const kz = 2.2 + i * 0.76;
          b.box(cx0 + 0.75, 0, kz, 1.2, 0.66, 0.72, C.panel, { top: C.roofFlat, ao: 0.88 });
          b.box(cx0 + 1.35, 0.04, kz, 0.03, 0.52, 0.56, i === 1 ? C.dark : C.steelDark, { ao: 1 });
          b.box(cx0 + 0.45, 0.66, kz, 0.16, 0.16, 0.16, C.steelDark, { ao: 1 });
        }
        b.box(cx0 + 0.75, 0.66, 2.96, 1.24, 0.06, 2.3, color, { ao: 1, top: C.roofFlat });
        timber(b, cx0 + 2.0, 2.96, 0, 2, 0.9);
      }

      // The forester's cabin by the gate, the sign, the lookout over the trees
      b.block(-2.2, 0, 5.0, 1.3, 0.56, 0.9, C.wood, { win: { faces: 'fb', cols: 2, rows: 1, base: 0.18, cap: 0.1, lit: 0.8 } });
      b.gable(-2.2, 0.56, 5.0, 1.3, 0.9, 0, 0.42, C.wood, C.roofBrown, { over: 0.1 });
      b.box(-1.55, 0, 5.0, 0.03, 0.4, 0.22, C.woodDark, { ao: 1 });
      b.box(-2.6, 0.7, 4.85, 0.14, 0.4, 0.14, C.stone, { top: C.dark });
      if (level === 1) flag(b, -1.2, 5.3, color, 1.3);
      else pylon(b, 0.95, Z - 0.35, color, 1.2);
      if (tower) lookout(b, tower[0], tower[1], 2.2 + level * 0.2, color);

      // Young trees planted in rows by the road, the timber lorry
      if (level >= 2) {
        ground(b, 0.75, cz1 + 0.25, X, Z, C.meadow);
        for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) b.cone(1.45 + i * 0.68, 0, cz1 + 0.6 + j * 0.62, 0.15, 0.4, j ? C.pine : C.pineDark, { seg: 4 });
        logLorry(b, 0.45, 2.5, 0, color);
      }
      lamp(b, -0.6, cz1 - 0.3, HALF);
    });
    return { smoke: smoke.map(([x, y, z]) => [x * k, y * k, z * k]) };
  },
  { lot: PLOT.rural },
);
