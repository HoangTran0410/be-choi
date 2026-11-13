import type { BearLook } from './art';
import type { ShowId } from './logic';

/**
 * The bear's two arms. The body is drawn without arms (`bearInner(look, false, false)`); these are
 * the only ones, drawn on top of the instrument so they visibly hold it, and the one that plays is
 * the one that moves when a note sounds. Everything is in the performer's 240 x 240 box.
 */

export type Pt = readonly [number, number];

/** Where the arms join the body. */
export const SHOULDER: { readonly l: Pt; readonly r: Pt } = { l: [80, 128], r: [160, 128] };
/** Where the instrument's box sits in the performer (see .show-inst in style.css). */
export const BOX = { cx: 120, cy: 160.8, size: 168 };
/** The bear's mouth, where a wind instrument is brought to. */
export const MOUTH: Pt = [120, 84];

export type Tool = { kind: 'mallet'; ang: number; color?: string };

export interface Pose {
  /** Scale of the instrument in its box (1 = as drawn). */
  s?: number;
  /** Tilt of the instrument, degrees clockwise. */
  rot?: number;
  /** The point of the drawing (0…240 art units) that is moved to `to` in the performer; default: the middle, left where it is. */
  at?: Pt;
  to?: Pt;
  /** Where the hands are, in art units. `l` / `r` are the screen's left and right arm. */
  l: Pt;
  r: Pt;
  /** Which arm moves when a note sounds: one, or both in turn. */
  tap: 'l' | 'r' | 'alt';
  /** How it moves: down onto the instrument, or sideways (a bow). */
  mode?: 'down' | 'sweep' | 'shake';
  tool?: { l?: Tool; r?: Tool };
}

const mal = (ang: number, color = '#ef4444'): Tool => ({ kind: 'mallet', ang, color });

/**
 * Hand positions (art units of each drawing) and where the instrument sits. Tuned by eye on a
 * phone: change a number, look at the screenshot.
 */
export const POSES: Readonly<Record<ShowId, Pose>> = {
  piano: { l: [70, 160], r: [170, 160], tap: 'alt' },
  guitar: { l: [106, 92], r: [136, 168], tap: 'r' },
  violin: { l: [104, 92], r: [112, 182], tap: 'r', mode: 'sweep' },
  flute: { s: 0.8, rot: -6, at: [20, 118], to: [112, 86], l: [64, 118], r: [150, 118], tap: 'alt' },
  trumpet: { s: 0.7, rot: -4, at: [12, 116], to: [108, 84], l: [38, 122], r: [118, 76], tap: 'r' },
  xylo: { l: [50, 56], r: [190, 56], tap: 'alt', tool: { l: mal(160, '#ef4444'), r: mal(200, '#3b82f6') } },
  drum: { l: [52, 66], r: [188, 66], tap: 'alt' },
  harp: { l: [100, 120], r: [160, 120], tap: 'alt' },
  ukulele: { l: [106, 84], r: [136, 172], tap: 'r' },
  sax: { s: 0.8, at: [66, 24], to: [112, 84], l: [112, 100], r: [122, 160], tap: 'r' },
  marimba: { l: [60, 52], r: [180, 52], tap: 'alt', tool: { l: mal(160, '#2563eb'), r: mal(200, '#ef4444') } },
  bell: { l: [60, 52], r: [180, 52], tap: 'alt', tool: { l: mal(160, '#2563eb'), r: mal(200, '#ef4444') } },
  kalimba: { l: [60, 170], r: [180, 170], tap: 'alt' },
  accordion: { l: [24, 120], r: [216, 120], tap: 'alt', mode: 'shake' },
  harmonica: { s: 0.7, at: [120, 120], to: [120, 86], l: [28, 120], r: [212, 120], tap: 'alt' },
  banjo: { l: [104, 90], r: [126, 176], tap: 'r' },
  handpan: { l: [80, 120], r: [160, 120], tap: 'alt' },
  steelpan: { l: [64, 70], r: [176, 70], tap: 'alt', tool: { l: mal(160, '#f59e0b'), r: mal(200, '#f59e0b') } },
  panflute: { s: 0.7, at: [120, 120], to: [120, 84], l: [40, 120], r: [200, 120], tap: 'alt' },
  vibraphone: { l: [60, 52], r: [180, 52], tap: 'alt', tool: { l: mal(160, '#7c3aed'), r: mal(200, '#7c3aed') } },
  tambourine: { l: [24, 130], r: [120, 124], tap: 'r', mode: 'shake' },
  maracas: { l: [62, 196], r: [200, 196], tap: 'alt', mode: 'shake' },
};

export const poseOf = (id: string): Pose => (POSES as Record<string, Pose | undefined>)[id] ?? POSES.piano;

