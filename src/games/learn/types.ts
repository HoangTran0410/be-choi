import type { FxKind } from '../../core/audio';

export type TopicId =
  | 'letters'
  | 'numbers'
  | 'colors'
  | 'shapes'
  | 'sizes'
  | 'animals'
  | 'shadows'
  | 'pattern'
  | 'sorting'
  | 'family';

/** Everything a picture on screen can be. One small renderer (visual.ts) draws them all. */
export type Visual =
  | { k: 'emoji'; v: string; scale?: number; silhouette?: boolean }
  | { k: 'text'; v: string }
  | { k: 'ball'; hex: string }
  | { k: 'shape'; path: string; hex: string }
  | { k: 'basket'; hex: string }
  | { k: 'photo'; url: string }
  /** `n` copies of one emoji, e.g. three apples. */
  | { k: 'group'; v: string; n: number }
  /** A row of pictures, e.g. a pattern with its missing piece. */
  | { k: 'row'; items: Visual[] }
  | { k: 'chip'; v: string };

export interface Option {
  id: string;
  visual: Visual;
  /** What the teacher calls it when it is the wrong one: "chữ em mờ", "con chó". */
  name: string;
}

export interface ChooseQuestion {
  type: 'choose';
  topic: TopicId;
  /** The concept whose mastery this question trains. */
  concept: string;
  /** Spoken slowly, one phrase at a time. */
  say: string[];
  /** The same question as text in the speech bubble. */
  bubble: string;
  /** Picture in the bubble (the thing to count, the shadow, the pattern…). */
  stimulus?: Visual;
  /** Animal voice to play with the question. */
  sound?: FxKind;
  options: Option[];
  answerId: string;
  /** "Mình tìm ___ nhé" after a wrong answer. */
  again: string[];
  /** Said when the answer is found. */
  reveal: string[];
}

export interface DragBin {
  id: string;
  visual: Visual;
  /** "rổ màu đỏ", "hộp đồ chơi". */
  name: string;
}

export interface DragItem {
  id: string;
  visual: Visual;
  binId: string;
  concept: string;
  /** "quả bóng màu xanh". */
  name: string;
}

export interface DragQuestion {
  type: 'drag';
  topic: TopicId;
  concepts: string[];
  say: string[];
  bubble: string;
  bins: DragBin[];
  items: DragItem[];
}

export type Question = ChooseQuestion | DragQuestion;

/** A person in the family photos: one or more photos that share a name. */
export interface Person {
  /** Stable key used in the concept id. */
  key: string;
  name?: string;
  urls: string[];
}

/** What the questions may draw on besides the built-in content. */
export interface Env {
  people: Person[];
}

export type SlotKind = 'choose' | 'drag';

export interface Slot {
  kind: SlotKind;
  concepts: string[];
}
