/**
 * Ready-made scenes for the puzzle: a few emoji arranged on a sky and a ground, painted on a
 * canvas once per round (like the single-emoji pictures). All coordinates are fractions of the side.
 */

export interface SceneItem {
  emoji: string;
  x: number;
  y: number;
  /** Font size as a fraction of the side. */
  s: number;
}

export interface Scene {
  id: string;
  /** Vietnamese name, spoken. */
  name: string;
  /** Sky gradient, top to bottom. */
  sky: [string, string];
  /** Ground colour; the ground starts at `horizon`. */
  ground: string;
  horizon: number;
  items: SceneItem[];
}

export const SCENES: readonly Scene[] = [
  {
    id: 'farm',
    name: 'nông trại',
    sky: ['#7dd3fc', '#e0f2fe'],
    ground: '#86efac',
    horizon: 0.66,
    items: [
      { emoji: '☀️', x: 0.82, y: 0.16, s: 0.2 },
      { emoji: '🏠', x: 0.34, y: 0.55, s: 0.34 },
      { emoji: '🌳', x: 0.8, y: 0.58, s: 0.28 },
      { emoji: '🐄', x: 0.3, y: 0.86, s: 0.24 },
      { emoji: '🐔', x: 0.7, y: 0.88, s: 0.18 },
    ],
  },
  {
    id: 'sea',
    name: 'biển xanh',
    sky: ['#38bdf8', '#0ea5e9'],
    ground: '#0369a1',
    horizon: 0.3,
    items: [
      { emoji: '🐳', x: 0.3, y: 0.42, s: 0.3 },
      { emoji: '🐠', x: 0.74, y: 0.55, s: 0.2 },
      { emoji: '🐙', x: 0.68, y: 0.82, s: 0.24 },
      { emoji: '🦀', x: 0.26, y: 0.84, s: 0.18 },
      { emoji: '🐚', x: 0.5, y: 0.9, s: 0.12 },
    ],
  },
  {
    id: 'space',
    name: 'vũ trụ',
    sky: ['#312e81', '#6d28d9'],
    ground: '#4c1d95',
    horizon: 0.96,
    items: [
      { emoji: '🌙', x: 0.2, y: 0.22, s: 0.2 },
      { emoji: '🚀', x: 0.55, y: 0.5, s: 0.34 },
      { emoji: '🪐', x: 0.8, y: 0.2, s: 0.22 },
      { emoji: '⭐', x: 0.2, y: 0.74, s: 0.14 },
      { emoji: '🌍', x: 0.78, y: 0.78, s: 0.2 },
    ],
  },
  {
    id: 'garden',
    name: 'khu vườn',
    sky: ['#bae6fd', '#ecfccb'],
    ground: '#bef264',
    horizon: 0.7,
    items: [
      { emoji: '🌳', x: 0.22, y: 0.5, s: 0.32 },
      { emoji: '🦋', x: 0.62, y: 0.28, s: 0.16 },
      { emoji: '🌻', x: 0.62, y: 0.7, s: 0.22 },
      { emoji: '🌷', x: 0.84, y: 0.78, s: 0.18 },
      { emoji: '🐝', x: 0.42, y: 0.38, s: 0.12 },
      { emoji: '🐌', x: 0.3, y: 0.9, s: 0.14 },
    ],
  },
  {
    id: 'zoo',
    name: 'sở thú',
    sky: ['#fde68a', '#fef9c3'],
    ground: '#fdba74',
    horizon: 0.72,
    items: [
      { emoji: '🦒', x: 0.22, y: 0.5, s: 0.34 },
      { emoji: '🐘', x: 0.62, y: 0.62, s: 0.34 },
      { emoji: '🦁', x: 0.3, y: 0.88, s: 0.22 },
      { emoji: '🐒', x: 0.84, y: 0.3, s: 0.16 },
    ],
  },
  {
    id: 'city',
    name: 'thành phố',
    sky: ['#bfdbfe', '#f1f5f9'],
    ground: '#94a3b8',
    horizon: 0.74,
    items: [
      { emoji: '🏢', x: 0.28, y: 0.45, s: 0.36 },
      { emoji: '🏬', x: 0.7, y: 0.5, s: 0.3 },
      { emoji: '🚌', x: 0.34, y: 0.86, s: 0.24 },
      { emoji: '🚦', x: 0.86, y: 0.8, s: 0.18 },
      { emoji: '☁️', x: 0.6, y: 0.14, s: 0.2 },
    ],
  },
  {
    id: 'snow',
    name: 'tuyết trắng',
    sky: ['#cbd5e1', '#f8fafc'],
    ground: '#ffffff',
    horizon: 0.7,
    items: [
      { emoji: '⛄', x: 0.45, y: 0.62, s: 0.36 },
      { emoji: '🌲', x: 0.15, y: 0.55, s: 0.28 },
      { emoji: '🌲', x: 0.85, y: 0.6, s: 0.24 },
      { emoji: '❄️', x: 0.7, y: 0.2, s: 0.14 },
      { emoji: '🐧', x: 0.72, y: 0.86, s: 0.18 },
    ],
  },
  {
    id: 'park',
    name: 'công viên',
    sky: ['#fbcfe8', '#fef3c7'],
    ground: '#a7f3d0',
    horizon: 0.7,
    items: [
      { emoji: '🎠', x: 0.35, y: 0.55, s: 0.34 },
      { emoji: '🎈', x: 0.8, y: 0.3, s: 0.2 },
      { emoji: '🌳', x: 0.82, y: 0.64, s: 0.26 },
      { emoji: '🛝', x: 0.18, y: 0.86, s: 0.2 },
      { emoji: '🦆', x: 0.6, y: 0.9, s: 0.14 },
    ],
  },
];

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Paint a scene on a `size`×`size` canvas and return a PNG data URL; `null` without a 2d context (jsdom). */
export function renderScene(scene: Scene, size: number): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const sky = c.createLinearGradient(0, 0, 0, size);
  sky.addColorStop(0, scene.sky[0]);
  sky.addColorStop(1, scene.sky[1]);
  c.fillStyle = sky;
  c.fillRect(0, 0, size, size);
  c.fillStyle = scene.ground;
  c.fillRect(0, size * scene.horizon, size, size * (1 - scene.horizon));
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const it of scene.items) {
    // Solid fill: with a gradient fillStyle WebKit renders the emoji as a flat mask, not in colour.
    c.fillStyle = '#000';
    c.font = `${Math.round(size * it.s)}px ${EMOJI_FONT}`;
    c.fillText(it.emoji, size * it.x, size * it.y);
  }
  return canvas.toDataURL('image/png');
}
