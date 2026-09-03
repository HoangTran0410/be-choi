import type { AudioEngine, DrumKind, FxKind, Timbre } from '../../core/audio';
import { noteFreq } from '../../core/music';

/** Sixteenth-note steps in one bar of 4/4. */
export const STEPS = 16;
/** How many loops the child can stack. */
export const MAX_LAYERS = 4;
/** Quarter-note count-in before a recording bar. */
export const COUNT_IN_BEATS = 4;
/** Sixteenth steps a backing bass note rings. */
export const BASS_HOLD = 3;
/** Tempo multipliers cycled by the tempo button: 🐢 / 🙂 / 🐇. */
export const TEMPO_FACTORS: readonly number[] = [0.75, 1, 1.25];
export const TEMPO_EMOJIS: readonly string[] = ['🐢', '🙂', '🐇'];
/** Emoji shown on the voice button for each synth voice. */
export const VOICE_EMOJI: Readonly<Record<Timbre, string>> = {
  piano: '🎹',
  xylo: '🎼',
  bell: '🔔',
  guitar: '🎸',
  flute: '🎶',
  trumpet: '🎺',
  violin: '🎻',
  sax: '🎷',
  bass: '🎸',
};

export type PadSound =
  | { kind: 'drum'; drum: DrumKind }
  | { kind: 'fx'; fx: FxKind }
  /** Note name; the timbre is the kit's current voice. */
  | { kind: 'note'; note: string };

export interface Pad {
  emoji: string;
  /** Vietnamese name (aria-label only; the game never speaks over the music). */
  label: string;
  /** Pad colour (hex). */
  color: string;
  sound: PadSound;
}

export interface Kit {
  id: string;
  emoji: string;
  name: string;
  /** Twelve pads: 4 × 3 in landscape, 3 × 4 in portrait. */
  pads: Pad[];
  /** Synth voices cycled by the voice button (note kits only). */
  voices?: Timbre[];
}

const RAINBOW = [
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#f43f5e',
  '#84cc16',
  '#06b6d4',
  '#8b5cf6',
];

function drumPad(emoji: string, label: string, drum: DrumKind, i: number): Pad {
  return { emoji, label, color: RAINBOW[i % RAINBOW.length] ?? '#3b82f6', sound: { kind: 'drum', drum } };
}
function fxPad(emoji: string, label: string, fx: FxKind, i: number): Pad {
  return { emoji, label, color: RAINBOW[i % RAINBOW.length] ?? '#3b82f6', sound: { kind: 'fx', fx } };
}
function notePad(emoji: string, label: string, note: string, color: string): Pad {
  return { emoji, label, color, sound: { kind: 'note', note } };
}

/** Four kits of twelve pads each. */
export const KITS: readonly Kit[] = [
  {
    id: 'drums',
    emoji: '🥁',
    name: 'Trống',
    pads: [
      drumPad('🥁', 'trống cái', 'kick', 0),
      drumPad('🪘', 'trống con', 'snare', 1),
      drumPad('✨', 'chũm chọe', 'hat', 2),
      drumPad('🪵', 'trống tom', 'tom', 3),
      drumPad('👏', 'vỗ tay', 'clap', 4),
      drumPad('🔔', 'chuông bò', 'cowbell', 5),
      drumPad('🎉', 'lục lạc', 'shaker', 6),
      drumPad('🥢', 'mõ', 'wood', 7),
      drumPad('🛎️', 'chập chõa', 'ride', 8),
      drumPad('🔺', 'kẻng tam giác', 'triangle', 9),
      drumPad('💥', 'chũm chọe lớn', 'crash', 10),
      fxPad('🌀', 'dồn trống', 'roll', 11),
    ],
  },
  {
    id: 'notes',
    emoji: '🎹',
    name: 'Nhạc cụ',
    voices: ['piano', 'xylo', 'bell', 'guitar', 'trumpet', 'sax'],
    pads: [
      notePad('🔴', 'nốt Đô', 'C4', '#ef4444'),
      notePad('🟠', 'nốt Rê', 'D4', '#f97316'),
      notePad('🟡', 'nốt Mi', 'E4', '#facc15'),
      notePad('🟢', 'nốt Son', 'G4', '#22c55e'),
      notePad('🔵', 'nốt La', 'A4', '#3b82f6'),
      notePad('🟣', 'nốt Đô cao', 'C5', '#a855f7'),
      notePad('❤️', 'nốt Rê cao', 'D5', '#f43f5e'),
      notePad('🧡', 'nốt Mi cao', 'E5', '#fb923c'),
      notePad('💛', 'nốt Son cao', 'G5', '#fde047'),
      notePad('💚', 'nốt La cao', 'A5', '#4ade80'),
      notePad('💙', 'nốt Đô rất cao', 'C6', '#60a5fa'),
      notePad('💜', 'nốt Rê rất cao', 'D6', '#c084fc'),
    ],
  },
  {
    id: 'animals',
    emoji: '🐾',
    name: 'Thú vui',
    pads: [
      fxPad('🐱', 'mèo', 'meow', 0),
      fxPad('🐶', 'chó', 'bark', 1),
      fxPad('🦆', 'vịt', 'quack', 2),
      fxPad('🐮', 'bò', 'moo', 3),
      fxPad('🐦', 'chim', 'chirp', 4),
      fxPad('🦁', 'sư tử', 'roar', 5),
      fxPad('🐸', 'ếch', 'frog', 6),
      fxPad('🐷', 'heo', 'pig', 7),
      fxPad('🦉', 'cú', 'owl', 8),
      fxPad('🐘', 'voi', 'elephant', 9),
      fxPad('🐑', 'cừu', 'sheep', 10),
      fxPad('🦗', 'dế', 'cricket', 11),
    ],
  },
  {
    id: 'fun',
    emoji: '🎉',
    name: 'Vui nhộn',
    pads: [
      fxPad('🛸', 'tia laze', 'laser', 0),
      fxPad('📯', 'còi', 'honk', 1),
      fxPad('😗', 'huýt sáo', 'whistle', 2),
      fxPad('🎢', 'trượt', 'slide', 3),
      fxPad('⚡', 'điện xẹt', 'zap', 4),
      fxPad('✨', 'lấp lánh', 'sparkle', 5),
      fxPad('🎺', 'kèn kazoo', 'kazoo', 6),
      fxPad('🥁', 'dồn trống', 'roll', 7),
      fxPad('🎊', 'hoan hô', 'cheer', 8),
      drumPad('💥', 'chũm chọe lớn', 'crash', 9),
      drumPad('🔔', 'chuông bò', 'cowbell', 10),
      drumPad('👏', 'vỗ tay', 'clap', 11),
    ],
  },
];

