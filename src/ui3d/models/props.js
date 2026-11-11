// Small things that turn up everywhere: cars, trees, lamps, fences, crates.
// Building models call these instead of drawing their own, so a car in a
// supermarket car park is the same car that drives down the street.
//
// Every prop takes the Builder first, then where it stands (x, z on the
// ground of the current frame) and, where it makes sense, which way it faces
// (ry: 0 = towards +z).

import { C } from '../palette.js';
import { shade } from '../kit.js';

const CAR_COLORS = [0xd9d6cf, 0x3c4650, 0xb7392f, 0x2f5e9e, 0x8a8f95, 0xe2e4e6, 0x25292e, 0x4d7a57, 0xc9a23a, 0x7a4a36];
const HALF = Math.PI / 2;

/** A passenger car, 0.9 long. `tint` picks the paint (any number); `paint` sets it outright. */
export function car(b, x, z, ry = 0, tint = b.rand() * 97, paint = CAR_COLORS[Math.floor(Math.abs(tint)) % CAR_COLORS.length]) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0.07, 0, 0.42, 0.15, 0.9, paint, { ao: 0.8 });
    b.box(0, 0.22, -0.04, 0.38, 0.13, 0.46, shade(paint, 0.92), { ao: 1 });
    b.box(0, 0.235, -0.04, 0.385, 0.085, 0.4, C.glassDark, { ao: 1 }); // windows all round
    b.box(0, 0.235, -0.04, 0.33, 0.1, 0.47, C.glassDark, { ao: 1 });
    for (const sx of [-0.2, 0.2]) for (const sz of [-0.28, 0.28]) b.box(sx, 0, sz, 0.07, 0.13, 0.18, C.black, { ao: 1 });
  });
}

/** A delivery truck, 1.5 long. `body` is the colour of the box (a company colour reads well). */
export function truck(b, x, z, ry = 0, body = C.white) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0.1, 0.52, 0.5, 0.42, 0.42, C.plasterCool, { ao: 0.85 }); // cab
    b.box(0, 0.33, 0.6, 0.505, 0.14, 0.27, C.glassDark, { ao: 1 });
    b.box(0, 0.1, -0.2, 0.54, 0.62, 1.02, body, { ao: 0.85 });
    b.box(0, 0.5, -0.2, 0.545, 0.08, 1.025, shade(body, 0.8), { ao: 1 });
    for (const sx of [-0.25, 0.25]) for (const sz of [-0.5, 0.05, 0.55]) b.box(sx, 0, sz, 0.08, 0.16, 0.22, C.black, { ao: 1 });
  });
}

/** A lorry with a trailer, 2.3 long — for factories, mines and ports. */
export function lorry(b, x, z, ry = 0, load = C.steel) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0.1, 0.92, 0.5, 0.46, 0.4, C.red, { ao: 0.85 });
    b.box(0, 0.36, 0.99, 0.505, 0.14, 0.27, C.glassDark, { ao: 1 });
    b.box(0, 0.16, -0.22, 0.52, 0.1, 1.8, C.dark, { ao: 1 });
    b.box(0, 0.26, -0.22, 0.54, 0.5, 1.76, load, { ao: 0.88 });
    for (const sx of [-0.25, 0.25]) for (const sz of [-0.92, -0.62, 0.12, 0.95]) b.box(sx, 0, sz, 0.08, 0.17, 0.24, C.black, { ao: 1 });
  });
}

/** A leafy tree. `s` scales it (1 ≈ 1.5 high), `tint` varies the green. */
export function tree(b, x, z, s = 1, tint = b.rand()) {
  const green = [C.leaf, C.leafDark, C.leafLight, 0x5f9a4c][Math.floor(tint * 4) % 4];
  b.at(x, 0, z, tint * 6.283, () => {
    b.cyl(0, 0, 0, 0.06, 0.5, C.trunk, { seg: 5, r2: 0.045, cap: false });
    b.ball(0, 0.9, 0, 0.46, green, { seg: 6, rings: 4, sy: 1.05 });
    b.ball(0.2, 0.72, 0.12, 0.3, shade(green, 0.92), { seg: 5, rings: 3 });
    b.ball(-0.18, 1.12, -0.1, 0.27, shade(green, 1.06), { seg: 5, rings: 3 });
  }, s);
}

