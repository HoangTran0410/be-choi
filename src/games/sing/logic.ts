/**
 * Karaoke words. Each song from `core/music` gets a line of lyrics per musical
 * phrase, with an emoji big enough to follow for a child who cannot read yet.
 * Phrase lengths are in beats and add up to the melody, so the highlight moves
 * with the tune.
 */
export interface Phrase {
  /** Big picture for the line. */
  emoji: string;
  /** Vietnamese line, sung by the child. */
  text: string;
  /** Length in beats (quarter notes). */
  beats: number;
}

function line(emoji: string, text: string, beats: number): Phrase {
  return { emoji, text, beats };
}

/** Lyrics per song id. Simple words written for this app; the melodies are public domain. */
export const LYRICS: Readonly<Record<string, readonly Phrase[]>> = {
  twinkle: [
    line('⭐', 'Ngôi sao lấp lánh', 8),
    line('🌙', 'Sáng trên bầu trời', 8),
    line('💎', 'Long lanh như hạt kim cương', 8),
    line('✨', 'Bé nhìn theo, bé cười', 8),
    line('⭐', 'Ngôi sao lấp lánh', 8),
    line('🌟', 'Sáng trên bầu trời', 8),
  ],
  butterfly: [
    line('🦋', 'Kìa con bướm vàng', 4),
    line('🦋', 'Kìa con bướm vàng', 4),
    line('🪽', 'Xoè đôi cánh', 4),
    line('🪽', 'Xoè đôi cánh', 4),
    line('☁️', 'Bướm bay lên trời', 4),
    line('☁️', 'Bướm bay lên trời', 4),
    line('👀', 'Em ngồi xem', 4),
    line('👀', 'Em ngồi xem', 4),
  ],
  lamb: [
    line('🐑', 'Bé có con cừu nhỏ', 4),
    line('☁️', 'Lông trắng như mây', 4),
    line('🐾', 'Cừu đi theo bé', 4),
    line('🏫', 'Đến tận trường luôn', 4),
    line('🐑', 'Bé có con cừu nhỏ', 4),
    line('☁️', 'Lông trắng như mây', 4),
    line('💕', 'Cừu thương bé lắm', 4),
    line('🎵', 'La la la la', 4),
  ],
  bridge: [
    line('🌉', 'Cầu Luân Đôn sắp đổ', 4),
    line('🧱', 'Đổ xuống mất rồi', 4),
    line('💦', 'Đổ xuống dòng sông', 4),
    line('😮', 'Ôi cây cầu ơi', 4),
    line('🔨', 'Mình cùng xây lại', 4),
    line('🧱', 'Xây thật là cao', 4),
    line('🌉', 'Cầu xinh ghê', 4),
    line('🎉', 'Hoan hô!', 4),
  ],
  farmer: [
    line('🚜', 'Bác nông dân ơi', 4),
    line('🌾', 'Ra đồng sáng nay', 4),
    line('🐄', 'Bò kêu ụm bò', 4),
    line('🎶', 'Vui ghê!', 2),
    line('🐔', 'Gà con chiếp chiếp', 5),
    line('🐷', 'Heo kêu ụt ịt', 4),
    line('🦆', 'Vịt kêu cạp cạp', 4),
    line('🎉', 'Vui quá vui!', 2),
  ],
  birthday: [
    line('🎂', 'Chúc mừng sinh nhật', 6),
    line('🎉', 'Chúc mừng sinh nhật', 6),
    line('🥳', 'Chúc mừng bé yêu của cả nhà', 7),
    line('🎈', 'Chúc mừng sinh nhật!', 6),
  ],
  row: [
    line('🚣', 'Chèo chèo chèo thuyền đi', 4),
    line('🌊', 'Nhẹ theo dòng sông', 3),
    line('😄', 'Vui vui vui vui vui vui', 3.96),
    line('💭', 'Đời là giấc mơ xinh', 4),
  ],
  buns: [
    line('🥐', 'Bánh nướng thơm ơi', 4),
    line('🥐', 'Bánh nướng thơm ơi', 4),
    line('🪙', 'Một đồng một cái, hai đồng hai cái', 4),
    line('🥐', 'Bánh nướng thơm ơi', 4),
  ],
  rain: [
    line('🌧️', 'Mưa ơi mưa ơi', 5),
    line('☔', 'Mưa đi chỗ khác chơi nhé', 6),
    line('🌈', 'Để bé còn ra sân chơi', 6),
    line('🌧️', 'Mưa ơi mưa ơi', 5),
  ],
  backimthang: [
    line('🪜', 'Bắc kim thang, cà lang bí rợ', 8),
    line('🏠', 'Cột qua kèo, là kèo qua cột', 8),
    line('🛢️', 'Chú bán dầu, qua cầu mà té', 8),
    line('🐸', 'Chú bán ếch, ở lại làm chi', 9),
    line('🥁', 'Con le le, đánh trống thổi kèn', 9),
    line('🐦', 'Con bìm bịp thổi tò tí te tò te', 10),
  ],
  canha: [
    line('👨', 'Ba thương con vì con giống mẹ', 8),
    line('👩', 'Mẹ thương con vì con giống ba', 8),
    line('🏡', 'Cả nhà ta cùng yêu thương nhau', 8),
    line('💗', 'Xa là nhớ, gần nhau là cười', 8),
  ],
  chaulenba: [
    line('🧒', 'Cháu lên ba, cháu đi mẫu giáo', 8),
    line('👩‍🏫', 'Cô thương cháu vì cháu không khóc nhè', 9),
    line('🌱', 'Không khóc nhè thì mẹ trồng cây trái', 9),
    line('🚜', 'Ông vào nhà máy, ông bà vui cấy cày', 10),
    line('🎶', 'Là lá la la, là là lá la la', 10),
  ],
  chauyeuba: [
    line('👵', 'Bà ơi bà, cháu yêu bà lắm', 8),
    line('☁️', 'Tóc bà trắng, màu trắng như mây', 8),
    line('🤝', 'Cháu yêu bà, cháu nắm bàn tay', 8),
    line('😊', 'Khi cháu vâng lời, cháu biết bà vui', 9),
    line('🤝', 'Cháu yêu bà, cháu nắm bàn tay', 8),
    line('😊', 'Khi cháu vâng lời, cháu biết bà vui', 9),
  ],
  ngungon: [
    line('🌙', 'Bé ơi ngủ đi, đêm đã khuya rồi', 10),
    line('💭', 'Để những giấc mơ đẹp sẽ luôn bên em', 10),
    line('🛏️', 'Bé ơi ngủ ngoan, trong tiếng ru hời', 9),
    line('🌕', 'Vầng trăng đợi em cùng bay vào giấc mơ', 10),
    line('💤', 'À ơi… à ơi… à à ơi…', 8),
  ],
};

/** Animals watching from the front row. */
export const AUDIENCE: readonly string[] = ['🐰', '🐻', '🐼', '🦊', '🐨', '🐸'];

/** Notes that float up while the child sings, from the lowest voice to the highest. */
export const NOTE_EMOJI: readonly string[] = ['🎵', '🎶', '🎼'];

export function phrasesFor(songId: string): readonly Phrase[] {
  return LYRICS[songId] ?? [];
}

/** Which line is being sung at `beat`. Before the start → 0, past the end → the last line. */
export function phraseIndexAt(phrases: readonly Phrase[], beat: number): number {
  if (phrases.length === 0) return 0;
  let at = 0;
  for (let i = 0; i < phrases.length; i++) {
    at += phrases[i]?.beats ?? 0;
    if (beat < at) return i;
  }
  return phrases.length - 1;
}

export function totalBeats(phrases: readonly Phrase[]): number {
  return phrases.reduce((sum, p) => sum + p.beats, 0);
}

/** Low / middle / high voice, for the colour of the note that floats up. Silence counts as middle. */
export function pitchBand(hz: number | null): number {
  if (hz === null || !Number.isFinite(hz)) return 1;
  if (hz < 260) return 0;
  if (hz > 420) return 2;
  return 1;
}
