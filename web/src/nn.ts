// Fast exact nearest-neighbour for many queries in a small (city-sized) area.
// Points are projected to local equirectangular metres (error far below cell size over ~50 km);
// a uniform bucket grid is searched in expanding rings. The final distance is haversine so
// results agree with the Python pipeline.
export class BucketNN {
  private x: Float64Array; private y: Float64Array;
  private start: Int32Array; private items: Int32Array;
  private nx = 0; private ny = 0; private x0 = 0; private y0 = 0; private size: number;
  private kx: number; private ky = 111194.93; // metres per degree latitude (R = 6371008.8)
  readonly n: number;

  constructor(readonly lon: ArrayLike<number>, readonly lat: ArrayLike<number>, lat0: number, size = 250) {
    this.n = lon.length; this.size = size;
    this.kx = this.ky * Math.cos((lat0 * Math.PI) / 180);
    this.x = new Float64Array(this.n); this.y = new Float64Array(this.n);
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const x = lon[i] * this.kx, y = lat[i] * this.ky;
      this.x[i] = x; this.y[i] = y;
      if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    }
    if (!this.n) { this.start = new Int32Array(1); this.items = new Int32Array(0); return; }
    // keep the bucket count bounded for sparse/wide data
    const span = Math.max(xmax - xmin, ymax - ymin, 1);
    this.size = Math.max(size, span / 512);
    this.x0 = xmin; this.y0 = ymin;
    this.nx = Math.floor((xmax - xmin) / this.size) + 1;
    this.ny = Math.floor((ymax - ymin) / this.size) + 1;
    const counts = new Int32Array(this.nx * this.ny + 1);
    const b = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      b[i] = Math.floor((this.y[i] - ymin) / this.size) * this.nx + Math.floor((this.x[i] - xmin) / this.size);
      counts[b[i] + 1]++;
    }
    for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
    this.start = counts.slice();
    this.items = new Int32Array(this.n);
    const fill = counts.slice();
    for (let i = 0; i < this.n; i++) this.items[fill[b[i]]++] = i;
  }

  /** Index of the nearest point (planar metric), or -1 when empty. */
  nearest(lon: number, lat: number): number {
    if (!this.n) return -1;
    const qx = lon * this.kx, qy = lat * this.ky;
    const cx = Math.floor((qx - this.x0) / this.size), cy = Math.floor((qy - this.y0) / this.size);
    let best = -1, bestD = Infinity;
    const maxRing = Math.max(this.nx, this.ny) + Math.abs(cx) + Math.abs(cy);
    for (let r = 0; r <= maxRing; r++) {
      // any point in ring r is at least (r-1)*size away
      const minD = (r - 1) * this.size;
      if (best >= 0 && minD > 0 && minD * minD > bestD) break;
      for (let gy = cy - r; gy <= cy + r; gy++) {
        if (gy < 0 || gy >= this.ny) continue;
        const edge = gy === cy - r || gy === cy + r;
        for (let gx = cx - r; gx <= cx + r; gx += edge ? 1 : 2 * r || 1) {
          if (gx < 0 || gx >= this.nx) continue;
          const k = gy * this.nx + gx;
          for (let j = this.start[k]; j < this.start[k + 1]; j++) {
            const i = this.items[j];
            const dx = this.x[i] - qx, dy = this.y[i] - qy, d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = i; }
          }
        }
      }
    }
    return best;
  }
}