/** A conifer. */
export function pine(b, x, z, s = 1, tint = b.rand()) {
  const green = tint > 0.5 ? C.pine : C.pineDark;
  b.at(x, 0, z, tint * 6.283, () => {
    b.cyl(0, 0, 0, 0.06, 0.35, C.trunk, { seg: 5, cap: false });
    b.cone(0, 0.25, 0, 0.46, 0.75, green, { seg: 6 });
    b.cone(0, 0.7, 0, 0.36, 0.65, shade(green, 1.06), { seg: 6 });
    b.cone(0, 1.12, 0, 0.24, 0.55, shade(green, 1.12), { seg: 6 });
  }, s);
}

export function bush(b, x, z, s = 1, tint = b.rand()) {
  b.ball(x, 0.12 * s, z, 0.24 * s, tint > 0.5 ? C.leaf : C.leafDark, { seg: 5, rings: 3, sy: 0.8 });
}

/**
 * A street lamp, 1.5 high, its arm reaching towards `ry`. At night it throws a
 * pool of light of radius `pool` on the ground (0 = none, e.g. on a bridge).
 */
export function lamp(b, x, z, ry = 0, pool = 1.35) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0, 0, 0.06, 1.45, 0.06, C.steelDark, { ao: 1 });
    b.box(0, 1.42, 0.16, 0.05, 0.04, 0.36, C.steelDark, { ao: 1 });
    b.lamp(0, 1.37, 0.3, 0.13, 0.05, 0.16, C.lampWarm);
    if (pool > 0) b.pool(0, 0.075, 0.3, pool);
  });
}

/** A run of fence from (x1, z1) to (x2, z2). */
export function fence(b, x1, z1, x2, z2, color = C.steelDark, h = 0.28) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.01) return;
  const ry = Math.atan2(x2 - x1, z2 - z1);
  b.at((x1 + x2) / 2, 0, (z1 + z2) / 2, ry, () => {
    b.box(0, h * 0.55, 0, 0.03, 0.03, len, color, { ao: 1 });
    b.box(0, h * 0.95, 0, 0.03, 0.03, len, color, { ao: 1 });
    const posts = Math.max(2, Math.round(len / 0.7) + 1);
    for (let i = 0; i < posts; i++) b.box(0, 0, -len / 2 + (i * len) / (posts - 1), 0.045, h, 0.045, color, { ao: 1 });
  });
}

/** A low hedge from (x1, z1) to (x2, z2). */
export function hedge(b, x1, z1, x2, z2, h = 0.22) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ry = Math.atan2(x2 - x1, z2 - z1);
  b.box((x1 + x2) / 2, 0, (z1 + z2) / 2, 0.2, h, len, C.leafDark, { ry, top: C.leaf, ao: 0.9 });
}

/** Rooftop air-conditioning unit. */
export function ac(b, x, y, z, s = 1) {
  b.box(x, y, z, 0.34 * s, 0.16 * s, 0.34 * s, C.panelDark, { top: C.steelDark, ao: 0.9 });
  b.cyl(x, y + 0.16 * s, z, 0.1 * s, 0.02, C.dark, { seg: 6 });
}

/** A stack of crates or pallets, n high. */
export function crates(b, x, z, n = 2, color = C.wood) {
  for (let i = 0; i < n; i++) b.box(x + (i % 2) * 0.03, i * 0.2, z - (i % 2) * 0.03, 0.34, 0.2, 0.34, i % 2 ? shade(color, 0.9) : color, { ao: 0.92 });
}

/** A shipping container, 1.3 long. */
export function container(b, x, y, z, ry = 0, color = C.blue) {
  b.at(x, y, z, ry, () => {
    b.box(0, 0, 0, 0.5, 0.5, 1.3, color, { ao: 0.9, top: shade(color, 0.85) });
    for (const sz of [-0.43, -0.22, 0, 0.22, 0.43]) b.box(0, 0.03, sz, 0.515, 0.44, 0.03, shade(color, 0.82), { ao: 1 });
  });
}

