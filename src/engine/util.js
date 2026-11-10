// Small, dependency-free helpers shared by the whole code base.

/** Quantities below this are treated as zero (float residue guard). */
export const EPS = 1e-6;

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Exponential moving average; `prev == null` starts the series at `x`. */
export const ema = (prev, x, alpha) =>
  prev == null || Number.isNaN(prev) ? x : prev + (x - prev) * alpha;

export function sum(list, fn) {
  let s = 0;
  if (fn) for (const x of list) s += fn(x);
  else for (const x of list) s += x;
  return s;
}

export function maxBy(list, fn) {
  let best = null;
  let bestV = -Infinity;
  for (const x of list) {
    const v = fn(x);
    if (v > bestV) {
      bestV = v;
      best = x;
    }
  }
  return best;
}

export function minBy(list, fn) {
  return maxBy(list, (x) => -fn(x));
}

/** Returns a sorted copy (ascending unless `desc`). */
export function sortBy(list, fn, desc = false) {
  const out = [...list].sort((a, b) => fn(a) - fn(b));
  return desc ? out.reverse() : out;
}

export function groupBy(list, fn) {
  const map = new Map();
  for (const x of list) {
    const k = fn(x);
    const arr = map.get(k);
    if (arr) arr.push(x);
    else map.set(k, [x]);
  }
  return map;
}

/** Round to `digits` significant digits — keeps derived prices readable. */
export function roundSig(x, digits = 3) {
  if (!Number.isFinite(x) || x === 0) return 0;
  const mag = Math.ceil(Math.log10(Math.abs(x)));
  const f = 10 ** (digits - mag);
  return Math.round(x * f) / f;
}

/** Round to a fixed number of decimals. */
export function round(x, decimals = 0) {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

/** FNV-1a string hash → uint32. Used to turn text seeds into numbers. */
export function hashString(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/** Weighted merge of two stock lots: returns the blended attribute value. */
export function blend(qtyA, valA, qtyB, valB) {
  const total = qtyA + qtyB;
  return total <= EPS ? valB : (qtyA * valA + qtyB * valB) / total;
}
