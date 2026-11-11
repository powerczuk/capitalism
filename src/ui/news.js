// Turning stored news items ({ k: key, p: params }) into text. Ids in the
// params are resolved here, at display time, so the feed follows the
// language setting.

import { L, t } from './i18n.js';
import { int, price } from './format.js';

export function newsText(game, item) {
  const { content, state } = game;
  const p = { ...item.p };
  if (p.product) p.product = L(content.products.find(p.product)?.name) || p.product;
  if (p.city) p.city = state.cities[p.city]?.name ?? p.city;
  if (p.perShare != null) p.perShare = price(p.perShare);
  if (p.qty != null) p.qty = int(p.qty);
  return t(item.k, p);
}

export const newsTone = (item) => (item.t === 'good' ? 'good' : item.t === 'bad' ? 'bad' : 'info');
