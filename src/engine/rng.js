// Deterministic pseudo-random generator (mulberry32).
//
// The generator keeps its 32-bit state *inside the game state object*
// (`holder[key]`), so saving the game also saves the random stream and a
// loaded game continues exactly where it stopped. Same seed + same commands
// = same game, which is what makes the headless tests and balance runs
// reproducible.

export class Rng {
  /**
   * @param {object} holder object that stores the state (usually `game.state`)
   * @param {string} key property name on the holder
   */
  constructor(holder, key = 'rng') {
    this.holder = holder;
    this.key = key;
    if (!Number.isInteger(holder[key])) holder[key] = 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next() {
    const h = this.holder;
    let t = (h[this.key] = (h[this.key] + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [a, b). */
  range(a, b) {
    return a + (b - a) * this.next();
  }

  /** Uniform integer in [a, b] (inclusive). */
  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(list) {
    return list.length ? list[Math.floor(this.next() * list.length)] : undefined;
  }

  /** Pick one item with probability proportional to `weightFn(item)`. */
  weighted(list, weightFn) {
    let total = 0;
    const weights = list.map((item) => {
      const w = Math.max(0, weightFn(item));
      total += w;
      return w;
    });
    if (total <= 0) return this.pick(list);
    let r = this.next() * total;
    for (let i = 0; i < list.length; i++) {
      r -= weights[i];
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  /** Normal distribution (Box–Muller). */
  normal(mean = 0, sd = 1) {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Multiplicative noise around 1 with relative spread `rel`, never below `floor`. */
  noise(rel, floor = 0.2) {
    return rel <= 0 ? 1 : Math.max(floor, 1 + this.normal(0, rel));
  }

  /** Fisher–Yates shuffle; returns a new array. */
  shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
