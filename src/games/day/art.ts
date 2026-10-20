/**
 * The little friend: a round head (drawn, or a family photo), a body in a shirt colour and
 * whatever has been put on — hat, top, shoes. One `Kid` can be shown in several places at
 * once (big in the room, small in the corner of the HUD) and they all change together.
 */
import { h, svgEl } from '../../core/dom';
import type { Slot } from '../dressup/logic';
import type { Mood } from './day';

export interface KidState {
  mood: Mood;
  hat: string;
  top: string;
  shoes: string;
  /** Photo to use as the face (data URL), or '' for the drawn face. */
  faceUrl: string;
  /** Fast asleep: eyes shut, snoring. */
  asleep: boolean;
  /** A quick fit of giggles (a silly outfit). */
  giggle: boolean;
}

export type KidSize = 'big' | 'mini';

export interface Kid {
  readonly state: Readonly<KidState>;
  /** A new view of the friend. Views stay in sync until `dispose()`. */
  view(size: KidSize): HTMLElement;
  /** Stop keeping a view in sync (it was removed from the page). */
  release(el: HTMLElement): void;
  set(patch: Partial<KidState>): void;
  wear(slot: Slot, emoji: string): void;
  /** Take everything off (a new day). */
  undress(): void;
  dispose(): void;
}

const INK = '#5b3a29';

const EYES = `<circle cx="35" cy="44" r="5" fill="${INK}"/><circle cx="65" cy="44" r="5" fill="${INK}"/><circle cx="37" cy="42" r="1.6" fill="#fff"/><circle cx="67" cy="42" r="1.6" fill="#fff"/>`;
const CHEEKS = `<circle cx="22" cy="60" r="8" fill="#fda4af" opacity=".55"/><circle cx="78" cy="60" r="8" fill="#fda4af" opacity=".55"/>`;
const line = (d: string): string => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`;

const FACES: Record<Mood | 'giggle' | 'asleep', string> = {
  happy: EYES + CHEEKS + line('M32 62 Q50 82 68 62'),
  giggle: `${line('M27 46 Q35 38 43 46')}${line('M57 46 Q65 38 73 46')}${CHEEKS}<path d="M30 60 Q50 90 70 60 Z" fill="#7f1d1d" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M38 72 Q50 82 62 72 Q50 66 38 72Z" fill="#fb7185"/>`,
  hungry: `${EYES}${CHEEKS}<ellipse cx="50" cy="72" rx="9" ry="11" fill="#7f1d1d" stroke="${INK}" stroke-width="3"/><path d="M44 78 Q50 70 56 78 Z" fill="#fb7185"/>`,
  sleepy: `${line('M27 46 Q35 54 43 46')}${line('M57 46 Q65 54 73 46')}${CHEEKS}<ellipse cx="50" cy="72" rx="6" ry="7" fill="#7f1d1d"/>`,
  asleep: `${line('M27 46 Q35 54 43 46')}${line('M57 46 Q65 54 73 46')}${CHEEKS}${line('M42 70 Q50 76 58 70')}`,
  sad: `${EYES}${CHEEKS}${line('M34 76 Q50 60 66 76')}<path d="M70 52 Q74 62 70 66 Q64 62 70 52Z" fill="#7dd3fc"/>`,
  angry: `${line('M26 36 L44 42')}${line('M74 36 L56 42')}<circle cx="35" cy="48" r="4.5" fill="${INK}"/><circle cx="65" cy="48" r="4.5" fill="${INK}"/>${CHEEKS}${line('M36 74 Q50 64 64 74')}`,
  surprised: `<circle cx="35" cy="44" r="7" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="65" cy="44" r="7" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="35" cy="44" r="3" fill="${INK}"/><circle cx="65" cy="44" r="3" fill="${INK}"/>${CHEEKS}<ellipse cx="50" cy="72" rx="7" ry="9" fill="#7f1d1d" stroke="${INK}" stroke-width="3"/>`,
};

