// Companies: creation at game start and removal (bankruptcy / takeover).

import { newLedger } from './accounting.js';

export const MAX_COMPANIES = 8; // one colour slot each

/**
 * @param {import('../engine/game.js').Game} game
 * @param {{name: string, color: number, human?: boolean, ai?: {level: string, persona: string}|null}} def
 */
export function createCompany(game, { name, color, human = false, ai = null }) {
  const { state, content } = game;
  const B = content.balance;
  const cash = state.settings.startCash ?? B.startCash;
  const co = {
    id: game.newId('k'),
    name,
    color, // index into the categorical palette
    human,
    alive: true,
    ai: ai ? { level: ai.level, persona: ai.persona, mem: {} } : null,
    founded: state.day,
    cash,
    loan: 0,
    tech: {}, // productId → technology level (missing = world level)
    brand: {}, // productId → brand rating 0-100
    ads: {}, // productId → monthly advertising budget
    buy: {}, // productId → smoothed daily units bought from outside the company
    sold: {}, // productId → units of own-made goods sold to consumers this month
    shares: {
      total: B.stock.shares,
      founder: Math.round(B.stock.shares * B.stock.founderShare),
      held: {}, // companyId → shares held by that company
    },
    basis: {}, // companyId → what this company paid for the shares it holds there
    price: cash / B.stock.shares, // share price
    pd: [], // recent daily share prices
    div: 0, // dividend payout ratio the company has declared
    paid: 0, // payout ratio it actually honoured at the last year end
    lastIssue: -99999,
    raised: 0, // cash taken in by issuing shares, less cash spent on buying them back
    m: newLedger(), // ledger of the running month
    reports: [], // closed months
    negDays: 0, // consecutive days in financial distress
    seq: 0, // counter for default building names
  };
  state.companies[co.id] = co;
  state.companyOrder.push(co.id);
  return co;
}

/** Shares of `co` that trade freely on the market. */
export function publicFloat(co) {
  let held = 0;
  for (const id in co.shares.held) held += co.shares.held[id];
  return Math.max(0, co.shares.total - co.shares.founder - held);
}

/** Fraction of `target` owned by `holder` (0-1). */
export function stakeOf(target, holderId) {
  return (target.shares.held[holderId] || 0) / target.shares.total;
}

/**
 * Remove a company from play. Its buildings are closed; its shares become
 * worthless; the shares it held in others return to the market.
 *
 * `settled` means the shareholders have already been paid (a takeover);
 * otherwise whoever held shares writes off what they paid for them.
 */
export function dissolveCompany(game, co, { keepBuildings = false, settled = false } = {}) {
  const { state } = game;
  if (!keepBuildings) {
    for (const b of [...game.buildingsOf(co.id)]) delete state.buildings[b.id];
    game.invalidate();
  }
  for (const id of state.companyOrder) {
    const other = state.companies[id];
    if (!settled && other.alive && other.basis[co.id]) other.m.invest -= other.basis[co.id];
    delete other.shares.held[co.id];
    delete other.basis[co.id];
  }
  co.shares.held = {};
  co.alive = false;
  co.ended = state.day;
  co.ads = {};
}

export const companySystem = {
  id: 'companies',
  order: 8,
  setup(game) {
    const { state, content, rng } = game;
    const settings = state.settings;
    const usedColors = new Set();
    const nextColor = (wanted) => {
      let c = Number.isInteger(wanted) ? ((wanted % MAX_COMPANIES) + MAX_COMPANIES) % MAX_COMPANIES : 0;
      for (let i = 0; i < MAX_COMPANIES && usedColors.has(c); i++) c = (c + 1) % MAX_COMPANIES;
      usedColors.add(c);
      return c;
    };

    const wantedCash = settings.startCash == null ? NaN : Number(settings.startCash);
    settings.startCash = Number.isFinite(wantedCash) && wantedCash >= 0 ? wantedCash : content.balance.startCash;

    state.humanId = null;
    if (settings.player) {
      const name = String(settings.player.name || '').trim().slice(0, 32) || 'Moja Spółka';
      const co = createCompany(game, { name, color: nextColor(settings.player.color), human: true });
      state.humanId = co.id;
    }

    const wantedRivals = Array.isArray(settings.rivals) ? settings.rivals : [];
    const rivals = wantedRivals.slice(0, MAX_COMPANIES - (settings.player ? 1 : 0));
    const templates = rng.shuffle(content.companyTemplates.all());
    const levels = content.difficulties.ids();
    const personas = content.personalities.ids();
    rivals.forEach((entry, i) => {
      const rival = entry && typeof entry === 'object' ? entry : {};
      const template = templates[i % templates.length];
      const level = content.difficulties.has(rival.level) ? rival.level : rng.pick(levels);
      const persona = content.personalities.has(rival.persona)
        ? rival.persona
        : template.persona && content.personalities.has(template.persona) && rng.chance(0.6)
          ? template.persona
          : rng.pick(personas);
      createCompany(game, {
        name: (typeof rival.name === 'string' && rival.name.trim().slice(0, 32)) || template.name,
        color: nextColor(rival.color ?? i + 1),
        ai: { level, persona },
      });
    });
    // Store the resolved line-up so the setup screen can show what "random" became.
    settings.rivals = game
      .companies()
      .filter((c) => c.ai)
      .map((c) => ({ level: c.ai.level, persona: c.ai.persona, name: c.name }));
  },
};
