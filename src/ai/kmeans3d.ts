/** k-means clustering in 3-D, with random and k-means++ initialisation. */

export type Vec3 = [number, number, number];

export function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());
}

const d2 = (a: Vec3, b: Vec3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Gaussian blobs inside a sphere of the given radius. */
export function makeBlobs(k: number, perBlob: number, spread: number, radius: number, seed: number) {
  const r = mulberry(seed);
  const centers: Vec3[] = [];
  while (centers.length < k) {
    const c: Vec3 = [(r() * 2 - 1) * radius * 0.7, (r() * 2 - 1) * radius * 0.5, (r() * 2 - 1) * radius * 0.7];
    if (centers.every((o) => d2(o, c) > (spread * 3.2) ** 2) || centers.length > 40) centers.push(c);
  }
  const points: Vec3[] = [];
  const labels: number[] = [];
  centers.forEach((c, i) => {
    for (let j = 0; j < perBlob; j++) {
      points.push([c[0] + gauss(r) * spread, c[1] + gauss(r) * spread, c[2] + gauss(r) * spread]);
      labels.push(i);
    }
  });
  return { points, labels, centers };
}

export function initCentroids(points: Vec3[], k: number, method: 'random' | 'kmeans++', r: () => number): Vec3[] {
  if (method === 'random') {
    const picked = new Set<number>();
    while (picked.size < Math.min(k, points.length)) picked.add(Math.floor(r() * points.length));
    return [...picked].map((i) => [...points[i]] as Vec3);
  }
  const cents: Vec3[] = [[...points[Math.floor(r() * points.length)]] as Vec3];
  while (cents.length < k) {
    const dist = points.map((p) => Math.min(...cents.map((c) => d2(p, c))));
    const total = dist.reduce((a, b) => a + b, 0);
    let t = r() * total;
    let idx = 0;
    for (; idx < dist.length - 1; idx++) if ((t -= dist[idx]) <= 0) break;
    cents.push([...points[idx]] as Vec3);
  }
  return cents;
}

export function assign(points: Vec3[], centroids: Vec3[]): Int32Array {
  const out = new Int32Array(points.length);
  points.forEach((p, i) => {
    let best = 0, bd = Infinity;
    centroids.forEach((c, j) => {
      const d = d2(p, c);
      if (d < bd) { bd = d; best = j; }
    });
    out[i] = best;
  });
  return out;
}

export function update(points: Vec3[], a: Int32Array, centroids: Vec3[]): { centroids: Vec3[]; moved: number } {
  const sums = centroids.map(() => [0, 0, 0, 0]);
  points.forEach((p, i) => {
    const s = sums[a[i]];
    s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
  });
  let moved = 0;
  const next = centroids.map((c, j) => {
    const s = sums[j];
    const n: Vec3 = s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : [...c] as Vec3;
    moved = Math.max(moved, Math.sqrt(d2(n, c)));
    return n;
  });
  return { centroids: next, moved };
}

export function inertia(points: Vec3[], a: Int32Array, centroids: Vec3[]): number {
  return points.reduce((s, p, i) => s + d2(p, centroids[a[i]]), 0);
}

export function kmeans(points: Vec3[], k: number, method: 'random' | 'kmeans++', r: () => number, maxIter = 60) {
  let centroids = initCentroids(points, k, method, r);
  let a = assign(points, centroids);
  let iterations = 0;
  for (; iterations < maxIter; iterations++) {
    const u = update(points, a, centroids);
    centroids = u.centroids;
    const next = assign(points, centroids);
    const changed = next.some((v, i) => v !== a[i]);
    a = next;
    if (!changed && u.moved < 1e-6) break;
  }
  return { centroids, assignment: a, iterations: iterations + 1, inertia: inertia(points, a, centroids) };
}

/** Best-of-3 inertia for k = 1 … kmax (the "elbow" chart). */
export function elbow(points: Vec3[], kmax: number, r: () => number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= kmax; k++) {
    let best = Infinity;
    for (let t = 0; t < 3; t++) best = Math.min(best, kmeans(points, k, 'kmeans++', r).inertia);
    out.push(best);
  }
  return out;
}
