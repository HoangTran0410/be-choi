/**
 * Drawing the trace library's pictures: on a canvas (colouring lines, the template), as
 * a small SVG data URL (picker tiles) and turning an SVG scene into a JPEG thumbnail.
 */
import type { Pt } from '../trace/logic';
import { strokePath } from '../trace/modes';
import type { Picture } from '../trace/shapes';

const pathCache = new WeakMap<Picture, Pt[][]>();

/** Every stroke of a picture as a dense polyline in the unit square. */
export function picturePaths(pic: Picture): Pt[][] {
  let paths = pathCache.get(pic);
  if (!paths) {
    paths = pic.strokes.map((s) => strokePath(s).pts);
    pathCache.set(pic, paths);
  }
  return paths;
}

export interface PictureDrawOptions {
  /** Draw the strokes. `color` overrides the stroke's own; `alpha(i)` fades one stroke. */
  lines?: { width: number; color?: string; alpha?: (i: number) => number; widthOf?: (i: number) => number };
  /** Draw the coloured regions, at this opacity. */
  fills?: { alpha: number };
}

/** Draw `pic` into a `w` × `h` canvas whose unit square is the whole canvas. */
export function drawPicture(c: CanvasRenderingContext2D, pic: Picture, w: number, h: number, opts: PictureDrawOptions): void {
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (opts.fills && opts.fills.alpha > 0) {
    c.globalAlpha = Math.min(1, opts.fills.alpha);
    for (const f of pic.fills) {
      c.fillStyle = f.color;
      c.beginPath();
      f.pts.forEach((q, i) => (i === 0 ? c.moveTo(q.x * w, q.y * h) : c.lineTo(q.x * w, q.y * h)));
      c.closePath();
      c.fill();
    }
  }
  if (opts.lines) {
    const paths = picturePaths(pic);
    paths.forEach((pts, i) => {
      const alpha = opts.lines!.alpha ? opts.lines!.alpha(i) : 1;
      if (alpha <= 0 || pts.length < 2) return;
      c.globalAlpha = Math.min(1, alpha);
      c.strokeStyle = opts.lines!.color ?? pic.strokes[i]!.color;
      c.lineWidth = opts.lines!.widthOf ? opts.lines!.widthOf(i) : opts.lines!.width;
      c.beginPath();
      pts.forEach((q, k) => (k === 0 ? c.moveTo(q.x * w, q.y * h) : c.lineTo(q.x * w, q.y * h)));
      c.stroke();
    });
  }
  c.restore();
}

const thumbCache = new Map<string, string>();

/**
 * The picture as an SVG data URL for a picker tile. `outline` gives a colouring-page look
 * (white paper, dark lines, no colour); otherwise the finished, coloured picture.
 */
export function pictureThumbUrl(pic: Picture, outline = false): string {
  const key = `${pic.id}:${outline ? 'o' : 'c'}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const d = (pts: readonly Pt[]): string => pts.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(3)} ${q.y.toFixed(3)}`).join('');
  const parts: string[] = [`<rect width="1" height="1" fill="${outline ? '#ffffff' : pic.bg}"/>`];
  if (!outline) for (const f of pic.fills) parts.push(`<polygon points="${f.pts.map((q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`).join(' ')}" fill="${f.color}"/>`);
  picturePaths(pic).forEach((pts, i) => {
    parts.push(
      `<path d="${d(pts)}" fill="none" stroke="${outline ? '#3f3f46' : pic.strokes[i]!.color}" stroke-width="${outline ? 0.04 : 0.03}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">${parts.join('')}</svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  thumbCache.set(key, url);
  return url;
}

function loadImage(src: string, ms = 6000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image !== 'function') return resolve(null);
    const img = new Image();
    const timer = setTimeout(() => resolve(null), ms);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/**
 * Turn an SVG scene (unit viewBox) into a square JPEG data URL on `bg` paper.
 * Resolves null where SVG images or canvas are unavailable; never throws.
 */
export async function svgToJpeg(svg: SVGSVGElement, bg: string, side = 480): Promise<string | null> {
  try {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(side));
    clone.setAttribute('height', String(side));
    clone.setAttribute('viewBox', '0 0 1 1');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '1');
    rect.setAttribute('height', '1');
    rect.setAttribute('fill', bg);
    clone.insertBefore(rect, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`);
    if (!img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.fillStyle = bg;
    c.fillRect(0, 0, side, side);
    c.drawImage(img, 0, 0, side, side);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}

export { loadImage };
