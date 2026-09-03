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