/** Map a point of the instrument's drawing to the performer's box, through the pose's scale, tilt and anchor. */
export function toPerformer(pose: Pose, p: Pt): Pt {
  const k = (BOX.size / 240) * (pose.s ?? 1);
  const a = ((pose.rot ?? 0) * Math.PI) / 180;
  const rot = (x: number, y: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const rel = (q: Pt): Pt => rot((q[0] - 120) * k, (q[1] - 120) * k);
  let ox = 0;
  let oy = 0;
  if (pose.at && pose.to) {
    const m = rel(pose.at);
    ox = pose.to[0] - (BOX.cx + m[0]);
    oy = pose.to[1] - (BOX.cy + m[1]);
  }
  const v = rel(p);
  return [Math.round((BOX.cx + v[0] + ox) * 10) / 10, Math.round((BOX.cy + v[1] + oy) * 10) / 10];
}

/** The CSS transform that puts the instrument where the pose says (translation as % of its own box). */
export function instTransform(pose: Pose): string {
  const k = pose.s ?? 1;
  const r = pose.rot ?? 0;
  let ox = 0;
  let oy = 0;
  if (pose.at && pose.to) {
    const c = toPerformer({ ...pose, at: undefined, to: undefined }, pose.at);
    ox = pose.to[0] - c[0];
    oy = pose.to[1] - c[1];
  }
  const pct = (n: number): string => `${Math.round((n / BOX.size) * 1000) / 10}%`;
  return `translate(${pct(ox)}, ${pct(oy)}) rotate(${r}deg) scale(${k})`;
}

/** An arm: from the shoulder, bent out and down at the elbow, to the hand. */
export function armPath(side: 'l' | 'r', hand: Pt): string {
  const s = SHOULDER[side];
  const out = side === 'l' ? -1 : 1;
  const dx = hand[0] - s[0];
  const dy = hand[1] - s[1];
  const len = Math.hypot(dx, dy) || 1;
  // The elbow sits half way, pushed out sideways (away from the body) by an amount that fades as the arm straightens.
  const bend = Math.min(16, Math.max(6, 22 - len * 0.1));
  const ex = s[0] + dx / 2 + out * bend * (Math.abs(dy) / len + 0.35);
  const ey = s[1] + dy / 2 + bend * 0.55;
  return `M${s[0]} ${s[1]} Q${r1(ex)} ${r1(ey)} ${r1(hand[0])} ${r1(hand[1])}`;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

function toolSvg(t: Tool, hand: Pt): string {
  const a = (t.ang * Math.PI) / 180;
  const len = 48;
  const tx = hand[0] + Math.sin(a) * len;
  const ty = hand[1] - Math.cos(a) * len;
  return `<path d="M${r1(hand[0])} ${r1(hand[1])} L${r1(tx)} ${r1(ty)}" stroke="#a4632a" stroke-width="5" stroke-linecap="round"/>
<circle cx="${r1(tx)}" cy="${r1(ty)}" r="8.5" fill="${t.color ?? '#ef4444'}" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/><circle cx="${r1(tx - 2.5)}" cy="${r1(ty - 2.5)}" r="2.6" fill="#fff" opacity=".6"/>`;
}

/** The limb of one arm, drawn BEHIND the instrument: only the paw shows on top, so the arm never hides what it plays. */
export function armBackSvg(side: 'l' | 'r', hand: Pt, look: BearLook): string {
  const s = SHOULDER[side];
  const d = armPath(side, hand);
  return `<g class="show-arm show-arm-${side}" data-arm="${side}" style="transform-origin:${s[0]}px ${s[1]}px">
<path d="${d}" fill="none" stroke="${look.furDark}" stroke-width="25" stroke-linecap="round"/>
<path d="${d}" fill="none" stroke="${look.fur}" stroke-width="20" stroke-linecap="round"/>
<circle cx="${s[0]}" cy="${s[1]}" r="14" fill="${look.fur}"/>
</g>`;
}

/** The paw of one arm (and what it holds), drawn on top of the instrument. */
export function armSvg(side: 'l' | 'r', hand: Pt, look: BearLook, tool?: Tool): string {
  const s = SHOULDER[side];
  return `<g class="show-arm show-arm-${side}" data-arm="${side}" style="transform-origin:${s[0]}px ${s[1]}px">
${tool ? toolSvg(tool, hand) : ''}
<circle cx="${r1(hand[0])}" cy="${r1(hand[1])}" r="11.5" fill="${look.fur}" stroke="${look.furDark}" stroke-width="2.5"/>
<ellipse cx="${r1(hand[0] + (side === 'l' ? 1 : -1) * 2)}" cy="${r1(hand[1] + 3)}" rx="5.5" ry="4.2" fill="${look.furDark}" opacity=".45"/>
<ellipse cx="${r1(hand[0] - 4)}" cy="${r1(hand[1] - 5.5)}" rx="4" ry="2.5" fill="#fff" opacity=".25"/>
</g>`;
}

/** The paws of a pose, for the overlay on top of the instrument. */
export function armsInner(pose: Pose, look: BearLook): string {
  const hl = toPerformer(pose, pose.l);
  const hr = toPerformer(pose, pose.r);
  return armSvg('l', hl, look, pose.tool?.l) + armSvg('r', hr, look, pose.tool?.r);
}

/** The limbs of a pose, for the layer under the instrument. */
export function armsBack(pose: Pose, look: BearLook): string {
  return armBackSvg('l', toPerformer(pose, pose.l), look) + armBackSvg('r', toPerformer(pose, pose.r), look);
}
