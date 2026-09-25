/** Isometric voxel art in SVG — the hero illustration, drawn from data. */
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.min(255, Math.round(v * k)));
  return `rgb(${c.join(',')})`;
};

export function isoScene(cubes: { x: number; y: number; z: number; color: string }[], size = 22): string {
  const s = size;
  const px = (x: number, y: number, z: number) => [(x - z) * s * 0.866, (x + z) * s * 0.5 - y * s];
  const sorted = [...cubes].sort((a, b) => a.x + a.z - (b.x + b.z) || a.y - b.y);
  const polys: string[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of sorted) {
    const p = (dx: number, dy: number, dz: number) => {
      const [x, y] = px(c.x + dx, c.y + dy, c.z + dz);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    };
    const top = [p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)];
    const left = [p(0, 1, 1), p(1, 1, 1), p(1, 0, 1), p(0, 0, 1)];
    const right = [p(1, 1, 0), p(1, 1, 1), p(1, 0, 1), p(1, 0, 0)];
    polys.push(
      `<polygon points="${top.join(' ')}" fill="${shade(c.color, 1.08)}"/>`,
      `<polygon points="${left.join(' ')}" fill="${shade(c.color, 0.72)}"/>`,
      `<polygon points="${right.join(' ')}" fill="${shade(c.color, 0.88)}"/>`,
    );
  }
  const pad = 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}" role="img" aria-label="A voxel neural network rising from a grassy island" stroke="rgba(0,0,0,0.18)" stroke-width="0.6" stroke-linejoin="round">${polys.join('')}</svg>`;
}

/** A floating island with a neural network sculpture on top. */
export function heroCubes() {
  const cubes: { x: number; y: number; z: number; color: string }[] = [];
  for (let x = 0; x < 9; x++)
    for (let z = 0; z < 9; z++) {
      const edge = x === 0 || z === 0 || x === 8 || z === 8;
      cubes.push({ x, y: 0, z, color: edge ? '#8a5a3b' : '#5fb04a' });
      if (!edge && (x + z) % 5 === 0) cubes.push({ x, y: -1, z, color: '#8a5a3b' });
    }
  const layers = [[2, 4, 6], [1, 3, 5, 7], [3, 5]];
  const colors = ['#7ef9ff', '#b57cff', '#ffc53d'];
  layers.forEach((xs, l) => {
    const z = 1 + l * 3;
    for (const x of xs) {
      const hgt = 2 + l;
      for (let y = 1; y <= hgt; y++) cubes.push({ x, y, z, color: y === hgt ? colors[l] : '#ece6dc' });
    }
  });
  cubes.push({ x: 7, y: 1, z: 7, color: '#6b4a2b' }, { x: 7, y: 2, z: 7, color: '#6b4a2b' }, { x: 7, y: 3, z: 7, color: '#3f8f3a' });
  return cubes;
}
