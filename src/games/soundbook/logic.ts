/**
 * The book: one page per kind of thing, each thing with its own recording
 * (`public/sounds/<id>.m4a`, built by `scripts/soundbook.mjs`).
 */

/** How the picture moves while its sound plays. */
export type Motion = 'hop' | 'drive' | 'shake' | 'wiggle' | 'sway';

export interface Thing {
  /** Recording id: `public/sounds/<id>.m4a`. */
  id: string;
  emoji: string;
  /** Vietnamese name, said after the sound. */
  name: string;
}

export interface Page {
  id: string;
  /** Tab button face. */
  icon: string;
  name: string;
  motion: Motion;
  things: readonly Thing[];
}

export const PAGES: readonly Page[] = [
  {
    id: 'farm',
    icon: '🐮',
    name: 'Nông trại',
    motion: 'hop',
    things: [
      { id: 'cow', emoji: '🐄', name: 'Con bò' },
      { id: 'pig', emoji: '🐖', name: 'Con heo' },
      { id: 'sheep', emoji: '🐑', name: 'Con cừu' },
      { id: 'goat', emoji: '🐐', name: 'Con dê' },
      { id: 'rooster', emoji: '🐓', name: 'Con gà trống' },
      { id: 'hen', emoji: '🐔', name: 'Con gà mái' },
      { id: 'chick', emoji: '🐤', name: 'Gà con' },
      { id: 'duck', emoji: '🦆', name: 'Con vịt' },
      { id: 'horse', emoji: '🐴', name: 'Con ngựa' },
      { id: 'dog', emoji: '🐕', name: 'Con chó' },
      { id: 'cat', emoji: '🐈', name: 'Con mèo' },
      { id: 'donkey', emoji: '🫏', name: 'Con lừa' },
    ],
  },
  {
    id: 'wild',
    icon: '🦁',
    name: 'Rừng xanh',
    motion: 'hop',
    things: [
      { id: 'lion', emoji: '🦁', name: 'Sư tử' },
      { id: 'elephant', emoji: '🐘', name: 'Con voi' },
      { id: 'monkey', emoji: '🐒', name: 'Con khỉ' },
      { id: 'wolf', emoji: '🐺', name: 'Chó sói' },
      { id: 'bear', emoji: '🐻', name: 'Con gấu' },
      { id: 'frog', emoji: '🐸', name: 'Con ếch' },
      { id: 'owl', emoji: '🦉', name: 'Cú mèo' },
      { id: 'bird', emoji: '🐦', name: 'Chim non' },
      { id: 'snake', emoji: '🐍', name: 'Con rắn' },
      { id: 'parrot', emoji: '🦜', name: 'Con vẹt' },
      { id: 'dolphin', emoji: '🐬', name: 'Cá heo' },
      { id: 'bee', emoji: '🐝', name: 'Con ong' },
    ],
  },
  {
    id: 'vehicles',
    icon: '🚒',
    name: 'Xe cộ',
    motion: 'drive',
    things: [
      { id: 'firetruck', emoji: '🚒', name: 'Xe cứu hoả' },
      { id: 'ambulance', emoji: '🚑', name: 'Xe cứu thương' },
      { id: 'police', emoji: '🚓', name: 'Xe cảnh sát' },
      { id: 'car', emoji: '🚗', name: 'Ô tô' },
      { id: 'train', emoji: '🚂', name: 'Tàu hoả' },
      { id: 'airplane', emoji: '✈️', name: 'Máy bay' },
      { id: 'helicopter', emoji: '🚁', name: 'Trực thăng' },
      { id: 'motorbike', emoji: '🏍️', name: 'Xe máy' },
      { id: 'bicycle', emoji: '🚲', name: 'Xe đạp' },
      { id: 'ship', emoji: '🚢', name: 'Tàu thuỷ' },
      { id: 'tractor', emoji: '🚜', name: 'Máy cày' },
      { id: 'rocket', emoji: '🚀', name: 'Tên lửa' },
    ],
  },
  {
    id: 'things',
    icon: '⏰',
    name: 'Đồ vật',
    motion: 'shake',
    things: [
      { id: 'alarm', emoji: '⏰', name: 'Đồng hồ báo thức' },
      { id: 'clock', emoji: '🕰️', name: 'Đồng hồ tích tắc' },
      { id: 'phone', emoji: '☎️', name: 'Điện thoại' },
      { id: 'doorbell', emoji: '🔔', name: 'Chuông cửa' },
      { id: 'knock', emoji: '🚪', name: 'Gõ cửa' },
      { id: 'toilet', emoji: '🚽', name: 'Bồn cầu' },
      { id: 'kettle', emoji: '🫖', name: 'Ấm nước' },
      { id: 'balloon', emoji: '🎈', name: 'Bóng bay' },
      { id: 'hammer', emoji: '🔨', name: 'Cái búa' },
      { id: 'camera', emoji: '📷', name: 'Máy ảnh' },
      { id: 'scissors', emoji: '✂️', name: 'Cái kéo' },
      { id: 'keys', emoji: '🔑', name: 'Chùm chìa khoá' },
    ],
  },
  {
    id: 'people',
    icon: '👶',
    name: 'Mọi người',
    motion: 'wiggle',
    things: [
      { id: 'giggle', emoji: '👶', name: 'Em bé cười' },
      { id: 'cry', emoji: '😭', name: 'Em bé khóc' },
      { id: 'laugh', emoji: '😆', name: 'Các bạn cười' },
      { id: 'sneeze', emoji: '🤧', name: 'Hắt xì' },
      { id: 'cough', emoji: '😷', name: 'Ho' },
      { id: 'yawn', emoji: '🥱', name: 'Ngáp' },
      { id: 'snore', emoji: '😴', name: 'Ngáy khò khò' },
      { id: 'kiss', emoji: '😘', name: 'Thơm má' },
      { id: 'clap', emoji: '👏', name: 'Vỗ tay' },
      { id: 'footsteps', emoji: '👣', name: 'Bước chân' },
      { id: 'eat', emoji: '🍎', name: 'Ăn táo' },
      { id: 'whistle', emoji: '😗', name: 'Huýt sáo' },
    ],
  },
  {
    id: 'nature',
    icon: '🌧️',
    name: 'Thiên nhiên',
    motion: 'sway',
    things: [
      { id: 'rain', emoji: '🌧️', name: 'Trời mưa' },
      { id: 'thunder', emoji: '⛈️', name: 'Sấm sét' },
      { id: 'wind', emoji: '🌬️', name: 'Gió thổi' },
      { id: 'waves', emoji: '🌊', name: 'Sóng biển' },
      { id: 'fire', emoji: '🔥', name: 'Lửa cháy' },
      { id: 'drip', emoji: '💧', name: 'Giọt nước' },
      { id: 'stream', emoji: '🏞️', name: 'Suối chảy' },
    ],
  },
];

/** Every thing in the book, across pages. */
export function allThings(): Thing[] {
  return PAGES.flatMap((p) => p.things);
}

/**
 * A little disorder per slot so a page reads as a scene rather than a
 * spreadsheet: each picture sits a bit off its grid cell, a bit tilted, and
 * bobs on its own beat. Deterministic, so a page looks the same every visit.
 */
export function scatter(index: number): { dx: number; dy: number; tilt: number; delay: number } {
  const r = (k: number) => {
    const x = Math.sin((index + 1) * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    dx: (r(1) - 0.5) * 16,
    dy: (r(2) - 0.5) * 20,
    tilt: (r(3) - 0.5) * 10,
    delay: r(4) * 2.4,
  };
}

/** True once every thing on the page has been heard at least once. */
export function pageDone(page: Page, heard: ReadonlySet<string>): boolean {
  return page.things.every((t) => heard.has(t.id));
}
