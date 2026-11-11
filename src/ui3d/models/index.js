// Registry of building models.
//
// A model is a function that draws one building with a Builder (see kit.js):
//
//   registerModel('bakery', (b, ctx) => {
//     b.block(0, 0, -0.4, 3, 1.2, 2, C.plasterWarm, { win: { faces: 'f' } });
//     b.gable(0, 1.2, -0.4, 3, 2, 0, 0.7, C.plasterWarm, C.roofRed);
//     b.lamp(0, 0.9, 0.62, 1.2, 0.2, 0.05, ctx.color);         // sign in the owner's colour
//   });
//
// ctx
//   level   1…3 — bigger levels should look bigger
//   color   the owner's colour (hex): use it for signs, awnings, flags
//   lot     { w, d } — the plot; the model stands at its centre, its front
//           (+z) faces the street. Stay inside it.
//   rand()  deterministic random numbers for this very building
//
// A model may return extras the scene animates:
//   { smoke: [[x, y, z], …] }   chimney tops that puff
//
// Building types pick their model by id; a type without one (a mod's new
// building) falls back to `type.model` (the id of another model) and then to
// a generic model for its kind — so new content shows up without 3D work.

import { Builder } from '../kit.js';

const MODELS = new Map();
const PLOTS = new Map();

/**
 * @param {string} id building type id (or 'kind:retail' … for a fallback)
 * @param {(b: Builder, ctx: object) => (object|void)} fn
 * @param {{lot?: {w: number, d: number}}} [meta] the plot size the model is drawn for
 *        (only the model viewer uses it — in a city the plot comes from the plan)
 */
export function registerModel(id, fn, meta = {}) {
  MODELS.set(id, fn);
  if (meta.lot) PLOTS.set(id, meta.lot);
}

/** Plot sizes of the districts the base game builds in (w along the street, d away from it). */
export const PLOT = {
  retail: { w: 5, d: 5 },
  industrial: { w: 10, d: 5 },
  rural: { w: 12, d: 12 },
};

export const plotOf = (id) => PLOTS.get(id) ?? PLOT.retail;

export function hasModel(id) {
  return MODELS.has(id);
}

export const modelIds = () => [...MODELS.keys()];

/** The model function for a building type definition ({ id, kind, model? }). */
export function modelFor(type) {
  return MODELS.get(type.id) ?? MODELS.get(type.model) ?? MODELS.get(`kind:${type.kind}`) ?? MODELS.get('kind:generic');
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Build the geometries of one building.
 * @param {{id: string, kind?: string, model?: string}|string} type building type (or a model id)
 * @param {{level?: number, color?: number, lot?: {w: number, d: number}, seed?: string|number, night?: boolean, progress?: number}} [opts]
 * @returns {{geometries: object, extras: object, triangles: number}}
 */
export function buildModel(type, opts = {}) {
  const def = typeof type === 'string' ? { id: type } : type;
  const fn = modelFor(def);
  const seed = typeof opts.seed === 'number' ? opts.seed : hash(String(opts.seed ?? def.id));
  const b = new Builder(seed);
  b.night = opts.night !== false;
  const ctx = {
    level: Math.max(1, Math.min(3, Math.round(opts.level ?? 1))),
    color: opts.color ?? 0x2a78d6,
    lot: opts.lot ?? { w: 5, d: 5 },
    progress: opts.progress, // construction sites: how far the work has got (0 → 1)
    rand: b.rand,
    type: def,
  };
  const extras = (fn && fn(b, ctx)) || {};
  return { geometries: b.build(), extras, triangles: b.triangles };
}
