export interface BuildExample {
  id: string;
  name: string;
  blurb: string;
  js: string;
  py: string;
}

/**
 * Starter programs for the world builder. Coordinates are relative to the spot
 * 3 blocks in front of you: x → your right, y → up, z → away from you.
 */
export const BUILD_EXAMPLES: BuildExample[] = [
  {
    id: 'robot',
    name: 'Shape robot',
    blurb: 'shape(): any size, colour and turn — not stuck to the grid.',
    js: `// Smooth shapes: shape(kind, x, y, z, { size, color, rotate, glow })
shape('box', 0, 0, 4, { size: [3, 3, 2], color: 'silver' });            // body
shape('sphere', 0, 3, 4, { size: 2.2, color: 'white' });                // head
shape('sphere', -0.5, 3.8, 3, { size: 0.5, color: 'cyan', glow: true }); // eyes
shape('sphere', 0.5, 3.8, 3, { size: 0.5, color: 'cyan', glow: true });
shape('cylinder', 0, 5.1, 4, { size: [0.15, 1, 0.15], color: 'grey' }); // antenna
shape('sphere', 0, 6, 4, { size: 0.5, color: 'red', glow: true });
for (const side of [-2, 2]) {
  shape('capsule', side, 0.5, 4, { size: [0.8, 2.6, 0.8], color: 'blue', rotate: [0, 0, side * 10] }); // arms
}
// A ring of glowing cones around it
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  shape('cone', Math.round(Math.cos(a) * 7), 0, 4 + Math.round(Math.sin(a) * 7), { size: [1, 2 + (i % 3), 1], color: i % 2 ? 'orange' : 'purple', glow: true });
}
`,
    py: `# Smooth shapes: shape(kind, x, y, z, size=..., color=..., rotate=..., glow=...)
import math
shape('box', 0, 0, 4, size=(3, 3, 2), color='silver')            # body
shape('sphere', 0, 3, 4, size=2.2, color='white')                # head
shape('sphere', -0.5, 3.8, 3, size=0.5, color='cyan', glow=True) # eyes
shape('sphere', 0.5, 3.8, 3, size=0.5, color='cyan', glow=True)
shape('cylinder', 0, 5.1, 4, size=(0.15, 1, 0.15), color='grey') # antenna
shape('sphere', 0, 6, 4, size=0.5, color='red', glow=True)
for side in (-2, 2):
    shape('capsule', side, 0.5, 4, size=(0.8, 2.6, 0.8), color='blue', rotate=(0, 0, side * 10))  # arms
# A ring of glowing cones around it
for i in range(12):
    a = i / 12 * 2 * math.pi
    shape('cone', round(math.cos(a) * 7), 0, 4 + round(math.sin(a) * 7), size=(1, 2 + i % 3, 1),
          color='orange' if i % 2 else 'purple', glow=True)
`,
  },
  {
    id: 'tower',
    name: 'Rainbow tower',
    blurb: 'A loop, a list and your first build.',
    js: `// x → right, y → up, z → away from you
const colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
for (let y = 0; y < 14; y++) {
  block(0, y, 0, colors[y % colors.length]);
}
`,
    py: `# x → right, y → up, z → away from you
colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple']
for y in range(14):
    block(0, y, 0, colors[y % len(colors)])
`,
  },
  {
    id: 'pyramid',
    name: 'Pyramid',
    blurb: 'Nested loops and fill().',
    js: `const size = 9;
for (let level = 0; level <= size; level++) {
  const r = size - level;
  fill(-r, level, -r + size, r, level, r + size, level % 2 ? 'sand' : 'gold');
}
`,
    py: `size = 9
for level in range(size + 1):
    r = size - level
    fill(-r, level, -r + size, r, level, r + size, 'gold' if level % 2 == 0 else 'sand')
`,
  },
  {
    id: 'surface',
    name: 'Plot a 3D function',
    blurb: 'Data science in blocks: z = sin(x)·cos(y), coloured by height.',
    js: `// Every column is one (x, y) sample; its height is the function value.
const ramp = ['blue', 'cyan', 'green', 'yellow', 'orange', 'red'];
for (let x = -12; x <= 12; x++) {
  for (let z = 0; z <= 24; z++) {
    const v = Math.sin(x / 3) * Math.cos((z - 12) / 3);   // -1 … 1
    const h = Math.round((v + 1) * 4);                     //  0 … 8
    const color = ramp[Math.min(5, Math.floor((v + 1) * 3))];
    block(x, h, z, color);
  }
}
`,
    py: `import math
# Every column is one (x, y) sample; its height is the function value.
ramp = ['blue', 'cyan', 'green', 'yellow', 'orange', 'red']
for x in range(-12, 13):
    for z in range(25):
        v = math.sin(x / 3) * math.cos((z - 12) / 3)   # -1 … 1
        h = round((v + 1) * 4)                         #  0 … 8
        block(x, h, z, ramp[min(5, int((v + 1) * 3))])
`,
  },
  {
    id: 'clusters',
    name: '3D data clusters',
    blurb: 'Random Gaussian blobs — what k-means sees.',
    js: `// Box–Muller gives normally distributed numbers.
function randn() {
  return Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
}
const centers = [[-6, 6, 8, 'red'], [6, 4, 10, 'blue'], [0, 10, 16, 'green']];
for (const [cx, cy, cz, color] of centers) {
  for (let i = 0; i < 90; i++) {
    block(Math.round(cx + randn() * 2), Math.max(0, Math.round(cy + randn() * 2)), Math.round(cz + randn() * 2), color);
  }
}
`,
    py: `import random
centers = [(-6, 6, 8, 'red'), (6, 4, 10, 'blue'), (0, 10, 16, 'green')]
for cx, cy, cz, color in centers:
    for _ in range(90):
        x = round(random.gauss(cx, 2))
        y = max(0, round(random.gauss(cy, 2)))
        z = round(random.gauss(cz, 2))
        block(x, y, z, color)
`,
  },
  {
    id: 'network',
    name: 'Neural network sculpture',
    blurb: 'Layers of neurons joined by weights, in crystal and gold.',
    js: `const layers = [4, 6, 6, 2];
const gap = 7;
const pos = layers.map((n, l) =>
  Array.from({ length: n }, (_, i) => [(i - (n - 1) / 2) * 3, 2 + l * 0, 4 + l * gap])
);
// connections first, so neurons sit on top
for (let l = 0; l < layers.length - 1; l++) {
  for (const [x1, y1, z1] of pos[l]) for (const [x2, y2, z2] of pos[l + 1]) {
    line(Math.round(x1), y1 + 2, z1, Math.round(x2), y2 + 2, z2, 'glass');
  }
}
for (const layer of pos) for (const [x, y, z] of layer) {
  fill(Math.round(x), 0, z, Math.round(x), y + 1, z, 'quartz');
  block(Math.round(x), y + 2, z, 'crystal');
}
`,
    py: `layers = [4, 6, 6, 2]
gap = 7
pos = [[(round((i - (n - 1) / 2) * 3), 2, 4 + l * gap) for i in range(n)] for l, n in enumerate(layers)]
for l in range(len(layers) - 1):
    for (x1, y1, z1) in pos[l]:
        for (x2, y2, z2) in pos[l + 1]:
            line(x1, y1 + 2, z1, x2, y2 + 2, z2, 'glass')
for layer in pos:
    for (x, y, z) in layer:
        fill(x, 0, z, x, y + 1, z, 'quartz')
        block(x, y + 2, z, 'crystal')
`,
  },
  {
    id: 'dome',
    name: 'Glass dome',
    blurb: 'sphere() with hollow = true.',
    js: `sphere(0, 0, 10, 8, 'glass', true);
fill(-8, -1, 2, 8, -1, 18, 'quartz');
block(0, 0, 10, 'beacon');
`,
    py: `sphere(0, 0, 10, 8, 'glass', hollow=True)
fill(-8, -1, 2, 8, -1, 18, 'quartz')
block(0, 0, 10, 'beacon')
`,
  },
  {
    id: 'sierpinski',
    name: 'Sierpiński triangle',
    blurb: 'Recursion makes fractals.',
    js: `function tri(x, z, size, depth) {
  if (depth === 0) {
    for (let i = 0; i < size; i++) fill(x + i, 0, z + i, x + 2 * size - 2 - i, 0, z + i, 'purple');
    return;
  }
  const h = size / 2;
  tri(x, z, h, depth - 1);
  tri(x + size, z, h, depth - 1);
  tri(x + h, z + h, h, depth - 1);
}
tri(-16, 2, 16, 3);
`,
    py: `def tri(x, z, size, depth):
    if depth == 0:
        for i in range(int(size)):
            fill(int(x + i), 0, int(z + i), int(x + 2 * size - 2 - i), 0, int(z + i), 'purple')
        return
    h = size / 2
    tri(x, z, h, depth - 1)
    tri(x + size, z, h, depth - 1)
    tri(x + h, z + h, h, depth - 1)

tri(-16, 2, 16, 3)
`,
  },
  {
    id: 'stairs',
    name: 'Spiral staircase',
    blurb: 'Trigonometry you can climb.',
    js: `for (let i = 0; i < 48; i++) {
  const a = i * 0.4;
  const x = Math.round(Math.cos(a) * 4);
  const z = Math.round(Math.sin(a) * 4) + 6;
  block(x, Math.floor(i / 2), z, 'planks');
}
fill(0, 0, 6, 0, 24, 6, 'log');
`,
    py: `import math
for i in range(48):
    a = i * 0.4
    x = round(math.cos(a) * 4)
    z = round(math.sin(a) * 4) + 6
    block(x, i // 2, z, 'planks')
fill(0, 0, 6, 0, 24, 6, 'log')
`,
  },
];
