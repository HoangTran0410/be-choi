/**
 * Bé tạo cảnh: a mixer of looping backgrounds, each of which also paints
 * something into the picture. Pure data and rules here; drawing in scene.ts.
 */

/** What a background does to the sky. The strongest one on wins, blended. */
export type Sky = 'night' | 'storm' | 'dawn' | 'deep';

export interface Ambient {
  /** Loop id: `public/ambience/<id>.m4a`, and the key of its effect in scene.ts. */
  id: string;
  emoji: string;
  /** Vietnamese name, said when it is switched on. */
  name: string;
  sky?: Sky;
  /** Relative level in the mix, for the loops that are loud by nature. */
  gain?: number;
}

export interface Shelf {
  id: string;
  icon: string;
  name: string;
  items: readonly Ambient[];
}

export const SHELVES: readonly Shelf[] = [
  {
    id: 'weather',
    icon: '⛅',
    name: 'Thời tiết',
    items: [
      { id: 'rain', emoji: '🌦️', name: 'Mưa rơi' },
      { id: 'heavy-rain', emoji: '🌧️', name: 'Mưa to', sky: 'storm', gain: 0.8 },
      { id: 'thunder', emoji: '⛈️', name: 'Sấm chớp', sky: 'storm' },
      { id: 'wind', emoji: '🌬️', name: 'Gió thổi' },
      { id: 'campfire', emoji: '🔥', name: 'Lửa trại' },
      { id: 'firework', emoji: '🎆', name: 'Pháo hoa', sky: 'night', gain: 0.7 },
    ],
  },
  {
    id: 'water',
    icon: '🌊',
    name: 'Sông nước',
    items: [
      { id: 'ocean', emoji: '🌊', name: 'Sóng biển' },
      { id: 'river', emoji: '🏞️', name: 'Suối chảy' },
      { id: 'underwater', emoji: '🤿', name: 'Dưới đáy biển', sky: 'deep' },
      { id: 'bubble', emoji: '🫧', name: 'Bong bóng' },
      { id: 'whale', emoji: '🐋', name: 'Cá voi hát' },
    ],
  },
  {
    id: 'animals',
    icon: '🐦',
    name: 'Muông thú',
    items: [
      { id: 'bird', emoji: '🐦', name: 'Chim hót' },
      { id: 'morning-bird', emoji: '🌅', name: 'Buổi sáng', sky: 'dawn' },
      { id: 'cricket', emoji: '🦗', name: 'Dế kêu', sky: 'night' },
      { id: 'frog', emoji: '🐸', name: 'Ếch kêu' },
      { id: 'owl', emoji: '🦉', name: 'Cú mèo', sky: 'night' },
      { id: 'chicken', emoji: '🐔', name: 'Đàn gà' },
      { id: 'jungle', emoji: '🌴', name: 'Rừng đêm', sky: 'night' },
    ],
  },
  {
    id: 'home',
    icon: '🏠',
    name: 'Trong nhà',
    items: [
      { id: 'chime', emoji: '🎐', name: 'Chuông gió' },
      { id: 'clock', emoji: '🕰️', name: 'Đồng hồ' },
      { id: 'fan', emoji: '🌀', name: 'Quạt mát' },
      { id: 'book', emoji: '📖', name: 'Lật sách' },
      { id: 'kitchen', emoji: '🍳', name: 'Nhà bếp' },
      { id: 'sleep', emoji: '😴', name: 'Ru ngủ', sky: 'night', gain: 0.6 },
    ],
  },
  {
    id: 'town',
    icon: '🚗',
    name: 'Phố phường',
    items: [
      { id: 'city', emoji: '🚕', name: 'Phố xá' },
      { id: 'train', emoji: '🚂', name: 'Tàu hoả' },
      { id: 'airplane', emoji: '✈️', name: 'Máy bay' },
      { id: 'tractor', emoji: '🚜', name: 'Máy cày' },
      { id: 'restaurant', emoji: '🍜', name: 'Quán ăn' },
      { id: 'countryside', emoji: '🌾', name: 'Đồng quê' },
    ],
  },
];

export function allAmbients(): Ambient[] {
  return SHELVES.flatMap((s) => s.items);
}

export function findAmbient(id: string): Ambient | undefined {
  return allAmbients().find((a) => a.id === id);
}

/**
 * More than this at once is not a scene, it is noise — and each loop is a few
 * megabytes of memory. Switching on one more lets the oldest go.
 */
export const MAX_ON = 6;

/**
 * Switch `id` on or off. Returns the new list (oldest first) and whatever had
 * to make room.
 */
export function toggle(on: readonly string[], id: string, max = MAX_ON): { on: string[]; dropped: string[] } {
  if (on.includes(id)) return { on: on.filter((x) => x !== id), dropped: [] };
  const next = [...on, id];
  const dropped = next.length > max ? next.splice(0, next.length - max) : [];
  return { on: next, dropped };
}

/**
 * Level of each loop when `count` are on. Loops add up, so each is turned down
 * as more join — by the square root, which is how uncorrelated noise sums: the
 * whole stays about as loud as one, and every one of them is still there.
 */
export function mixLevel(amb: Ambient, count: number): number {
  return (amb.gain ?? 1) / Math.sqrt(Math.max(1, count));
}

/** How much of each sky the scene should show for what is on (0…1 each). */
export function skyOf(on: readonly string[]): Record<Sky, number> {
  const out: Record<Sky, number> = { night: 0, storm: 0, dawn: 0, deep: 0 };
  for (const id of on) {
    const sky = findAmbient(id)?.sky;
    if (sky) out[sky] = 1;
  }
  // Under the sea there is no weather and no night: the water is the sky.
  if (out.deep) out.night = out.storm = out.dawn = 0;
  // A storm at dawn is a storm; a dawn at night is a night.
  if (out.storm || out.night) out.dawn = 0;
  return out;
}

export interface Backdrop {
  /** `public/backdrops/<id>.jpg`, with a `<id>-thumb.jpg` beside it. */
  id: string;
  name: string;
}

/**
 * Photographs to play the scene over instead of the drawn landscape — the
 * scene images of iFocus (Unsplash). The effects still run on top: rain falls
 * on the mountain, the sea rolls in over the city.
 */
export const BACKDROPS: readonly Backdrop[] = [
  { id: 'beach-sunset', name: 'Bãi biển' },
  { id: 'foggy-forest', name: 'Rừng sương' },
  { id: 'mountain-peak', name: 'Núi tuyết' },
  { id: 'autumn-road', name: 'Núi đồi' },
  { id: 'purple', name: 'Hồ nước' },
  { id: 'sunset', name: 'Hoàng hôn' },
  { id: 'starry-sky', name: 'Bầu trời sao' },
  { id: 'astronaut', name: 'Phi hành gia' },
  { id: 'deep', name: 'Đại dương' },
  { id: 'water', name: 'Mặt nước' },
  { id: 'rainy-window', name: 'Cửa sổ mưa' },
  { id: 'city-sky', name: 'Thành phố' },
  { id: 'night-city', name: 'Phố đêm' },
  { id: 'tokyo-street', name: 'Phố đèn' },
  { id: 'train-journey', name: 'Quả địa cầu' },
  { id: 'coffee-shop', name: 'Quán cà phê' },
  { id: 'books', name: 'Sách' },
  { id: 'workspace', name: 'Phòng làm việc' },
];

export const backdropUrl = (id: string): string => `backdrops/${id}.jpg`;
export const backdropThumb = (id: string): string => `backdrops/${id}-thumb.jpg`;