function faceSvg(key: keyof typeof FACES): SVGSVGElement {
  return svgEl(`<svg viewBox="0 0 100 100" aria-hidden="true">${FACES[key]}</svg>`);
}

/** Small round badge on the head that tells the mood even when the face is a photo. */
const BADGE: Record<Mood, string> = { happy: '😊', hungry: '🤤', sleepy: '😴', sad: '😢', angry: '😠', surprised: '😮' };

const BODY_SVG = `<svg viewBox="0 0 100 118" aria-hidden="true" preserveAspectRatio="none">
  <rect x="26" y="70" width="20" height="46" rx="9" fill="#60a5fa"/><rect x="54" y="70" width="20" height="46" rx="9" fill="#60a5fa"/>
  <circle cx="5" cy="48" r="9" fill="#fcd5b0"/><circle cx="95" cy="48" r="9" fill="#fcd5b0"/>
  <rect x="7" y="2" width="86" height="80" rx="28" fill="var(--shirt, #fbbf24)"/>
</svg>`;

interface View {
  el: HTMLElement;
  size: KidSize;
  paint(s: KidState): void;
}

export function createKid(initial: Partial<KidState> = {}): Kid {
  const state: KidState = { mood: 'happy', hat: '', top: '', shoes: '', faceUrl: '', asleep: false, giggle: false, ...initial };
  const views = new Set<View>();

  function build(size: KidSize): View {
    const face = h('div', { class: 'kid-face' });
    const badge = h('span', { class: 'kid-badge' });
    const head = h('div', { class: 'kid-head' }, face, badge);
    const hat = h('div', { class: 'kid-hat' });
    const top = h('span', { class: 'kid-top' });
    const body = h('div', { class: 'kid-body' }, svgEl(BODY_SVG), top);
    const shoes = h('div', { class: 'kid-shoes' }, h('span', {}), h('span', {}));
    const zzz = h('span', { class: 'kid-zzz' }, '💤');
    const el = h('div', { class: `kid kid-${size}`, 'aria-hidden': 'true' }, hat, head, body, shoes, zzz);
    let shown = '';
    return {
      el,
      size,
      paint(s) {
        const key = s.asleep ? 'asleep' : s.giggle ? 'giggle' : s.mood;
        const photo = s.faceUrl !== '';
        head.classList.toggle('kid-photo', photo);
        head.style.backgroundImage = photo ? `url("${s.faceUrl}")` : '';
        const next = photo ? 'photo' : key;
        if (shown !== next) {
          shown = next;
          face.replaceChildren(...(photo ? [] : [faceSvg(key)]));
        }
        badge.textContent = s.asleep ? '😴' : s.giggle ? '🤣' : BADGE[s.mood];
        badge.hidden = !photo && s.mood === 'happy';
        el.dataset.mood = s.asleep ? 'asleep' : s.mood;
        hat.textContent = s.hat;
        top.textContent = s.top;
        shoes.firstElementChild!.textContent = s.shoes;
        shoes.lastElementChild!.textContent = s.shoes;
        zzz.hidden = !s.asleep;
      },
    };
  }

  const paintAll = (): void => views.forEach((v) => v.paint(state));

  return {
    state,
    view(size) {
      const v = build(size);
      views.add(v);
      v.paint(state);
      return v.el;
    },
    release(el) {
      for (const v of views) if (v.el === el) views.delete(v);
    },
    set(patch) {
      Object.assign(state, patch);
      paintAll();
    },
    wear(slot, emoji) {
      state[slot] = emoji;
      paintAll();
    },
    undress() {
      state.hat = state.top = state.shoes = '';
      paintAll();
    },
    dispose() {
      views.clear();
    },
  };
}

/** A round picture of someone who comes to play: their photo, or a drawn person. */
export function visitorBubble(photoUrl: string | null, emoji: string): HTMLElement {
  return photoUrl
    ? h('div', { class: 'visitor visitor-photo', style: `background-image:url("${photoUrl}")` })
    : h('div', { class: 'visitor' }, emoji);
}
