/**
 * A* search over a height-field (the walkable surface of the voxel world).
 * Used by Nova, the guide robot, which also replays the search so you can
 * watch A* explore. Set `weight: 0` for Dijkstra's algorithm.
 */

export interface SurfaceGrid {
  w: number;
  h: number;
  /** Standing height of a column, or −1 if it can't be stood on (water, lava, too tall). */
  height(x: number, z: number): number;
}

export interface SearchResult {
  found: boolean;
  path: [number, number][];
  /** Cells in the order they were expanded (closed). */
  expanded: [number, number][];
  cost: number;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(k: number, v: number) {
    const K = this.keys, V = this.vals;
    let i = K.length;
    K.push(k); V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= K[i]) break;
      [K[p], K[i]] = [K[i], K[p]];
      [V[p], V[i]] = [V[i], V[p]];
      i = p;
    }
  }
  pop(): number {
    const K = this.keys, V = this.vals;
    const top = V[0];
    const lk = K.pop()!, lv = V.pop()!;
    if (K.length) {
      K[0] = lk; V[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < K.length && K[l] < K[m]) m = l;
        if (r < K.length && K[r] < K[m]) m = r;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]];
        [V[m], V[i]] = [V[i], V[m]];
        i = m;
      }
    }
    return top;
  }
}

export function astar(
  grid: SurfaceGrid,
  start: [number, number],
  goal: [number, number],
  opts: { weight?: number; maxExpand?: number; climb?: number } = {},
): SearchResult {
  const { w, h } = grid;
  const weight = opts.weight ?? 1;
  const maxExpand = opts.maxExpand ?? 250_000;
  const climb = opts.climb ?? 1;
  const N = w * h;
  const g = new Float32Array(N).fill(Infinity);
  const parent = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const idx = (x: number, z: number) => z * w + x;
  const [sx, sz] = start, [gx, gz] = goal;
  const heur = (x: number, z: number) => {
    const dx = Math.abs(x - gx), dz = Math.abs(z - gz);
    return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * weight;
  };
  const open = new MinHeap();
  const s = idx(sx, sz);
  g[s] = 0;
  open.push(heur(sx, sz), s);
  const expanded: [number, number][] = [];
  const goalIdx = idx(gx, gz);

  while (open.size && expanded.length < maxExpand) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w, cz = (cur - cx) / w;
    expanded.push([cx, cz]);
    if (cur === goalIdx) break;
    const ch = grid.height(cx, cz);
    for (const [dx, dz, cost] of DIRS) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const n = idx(nx, nz);
      if (closed[n]) continue;
      const nh = grid.height(nx, nz);
      if (nh < 0 || Math.abs(nh - ch) > climb) continue;
      // No cutting corners past blocked cells.
      if (dx && dz && (grid.height(cx + dx, cz) < 0 || grid.height(cx, cz + dz) < 0)) continue;
      const ng = g[cur] + cost + Math.abs(nh - ch) * 0.5;
      if (ng < g[n]) {
        g[n] = ng;
        parent[n] = cur;
        open.push(ng + heur(nx, nz), n);
      }
    }
  }

  if (!closed[goalIdx]) return { found: false, path: [], expanded, cost: Infinity };
  const path: [number, number][] = [];
  for (let c = goalIdx; c !== -1; c = parent[c]) path.push([c % w, Math.floor(c / w)]);
  path.reverse();
  return { found: true, path, expanded, cost: g[goalIdx] };
}
