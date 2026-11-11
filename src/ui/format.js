// Number, money and date formatting in the current language.

import { dateOf } from '../engine/calendar.js';
import { getLocale, t } from './i18n.js';

const cache = new Map();

function nf(maxDigits, minDigits = 0) {
  const tag = getLocale() === 'pl' ? 'pl-PL' : 'en-US';
  const key = `${tag}|${maxDigits}|${minDigits}`;
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.NumberFormat(tag, { maximumFractionDigits: maxDigits, minimumFractionDigits: minDigits })));
  return f;
}

const MINUS = '−';
const NBSP = ' ';

/** Split a magnitude into a short number and a unit suffix key. */
function compact(abs) {
  if (abs >= 1e9) return [abs / 1e9, 2, 'unit.bn'];
  if (abs >= 1e7) return [abs / 1e6, 1, 'unit.m'];
  if (abs >= 1e6) return [abs / 1e6, 2, 'unit.m'];
  if (abs >= 1e4) return [abs / 1e3, 0, 'unit.k'];
  if (abs >= 1e3) return [abs / 1e3, 1, 'unit.k'];
  return [abs, 0, null];
}

/** Compact money: 1,25 mln $ · 12 tys. $ · 980 $ (or $1.25M in English). */
export function money(x, { sign = false } = {}) {
  if (!Number.isFinite(x)) return '–';
  const [value, digits, unit] = compact(Math.abs(x));
  const body = nf(digits).format(value) + (unit ? (getLocale() === 'pl' ? NBSP : '') + t(unit) : '');
  const prefix = x < -0.5 ? MINUS : sign && x > 0.5 ? '+' : '';
  return getLocale() === 'pl' ? `${prefix}${body}${NBSP}$` : `${prefix}$${body}`;
}

/** Full money with thousands separators: 1 234 567 $. */
export function moneyFull(x) {
  if (!Number.isFinite(x)) return '–';
  const body = nf(0).format(Math.abs(Math.round(x)));
  const prefix = x < -0.5 ? MINUS : '';
  return getLocale() === 'pl' ? `${prefix}${body}${NBSP}$` : `${prefix}$${body}`;
}

/** A unit price: two decimals below 100, whole dollars above. */
export function price(x) {
  if (!Number.isFinite(x)) return '–';
  const body = x >= 1000 ? nf(0).format(x) : x >= 100 ? nf(1).format(x) : nf(2, 2).format(x);
  return getLocale() === 'pl' ? `${body}${NBSP}$` : `$${body}`;
}

/** Compact quantity: 12 tys. · 3,4 mln · 870 · 4,2 */
export function num(x) {
  if (!Number.isFinite(x)) return '–';
  const abs = Math.abs(x);
  const sign = x < 0 ? MINUS : '';
  if (abs >= 1e3) {
    const [value, digits, unit] = compact(abs);
    return sign + nf(digits).format(value) + (getLocale() === 'pl' ? NBSP : '') + t(unit);
  }
  return sign + nf(abs < 10 && abs % 1 !== 0 ? 1 : 0).format(abs);
}

/** Whole number with separators. */
export const int = (x) => (Number.isFinite(x) ? nf(0).format(Math.round(x)) : '–');

/** Fraction → percent: 0.123 → 12%. */
export function pct(x, digits = 0, { sign = false } = {}) {
  if (!Number.isFinite(x)) return '–';
  const v = x * 100;
  const prefix = v < 0 ? MINUS : sign && v > 0 ? '+' : '';
  return `${prefix}${nf(digits, digits).format(Math.abs(v))}%`;
}

/** A 0-100 score without decimals. */
export const score = (x) => (Number.isFinite(x) ? nf(0).format(x) : '–');

/** 12 mar 2027 */
export function dateStr(day) {
  const d = dateOf(day);
  return `${d.dom} ${t(`month.short.${d.month}`)} ${d.year}`;
}

/** mar 2027 */
export function monthStr(day) {
  const d = dateOf(day);
  return `${t(`month.short.${d.month}`)} ${d.year}`;
}

/** Short axis label for a month-end day: "mar '27". */
export function monthTick(day) {
  const d = dateOf(day);
  return `${t(`month.short.${d.month}`)} ’${String(d.year).slice(2)}`;
}