export interface Beat {
  id: string;
  emoji: string;
  name: string;
  bpm: number;
  /** One bar of drums, `STEPS` long; several kinds may share a step. */
  steps: (DrumKind[] | null)[];
  /** One bar of bass note names (soft `'bass'` timbre); `null` is a rest. */
  bass: (string | null)[];
}

/** `'kick+hat . hat'` → `[['kick','hat'], null, ['hat']]`. Must have exactly `STEPS` tokens. */
function drumBar(text: string): (DrumKind[] | null)[] {
  const steps = text
    .trim()
    .split(/\s+/)
    .map((tok) => (tok === '.' ? null : (tok.split('+') as DrumKind[])));
  if (steps.length !== STEPS) throw new Error(`jam: bar needs ${STEPS} steps, got ${steps.length}`);
  return steps;
}

/** `'C3 . . . G2'` → `['C3', null, null, null, 'G2']`. Must have exactly `STEPS` tokens. */
function bassBar(text: string): (string | null)[] {
  const steps = text
    .trim()
    .split(/\s+/)
    .map((tok) => (tok === '.' ? null : tok));
  if (steps.length !== STEPS) throw new Error(`jam: bass bar needs ${STEPS} steps, got ${steps.length}`);
  return steps;
}

/** Three backing beats the child can jam over. */
export const BEATS: readonly Beat[] = [
  {
    id: 'vui',
    emoji: '😊',
    name: 'vui',
    bpm: 110,
    steps: drumBar('kick+hat . hat . snare+hat . hat . kick+hat . hat . snare+hat . hat .'),
    bass: bassBar('C3 . . . G2 . . . A2 . . . F2 . . .'),
  },
  {
    id: 'nhay',
    emoji: '🕺',
    name: 'nhảy',
    bpm: 128,
    steps: drumBar('kick+shaker hat shaker hat kick+clap+shaker hat shaker hat kick+shaker hat shaker hat kick+clap+shaker hat shaker hat'),
    bass: bassBar('C3 . . . C3 . . . F2 . . . G2 . . .'),
  },
  {
    id: 'ru',
    emoji: '🌙',
    name: 'ru',
    bpm: 88,
    steps: drumBar('hat . . . triangle . . . hat . . . shaker . . .'),
    bass: bassBar('C3 . . . . . . . G2 . . . A2 . . .'),
  },
];

/** One pad hit inside a recorded bar, quantized to a sixteenth step. */
export interface LoopEvent {
  step: number;
  pad: Pad;
  /** Voice active when a note pad was recorded (note pads only). */
  voice?: Timbre;
}

export interface Layer {
  id: number;
  /** Kit id the loop was recorded with (its emoji marks the layer dot). */
  kit: string;
  events: LoopEvent[];
  muted: boolean;
}

/** Nearest sixteenth step to `tMs` after the bar start; wraps past the bar (16 → 0). */
export function quantize(tMs: number, stepMs: number): number {
  if (!(stepMs > 0) || !Number.isFinite(tMs)) return 0;
  const s = Math.round(tMs / stepMs);
  return ((s % STEPS) + STEPS) % STEPS;
}

/** Milliseconds per sixteenth-note step at `bpm` scaled by the tempo `factor`. */
export function stepMs(bpm: number, factor = 1): number {
  return 60000 / (bpm * factor) / 4;
}

/** Everything the unmuted layers play on `step` (wraps past the bar). */
export function eventsAt(layers: readonly Layer[], step: number): LoopEvent[] {
  const s = ((step % STEPS) + STEPS) % STEPS;
  const out: LoopEvent[] = [];
  for (const layer of layers) {
    if (layer.muted) continue;
    for (const ev of layer.events) if (ev.step === s) out.push(ev);
  }
  return out;
}

/** Sound a pad: drums and effects go straight to the engine; notes use `voice`. */
export function playPad(audio: AudioEngine, pad: Pad, voice: Timbre, dur?: number): void {
  const s = pad.sound;
  switch (s.kind) {
    case 'drum':
      audio.drum(s.drum);
      return;
    case 'fx':
      audio.fx(s.fx);
      return;
    case 'note': {
      const freq = noteFreq(s.note);
      if (freq > 0) audio.note(freq, dur ?? 0.5, voice);
      return;
    }
  }
}
