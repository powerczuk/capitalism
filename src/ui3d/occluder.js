// What hides what: a quick test of whether a ray meets some geometry before
// it gets as far as a given distance. A scene uses it for what cannot be
// clicked itself — the town between the plots — but still hides what stands
// behind it: a plot behind a tower is not a plot one can click.
//
//   const town = new Occluder(plan.size);
//   town.build([geometries.solid, geometries.glass]);      // world-space triangles
//   town.block(ray.origin, ray.direction, 120);            // → a distance below 120, or Infinity
//
// Inside it is a grid laid over the ground. Every cell knows the highest
// point of what stands in or at it and which triangles reach into it, so a
// ray is only tested against the few triangles of the cells it passes low
// enough over. The grid only narrows the search: the answer is exact.

export class Occluder {
  /**
   * @param {number} half the grid covers −half … +half on x and z
   * @param {number} [cell] width of a cell
   * @param {number} [floor] what does not rise above this is ground (kerbs, hedges, parked cars) and hides nothing
   */
  constructor(half, cell = 1, floor = 0.4) {
    this.cell = cell;
    this.floor = floor;
    this.n = Math.max(1, Math.ceil((2 * half) / cell));
    this.half = (this.n * cell) / 2;
    this.top = new Float32Array(this.n * this.n); // highest point per cell
    this.start = new Uint32Array(this.n * this.n + 1); // where a cell's triangles begin in `list`
    this.list = new Uint32Array(0); // triangles by cell: geometry number × 2^27 + offset into its index
    this.sources = [];
  }

  /** Replace what is known with the triangles of these geometries (positions in world space; holes in the list are fine). */
  build(geometries) {
    const { half, cell, n, floor, top } = this;
    const sources = geometries.filter((g) => g?.index).map((g) => ({ p: g.attributes.position.array, index: g.index.array }));
    this.sources = sources;
    top.fill(0);
    const count = new Uint32Array(n * n);
    const EPS = 1e-4;
    // The cells a triangle reaches into or touches, by its bounding box. A wall
    // standing exactly on a line of the grid belongs to the cells on both sides.
    const span = (p, a, b, c, out) => {
      out[0] = Math.max(0, Math.floor((Math.min(p[a], p[b], p[c]) + half) / cell - EPS));
      out[1] = Math.min(n - 1, Math.floor((Math.max(p[a], p[b], p[c]) + half) / cell + EPS));
      out[2] = Math.max(0, Math.floor((Math.min(p[a + 2], p[b + 2], p[c + 2]) + half) / cell - EPS));
      out[3] = Math.min(n - 1, Math.floor((Math.max(p[a + 2], p[b + 2], p[c + 2]) + half) / cell + EPS));
    };
    const box = [0, 0, 0, 0];
    const each = (visit) => {
      sources.forEach(({ p, index }, g) => {
        for (let i = 0; i + 2 < index.length; i += 3) {
          const a = index[i] * 3;
          const b = index[i + 1] * 3;
          const c = index[i + 2] * 3;
          const high = Math.max(p[a + 1], p[b + 1], p[c + 1]);
          if (high < floor) continue;
          span(p, a, b, c, box);
          for (let j = box[2]; j <= box[3]; j++) for (let k = box[0]; k <= box[1]; k++) visit(j * n + k, g * 134217728 + i, high);
        }
      });
    };
    each((at, id, high) => {
      count[at]++;
      if (top[at] < high) top[at] = high;
    });
    const start = this.start;
    start[0] = 0;
    for (let at = 0; at < n * n; at++) start[at + 1] = start[at] + count[at];
    this.list = new Uint32Array(start[n * n]);
    count.fill(0);
    each((at, id) => {
      this.list[start[at] + count[at]++] = id;
    });
    return this;
  }

  /** Distance at which a ray meets a triangle (either side), or Infinity. */
  _hit(o, d, id) {
    const { p, index } = this.sources[Math.floor(id / 134217728)];
    const i = id % 134217728;
    const a = index[i] * 3;
    const b = index[i + 1] * 3;
    const c = index[i + 2] * 3;
    // Möller–Trumbore
    const e1x = p[b] - p[a];
    const e1y = p[b + 1] - p[a + 1];
    const e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a];
    const e2y = p[c + 1] - p[a + 1];
    const e2z = p[c + 2] - p[a + 2];
    const px = d.y * e2z - d.z * e2y;
    const py = d.z * e2x - d.x * e2z;
    const pz = d.x * e2y - d.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-9 && det < 1e-9) return Infinity;
    const inv = 1 / det;
    const tx = o.x - p[a];
    const ty = o.y - p[a + 1];
    const tz = o.z - p[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return Infinity;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
    if (v < 0 || u + v > 1) return Infinity;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return t > 0 ? t : Infinity;
  }

  /**
   * Does the ray meet anything before `limit`?
   * @param {{x: number, y: number, z: number}} o origin
   * @param {{x: number, y: number, z: number}} d direction (unit length)
   * @param {number} [limit] look no further than this
   * @returns {number} a distance below `limit` at which something is in the way, or Infinity
   */
  block(o, d, limit = Infinity) {
    const { half, cell, n, top, start, list } = this;
    if (!list.length) return Infinity;
    // the part of the ray that runs over the grid
    let t0 = 0;
    let t1 = limit;
    for (const [oc, dc] of [
      [o.x, d.x],
      [o.z, d.z],
    ]) {
      if (Math.abs(dc) < 1e-9) {
        if (oc < -half || oc >= half) return Infinity;
        continue;
      }
      const a = (-half - oc) / dc;
      const b = (half - oc) / dc;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (!(t0 < t1)) return Infinity;

    // walk the cells it passes over, one after another
    let t = t0 + 1e-6;
    let i = Math.min(n - 1, Math.max(0, Math.floor((o.x + d.x * t + half) / cell)));
    let j = Math.min(n - 1, Math.max(0, Math.floor((o.z + d.z * t + half) / cell)));
    const stepI = d.x > 0 ? 1 : -1;
    const stepJ = d.z > 0 ? 1 : -1;
    const leaveX = (k) => (Math.abs(d.x) < 1e-9 ? Infinity : ((k + (d.x > 0 ? 1 : 0)) * cell - half - o.x) / d.x);
    const leaveZ = (k) => (Math.abs(d.z) < 1e-9 ? Infinity : ((k + (d.z > 0 ? 1 : 0)) * cell - half - o.z) / d.z);
    let tx = leaveX(i);
    let tz = leaveZ(j);
    for (let guard = 0; guard < 4 * n + 8 && t < t1; guard++) {
      const leave = Math.min(tx, tz, t1);
      const at = j * n + i;
      // only where the ray is lower than what stands in the cell can it meet anything there
      if (top[at] > 0 && Math.min(o.y + d.y * t, o.y + d.y * leave) < top[at]) {
        for (let k = start[at]; k < start[at + 1]; k++) {
          const hit = this._hit(o, d, list[k]);
          if (hit < limit) return hit;
        }
      }
      if (leave >= t1) break;
      if (tx <= tz) {
        i += stepI;
        t = tx;
        tx = leaveX(i);
      } else {
        j += stepJ;
        t = tz;
        tz = leaveZ(j);
      }
      if (i < 0 || i >= n || j < 0 || j >= n) break;
    }
    return Infinity;
  }
}
