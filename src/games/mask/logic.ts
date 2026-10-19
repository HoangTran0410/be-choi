import type { FxKind } from '../../core/audio';

export interface MaskDef {
  id: string;
  /** The animal face drawn over the child's. */
  emoji: string;
  /** Spoken when the mask goes on. */
  say: string;
  voice: FxKind;
  /** Soft glow behind the mask. */
  glow: string;
}

export const MASKS: readonly MaskDef[] = [
  { id: 'bear', emoji: '🐻', say: 'Bé là gấu con!', voice: 'growl', glow: '#fdba74' },
  { id: 'cat', emoji: '🐱', say: 'Bé là mèo con!', voice: 'meow', glow: '#fde68a' },
  { id: 'rabbit', emoji: '🐰', say: 'Bé là thỏ con!', voice: 'squeak', glow: '#fbcfe8' },
  { id: 'dino', emoji: '🦖', say: 'Bé là khủng long!', voice: 'roar', glow: '#bbf7d0' },
  { id: 'dog', emoji: '🐶', say: 'Bé là cún con!', voice: 'bark', glow: '#fed7aa' },
  { id: 'lion', emoji: '🦁', say: 'Bé là sư tử!', voice: 'roar', glow: '#fcd34d' },
  { id: 'pig', emoji: '🐷', say: 'Bé là heo con!', voice: 'pig', glow: '#fecdd3' },
  { id: 'frog', emoji: '🐸', say: 'Bé là ếch con!', voice: 'frog', glow: '#d9f99d' },
  { id: 'panda', emoji: '🐼', say: 'Bé là gấu trúc!', voice: 'sparkle', glow: '#e5e7eb' },
  { id: 'monkey', emoji: '🐵', say: 'Bé là khỉ con!', voice: 'monkey', glow: '#fcd9b6' },
];

/** A star and a cheer after this many different masks. */
export const STAR_AFTER = 4;
/** How often the face is looked for. */
export const DETECT_MS = 140;
/** No face this long: the mask drifts back to the middle of the screen. */
export const LOST_MS = 1200;
/** Failed detections in a row before giving up on FaceDetector for good. */
export const MAX_DETECT_ERRORS = 5;
/** Mask width as a multiple of the detected face width. */
export const MASK_SCALE = 1.7;

export function nextIndex(i: number, count = MASKS.length): number {
  return (((i + 1) % count) + count) % count;
}

export interface RewardState {
  seen: readonly string[];
}

/** Count a mask the child tried. Different masks add up; the same one twice does not. */
export function trackMask(state: RewardState, id: string): { state: RewardState; reward: boolean } {
  const seen = state.seen.includes(id) ? state.seen : [...state.seen, id];
  if (seen.length >= STAR_AFTER) return { state: { seen: [] }, reward: true };
  return { state: { seen }, reward: false };
}

/** Where the mask sits, as fractions of the stage (centre x, centre y, width). */
export interface Placement {
  x: number;
  y: number;
  size: number;
}

/** Child brings their own face to the middle of the screen. */
export const CENTER: Placement = { x: 0.5, y: 0.46, size: 0.62 };

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Turn a face box in video pixels into a placement on a stage that shows the
 * video mirrored with `object-fit: cover`. Result is clamped so the mask stays
 * on screen. Null when the sizes are not known yet.
 */
export function placeOnStage(
  face: FaceBox,
  video: { w: number; h: number },
  stage: { w: number; h: number },
): Placement | null {
  if (video.w <= 0 || video.h <= 0 || stage.w <= 0 || stage.h <= 0) return null;
  if (!(face.width > 0)) return null;
  const s = Math.max(stage.w / video.w, stage.h / video.h);
  const offX = (video.w * s - stage.w) / 2;
  const offY = (video.h * s - stage.h) / 2;
  const cx = (face.x + face.width / 2) * s - offX;
  const cy = (face.y + face.height / 2) * s - offY;
  const mirroredX = stage.w - cx;
  const size = Math.min(1.2, (face.width * s * MASK_SCALE) / stage.w);
  return {
    x: clamp(mirroredX / stage.w, 0, 1),
    // Animal heads are bigger than faces: lift the centre a little.
    y: clamp((cy - face.height * s * 0.08) / stage.h, 0, 1),
    size: Math.max(0.2, size),
  };
}

/** Ease `from` toward `to`; `k` of 1 jumps all the way. */
export function smooth(from: Placement, to: Placement, k = 0.45): Placement {
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    size: from.size + (to.size - from.size) * k,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
