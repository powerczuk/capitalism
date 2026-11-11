// Translations. UI strings live in src/i18n/<locale>.js; names of products,
// buildings etc. are stored next to their definitions as { pl, en } objects
// and read with `L()`. Plugins can add strings through `content.translate()`.

import { pl } from '../i18n/pl.js';
import { en } from '../i18n/en.js';

const dictionaries = { pl: { ...pl }, en: { ...en } };
const FALLBACK = 'pl';
let locale = 'pl';
let pluralRules = new Intl.PluralRules('pl');

export const LOCALES = [
  { id: 'pl', name: 'Polski' },
  { id: 'en', name: 'English' },
];

export function setLocale(id) {
  locale = dictionaries[id] ? id : FALLBACK;
  pluralRules = new Intl.PluralRules(locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

export const getLocale = () => locale;

/** Merge extra strings (from plugins) into a locale. */
export function extendLocale(id, strings) {
  dictionaries[id] = { ...(dictionaries[id] || {}), ...strings };
}

export function hasKey(key) {
  return key in dictionaries[locale] || key in dictionaries[FALLBACK];
}

/** Translate a key; `{name}` placeholders are filled from `params`. */
export function t(key, params) {
  let text = dictionaries[locale][key] ?? dictionaries[FALLBACK][key] ?? key;
  if (params) text = text.replace(/\{(\w+)\}/g, (whole, name) => (params[name] != null ? params[name] : whole));
  return text;
}

/**
 * Plural-aware translation. The entry holds the forms separated by "|" in the
 * order one|few|many (Polish) or one|other (English): `tn('n.days', 5)` → "5 dni".
 */
export function tn(key, n, params) {
  const forms = t(key).split('|');
  const rule = pluralRules.select(Math.abs(n));
  const index = locale === 'pl' ? { one: 0, few: 1, many: 2, other: 2 }[rule] : rule === 'one' ? 0 : 1;
  const form = forms[Math.min(index, forms.length - 1)];
  return form.replace(/\{(\w+)\}/g, (whole, name) => (name === 'n' ? n : params?.[name] ?? whole));
}

/** Pick the current language from a `{ pl, en }` object (plain strings pass through). */
export function L(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[locale] ?? value[FALLBACK] ?? value.en ?? '';
}
