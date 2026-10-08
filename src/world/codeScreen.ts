import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/**
 * One shared "code" texture for every active monitor: colourful syntax-like lines
 * on a dark editor background. It scrolls (see `scrollCode`), so busy desks look busy.
 */
let texture: CanvasTexture | null = null;

export function codeTexture() {
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#0f1430'; g.fillRect(0, 0, 128, 256);
  const colors = ['#ff79c6', '#8be9fd', '#50fa7b', '#f1fa8c', '#bd93f9', '#ffb86c', '#e6e6f0'];
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let line = 0; line < 32; line++) {
    let x = 6 + Math.floor(rand() * 4) * 8; // indentation
    const y = 4 + line * 8;
    const tokens = 1 + Math.floor(rand() * 4);
    for (let t = 0; t < tokens && x < 120; t++) {
      const w = 8 + Math.floor(rand() * 28);
      g.fillStyle = colors[Math.floor(rand() * colors.length)];
      g.fillRect(x, y, Math.min(w, 122 - x), 4);
      x += w + 5;
    }
  }
  texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 0.5);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Advance the shared scroll; call once per frame. */
export function scrollCode(dt: number) {
  if (texture) texture.offset.y = (texture.offset.y + dt * 0.06) % 1;
}