/** A storage tank or silo: a cylinder with a domed or conical top. */
export function silo(b, x, z, r, h, color = C.panel, cone = false) {
  b.cyl(x, 0, z, r, h, color, { seg: 12 });
  for (let y = h * 0.3; y < h; y += h * 0.3) b.cyl(x, y, z, r * 1.015, 0.04, shade(color, 0.86), { seg: 12, cap: false });
  if (cone) b.cone(x, h, z, r * 1.04, r * 0.7, shade(color, 0.9), { seg: 12 });
  else b.ball(x, h, z, r, shade(color, 0.94), { seg: 12, rings: 3, half: true, sy: 0.45 });
}

/** A chimney stack; returns where its smoke starts (for the scene's smoke puffs). */
export function chimney(b, x, y, z, r, h, color = C.brick) {
  b.cyl(x, y, z, r, h, color, { seg: 8, r2: r * 0.72 });
  b.cyl(x, y + h, z, r * 0.8, 0.07, shade(color, 0.7), { seg: 8, r2: r * 0.8 });
  b.cyl(x, y + h * 0.82, z, r * 0.8, 0.09, C.white, { seg: 8, r2: r * 0.77, cap: false });
  return [x, y + h + 0.1, z];
}

/** A flag on a pole, in the company colour. */
export function flag(b, x, z, color, h = 1.5) {
  b.box(x, 0, z, 0.04, h, 0.04, C.steel, { ao: 1 });
  b.box(x + 0.2, h - 0.3, z, 0.38, 0.26, 0.02, color, { ao: 1 });
}

/**
 * A roadside pylon sign: the company colour on a mast, glowing at night.
 * The board faces ±z.
 */
export function pylon(b, x, z, color, h = 1.7, ry = 0) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0, 0, 0.1, h - 0.5, 0.1, C.steelDark, { ao: 1 });
    b.lamp(0, h - 0.56, 0, 0.62, 0.56, 0.12, color, shade(color, 1.25));
    b.box(0, h - 0.56, 0, 0.66, 0.04, 0.14, C.white, { ao: 1 });
    b.box(0, h - 0.25, 0, 0.5, 0.05, 0.13, C.white, { ao: 1 });
  });
}

/**
 * Marked parking bays along x, cars facing ±z, some of them taken.
 * `fill` is the share of bays with a car in them.
 */
export function parking(b, x, z, bays, fill = 0.5, ry = 0) {
  const pitch = 0.56;
  b.at(x, 0, z, ry, () => {
    for (let i = 0; i <= bays; i++) b.plane(-(bays * pitch) / 2 + i * pitch, 0.012, 0, 0.035, 1.0, C.marking);
    for (let i = 0; i < bays; i++) {
      if (b.rand() < fill) car(b, -(bays * pitch) / 2 + (i + 0.5) * pitch, 0.02 + (b.rand() - 0.5) * 0.08, b.rand() < 0.5 ? 0 : Math.PI, b.rand() * 97);
    }
  });
}

/** An awning or canopy: a thin slab on two posts, front edge at +z. */
export function canopy(b, x, y, z, w, d, color, ry = 0) {
  b.at(x, 0, z, ry, () => {
    b.box(0, y, 0, w, 0.07, d, color, { ao: 1, bottom: true, top: shade(color, 0.92) });
    for (const sx of [-w / 2 + 0.06, w / 2 - 0.06]) b.box(sx, 0, d / 2 - 0.06, 0.05, y, 0.05, C.steel, { ao: 1 });
  });
}

/** A loading dock door with a raised platform, facing `ry`. */
export function dock(b, x, z, ry = 0, w = 0.7) {
  b.at(x, 0, z, ry, () => {
    b.box(0, 0, 0.14, w + 0.2, 0.2, 0.28, C.concreteDark, { ao: 0.9 });
    b.box(0, 0.2, 0.016, w, 0.5, 0.03, C.steelDark, { ao: 1 });
    for (let i = 1; i < 4; i++) b.box(0, 0.2 + i * 0.12, 0.034, w, 0.012, 0.01, C.steel, { ao: 1 });
  });
}

export { CAR_COLORS, HALF };
