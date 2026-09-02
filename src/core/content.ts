export interface Item {
  emoji: string;
  /** Vietnamese name, spoken aloud. */
  name: string;
}

export const ANIMALS: readonly Item[] = [
  { emoji: '🐶', name: 'con chó' },
  { emoji: '🐱', name: 'con mèo' },
  { emoji: '🐰', name: 'con thỏ' },
  { emoji: '🐻', name: 'con gấu' },
  { emoji: '🐼', name: 'gấu trúc' },
  { emoji: '🐨', name: 'gấu koala' },
  { emoji: '🦁', name: 'sư tử' },
  { emoji: '🐯', name: 'con hổ' },
  { emoji: '🐮', name: 'con bò' },
  { emoji: '🐷', name: 'con heo' },
  { emoji: '🐸', name: 'con ếch' },
  { emoji: '🐵', name: 'con khỉ' },
  { emoji: '🐔', name: 'con gà' },
  { emoji: '🐧', name: 'chim cánh cụt' },
  { emoji: '🦆', name: 'con vịt' },
  { emoji: '🐘', name: 'con voi' },
  { emoji: '🦒', name: 'hươu cao cổ' },
  { emoji: '🐟', name: 'con cá' },
  { emoji: '🐢', name: 'con rùa' },
  { emoji: '🦋', name: 'con bướm' },
  { emoji: '🐭', name: 'con chuột' },
  { emoji: '🐴', name: 'con ngựa' },
];

export const FRUITS: readonly Item[] = [
  { emoji: '🍎', name: 'quả táo' },
  { emoji: '🍌', name: 'quả chuối' },
  { emoji: '🍊', name: 'quả cam' },
  { emoji: '🍓', name: 'quả dâu' },
  { emoji: '🍇', name: 'chùm nho' },
  { emoji: '🍉', name: 'quả dưa hấu' },
  { emoji: '🍐', name: 'quả lê' },
  { emoji: '🍑', name: 'quả đào' },
  { emoji: '🍒', name: 'quả anh đào' },
  { emoji: '🥝', name: 'quả kiwi' },
  { emoji: '🍋', name: 'quả chanh' },
  { emoji: '🍍', name: 'quả dứa' },
];

export const VEHICLES: readonly Item[] = [
  { emoji: '🚗', name: 'ô tô' },
  { emoji: '🚌', name: 'xe buýt' },
  { emoji: '🚒', name: 'xe cứu hoả' },
  { emoji: '🚂', name: 'tàu hoả' },
  { emoji: '✈️', name: 'máy bay' },
  { emoji: '🚁', name: 'trực thăng' },
  { emoji: '⛵', name: 'thuyền buồm' },
  { emoji: '🚜', name: 'máy cày' },
  { emoji: '🚲', name: 'xe đạp' },
  { emoji: '🚀', name: 'tên lửa' },
];

export const FOODS: readonly Item[] = [
  { emoji: '🥕', name: 'củ cà rốt' },
  { emoji: '🍌', name: 'quả chuối' },
  { emoji: '🐟', name: 'con cá' },
  { emoji: '🦴', name: 'khúc xương' },
  { emoji: '🎋', name: 'cây tre' },
  { emoji: '🍯', name: 'hũ mật ong' },
  { emoji: '🧀', name: 'miếng phô mai' },
  { emoji: '🍃', name: 'lá cây' },
  { emoji: '🥛', name: 'ly sữa' },
  { emoji: '🍞', name: 'ổ bánh mì' },
  { emoji: '🌽', name: 'bắp ngô' },
  { emoji: '🍪', name: 'bánh quy' },
];

export interface ColorDef {
  id: string;
  name: string;
  hex: string;
}

export const COLORS: readonly ColorDef[] = [
  { id: 'red', name: 'màu đỏ', hex: '#ef4444' },
  { id: 'orange', name: 'màu cam', hex: '#f97316' },
  { id: 'yellow', name: 'màu vàng', hex: '#facc15' },
  { id: 'green', name: 'màu xanh lá', hex: '#22c55e' },
  { id: 'blue', name: 'màu xanh dương', hex: '#3b82f6' },
  { id: 'purple', name: 'màu tím', hex: '#a855f7' },
  { id: 'pink', name: 'màu hồng', hex: '#ec4899' },
];

export const NUMBERS_VI: readonly string[] = [
  'không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười',
];

export const PRAISES: readonly string[] = [
  'Giỏi quá!',
  'Tuyệt vời!',
  'Đúng rồi!',
  'Bé giỏi lắm!',
  'Hoan hô!',
  'Làm tốt lắm!',
];

function item(set: readonly Item[], emoji: string): Item {
  const found = set.find((i) => i.emoji === emoji);
  if (!found) throw new Error(`content: missing ${emoji}`);
  return found;
}

/** Which animal eats what. Used by the feed game. */
export const FEED_PAIRS: readonly { animal: Item; food: Item }[] = [
  { animal: item(ANIMALS, '🐰'), food: item(FOODS, '🥕') },
  { animal: item(ANIMALS, '🐵'), food: item(FOODS, '🍌') },
  { animal: item(ANIMALS, '🐱'), food: item(FOODS, '🐟') },
  { animal: item(ANIMALS, '🐶'), food: item(FOODS, '🦴') },
  { animal: item(ANIMALS, '🐼'), food: item(FOODS, '🎋') },
  { animal: item(ANIMALS, '🐻'), food: item(FOODS, '🍯') },
  { animal: item(ANIMALS, '🐭'), food: item(FOODS, '🧀') },
  { animal: item(ANIMALS, '🐨'), food: item(FOODS, '🍃') },
  { animal: item(ANIMALS, '🐮'), food: item(FOODS, '🌽') },
  { animal: item(ANIMALS, '🐴'), food: item(FOODS, '🥕') },
];
