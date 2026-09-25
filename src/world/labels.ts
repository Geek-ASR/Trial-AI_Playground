import * as THREE from 'three';

export interface LabelOptions {
  accent?: string;
  scale?: number;
}

/** A camera-facing text sign rendered to a canvas texture. */
export function makeLabel(lines: string[], opts: LabelOptions = {}): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  updateLabel(sprite, lines, opts);
  sprite.renderOrder = 10;
  return sprite;
}

export function updateLabel(sprite: THREE.Sprite, lines: string[], opts: LabelOptions = {}) {
  const pad = 18;
  const title = 34;
  const sub = 24;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontTitle = `700 ${title}px "Space Grotesk", system-ui, sans-serif`;
  const fontSub = `500 ${sub}px "Inter", system-ui, sans-serif`;
  ctx.font = fontTitle;
  let w = ctx.measureText(lines[0] ?? '').width;
  ctx.font = fontSub;
  for (const l of lines.slice(1)) w = Math.max(w, ctx.measureText(l).width);
  canvas.width = Math.ceil(w + pad * 2);
  canvas.height = Math.ceil(pad * 2 + title + (lines.length - 1) * (sub + 8));

  ctx.fillStyle = 'rgba(12, 14, 28, 0.78)';
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 16);
  ctx.fill();
  ctx.fillStyle = opts.accent ?? '#7ef9ff';
  ctx.fillRect(0, canvas.height - 6, canvas.width, 6);

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.font = fontTitle;
  ctx.fillText(lines[0] ?? '', pad, pad - 2);
  ctx.font = fontSub;
  ctx.fillStyle = 'rgba(230, 235, 255, 0.85)';
  lines.slice(1).forEach((l, i) => ctx.fillText(l, pad, pad + title + 6 + i * (sub + 8)));

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.map?.dispose();
  mat.map = tex;
  mat.needsUpdate = true;
  const s = (opts.scale ?? 1) / 90;
  sprite.scale.set(canvas.width * s, canvas.height * s, 1);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
