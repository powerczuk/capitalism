// The pricing assistant: looks after the price of a shelf its owner has put on
// "auto".
//
// Every day it works out the price at which the shelf earns most and moves
// the price a step towards it. Three things move that price:
//
//   supply       a shelf fed by the company's own production line that keeps
//                running empty is priced for the goods that actually reach
//                it, not for customers it cannot serve — the price climbs
//                until what is asked for is what arrives. (With an outside
//                supplier that cannot keep up, a higher price would not help:
//                suppliers share out what they have by the size of the
//                orders, and a dearer shelf orders less. There the assistant
//                keeps the price and says that the supplier is the trouble.)
//   demand       the city's appetite for the product (its people, the economy,
//                fashions) against what the shelf can serve: when more
//                customers come than it can take, the price rises until the
//                queue is short; when they stay away, it comes down;
//   competition  every other shelf with the product in the city — its price,
//                quality and brand, and how many customers it can take.
//
// It reads only what the owner can see, and changes the price through the
// same command the owner uses. What it is doing is kept on the shelf, so the
// interface can say what the assistant is reacting to:
//   slot.why    what holds the price where it is: 'short' (own supply), 'queue'
//               (demand), 'rival' or 'alone' (competition) — or 'starved'
//               when an outside supplier cannot keep up
//   slot.aim    the price it is heading for
//   slot.from   the price before its last change, and
//   slot.moved  the day of that change.
//
// Measured over eight three-year games against computer rivals it earns the
// player what the weekly assistant it replaces did (within the noise of such
// games), reacts within a day instead of a week, and where a factory of the
// player's own cannot fill its shelves it earns about a fifth more on them.

import { EPS, roundSig } from '../engine/util.js';
import { brandOf, forecast, marketSnapshot, slotCapacity, storePull } from '../sim/market.js';
import { parseSrc, quote, SUP } from '../sim/supply.js';

/** Price points (× the usual price) tried first; the best one is then refined to about 1 %. */
const GRID = [0.6, 0.72, 0.86, 1, 1.15, 1.32, 1.52, 1.75, 2, 2.3, 2.65, 3];
const REFINE = [0.07, 0.025, 0.008];
/** The price moves at most this share of itself in a day (the first time it is set outright). */
export const ASSISTANT_STEP = 0.08;
/** Changes smaller than this are not worth making. */
const DEAD_BAND = 0.004;
/** Never sell closer to cost than this. */
const FLOOR = 1.05;

/** Is the shelf fed by a production line of the company itself? */
function ownSupply(game, co, slot) {
  const src = parseSrc(slot.src);
  return src?.kind === 'line' && game.state.buildings[src.building]?.co === co.id;
}

/**
 * What a shelf can count on having to sell in a day, judged by how often it
 * runs empty.
 *
 * While the shelf never runs empty, that is all it can serve (`cap`). The
 * more of its days end with an empty shelf, the more the answer leans on
 * what it actually sold — which is then all that reached it.
 *
 * @returns {{rate: number, tight: number}} units a day, and how tight supply is (0 = plentiful … 1 = always short)
 */
export function supplyOf(slot, cap) {
  const emptyDays = slot.so ?? 0;
  if (emptyDays <= 0.05 || slot.s == null) return { rate: cap, tight: 0 };
  const tight = Math.min(1, (emptyDays - 0.05) / 0.3);
  const arrived = Math.max(slot.s, cap * 0.03) * 1.03;
  return { rate: Math.min(cap, cap * (1 - tight) + arrived * tight), tight };
}

/** The price at which an offer earns most in a market, found to about 1 %. */
function bestPrice(game, snap, offer, ignoreKey, ownerId) {
  const floor = offer.unitCost * FLOOR;
  let best = null;
  const consider = (wanted) => {
    const price = Math.max(floor, wanted);
    const f = forecast(game, snap, { ...offer, price }, ignoreKey, ownerId);
    const profit = (price - offer.unitCost) * f.units - f.ownLoss;
    if (!best || profit > best.profit * (1 + 1e-9) + 1e-9) best = { price, profit, units: f.units };
  };
  for (const m of GRID) consider(snap.ref * m);
  for (const step of REFINE) {
    const centre = best.price;
    for (const k of [-2, -1, 1, 2]) consider(centre * (1 + k * step));
  }
  return best;
}

/**
 * What the assistant makes of a shelf today.
 * @returns {null | {target: number, next: number, cause: string, units: number, profit: number, supply: number, cap: number}}
 *   `target` — the price the shelf earns most at; `next` — today's step
 *   towards it; `cause` — what holds the price where it is (see the top of
 *   this file).
 */
export function assistantAdvice(game, co, b, index) {
  const slot = b.slots?.[index];
  if (!slot) return null;
  const product = game.content.products.get(slot.product);
  // an empty shelf is costed at what its supplier asks today
  const q = slot.qty > EPS && slot.uc > 0 ? null : quote(game, co, b.city, slot.product, slot.src);
  const unitCost = q ? q.unitCost : slot.uc;
  if (!(unitCost > 0)) return null;
  const snap = marketSnapshot(game, b.city, slot.product);
  const cap = slotCapacity(game, b, product);
  // Supply moves the price only where the company's own line feeds the shelf.
  const scarce = supplyOf(slot, cap);
  const own = ownSupply(game, co, slot);
  const supply = own ? scarce : { rate: cap, tight: 0 };
  const offer = {
    unitCost,
    quality: q ? q.quality : slot.q,
    brand: brandOf(game, q ? q.by : slot.by, slot.product),
    factor: storePull(game, b),
    cap: supply.rate,
  };
  const best = bestPrice(game, snap, offer, `${b.id}:${index}`, co.id);
  const rivals = snap.offers.some((o) => o.co !== co.id && o.stock > EPS);
  const full = best.units >= supply.rate * 0.97; // at this price the shelf sells all it can serve
  // an outside supplier that keeps the shelf short: nothing the price can mend, but worth saying
  const starved = !own && scarce.tight > 0.3 && slot.sup !== SUP.OK;
  const cause = supply.tight > 0.3 ? 'short' : starved ? 'starved' : full ? 'queue' : rivals ? 'rival' : 'alone';
  const target = roundSig(best.price, 3);
  // The first time, the price is simply set; afterwards it moves a step a day.
  const managed = slot.aim != null && slot.price > 0;
  const next = managed ? roundSig(Math.min(slot.price * (1 + ASSISTANT_STEP), Math.max(slot.price * (1 - ASSISTANT_STEP), target)), 3) : target;
  return { target, next, cause, units: best.units, profit: best.profit, supply: supply.rate, cap };
}

/** Re-price the shelves a company has handed over to the assistant. */
export function runAssistant(game, co) {
  if (!co?.alive) return;
  for (const b of game.buildingsOf(co.id)) {
    if (b.kind !== 'retail' || !game.isReady(b)) continue;
    for (let i = 0; i < b.slots.length; i++) {
      const slot = b.slots[i];
      if (!slot?.auto) continue;
      const advice = assistantAdvice(game, co, b, i);
      if (!advice) continue;
      const before = slot.price;
      const move = Math.abs(advice.next - before) / before > DEAD_BAND;
      if (move && game.exec(co.id, 'setSlotPrice', { building: b.id, slot: i, price: advice.next }).ok) {
        slot.from = before;
        slot.moved = game.state.day;
      }
      slot.aim = advice.target;
      slot.why = advice.cause;
    }
  }
}
