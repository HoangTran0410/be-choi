import { h, replay } from '../../core/dom';
import type { Photo } from '../../core/photos';
import { makeTappable } from '../../core/tap';
import type { GameContext } from '../../core/types';
import { FANS, MAX_FAMILY } from './catalog';
import { LOUD, QUIET } from './stage';
import type { VoiceFrame } from './voice';

export interface Audience {
  el: HTMLElement;
  /** Seat `fans` animals and up to MAX_FAMILY photos from the album. */
  setFans(fans: number, photos: readonly Photo[]): void;
  /** Feed every voice frame: who is dancing follows how high the voice is. */
  react(frame: VoiceFrame): void;
  /** Everybody cheers for a moment. */
  cheer(ms?: number): void;
  /** One seat jumps (the band playing a note). */
  jump(index: number): void;
  readonly size: number;
}

const FAN_SOUND_GAP_MS = 500;

/**
 * The crowd: animals in the back row, and the family — their real photos — in the
 * front. A low voice makes the big animals dance, a high voice the small ones, and
 * a voice with no pitch (or a clap) gets everyone up.
 */
export function createAudience(ctx: Pick<GameContext, 'audio' | 'onCleanup'>): Audience {
  const back = h('div', { class: 'sa-row sa-row-back' });
  const front = h('div', { class: 'sa-row sa-row-front' });
  const el = h('div', { class: 'sa-crowd', 'aria-label': 'Khán giả' }, back, front);
  const seats: HTMLElement[] = [];
  const disposers: Array<() => void> = [];
  let hot = '';
  let loud = false;
  let cheerTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSound = -Infinity;

  ctx.onCleanup(() => {
    if (cheerTimer !== null) clearTimeout(cheerTimer);
    for (const d of disposers.splice(0)) d();
  });

  function seat(
    parent: HTMLElement,
    face: HTMLElement,
    cls: string,
    label: string,
    attrs: Record<string, string>,
    onTap: () => void,
  ): void {
    const btn = h('button', { class: `sa-fan ${cls}`, type: 'button', 'aria-label': label, ...attrs }, face);
    disposers.push(makeTappable(btn, onTap));
    parent.append(btn);
    seats.push(btn);
  }

  function sound(play: () => void): void {
    const now = Date.now();
    if (now - lastSound < FAN_SOUND_GAP_MS) return;
    lastSound = now;
    play();
  }

  return {
    el,
    get size() {
      return seats.length;
    },
    setFans(fans, photos) {
      for (const d of disposers.splice(0)) d();
      back.replaceChildren();
      front.replaceChildren();
      seats.length = 0;
      FANS.slice(0, Math.max(0, fans)).forEach((fan, i) => {
        seat(
          back,
          h('span', { class: 'sa-fan-face' }, fan.emoji),
          'sa-animal',
          fan.name,
          { 'data-band': String(fan.band), style: `--i:${i}` },
          () => {
            replay(seats[i] as HTMLElement, 'sa-jump');
            sound(() => ctx.audio.fx(fan.fx));
          },
        );
      });
      photos.slice(0, MAX_FAMILY).forEach((photo) => {
        const idx = seats.length;
        const face = h('span', { class: 'sa-fan-face sa-photo', style: `background-image:url("${photo.url}")` });
        seat(front, face, 'sa-family', 'Người nhà đang xem', { 'data-band': 'all', style: `--i:${idx}` }, () => {
          replay(seats[idx] as HTMLElement, 'sa-jump');
          sound(() => ctx.audio.pop(1.3));
        });
      });
    },
    react(frame) {
      if (frame.level > LOUD) loud = true;
      else if (frame.level < QUIET) loud = false;
      const next = !loud ? '' : frame.band === null ? 'all' : String(frame.band);
      if (next !== hot) {
        hot = next;
        if (next) el.dataset.hot = next;
        else delete el.dataset.hot;
      }
    },
    cheer(ms = 1600) {
      el.classList.add('sa-cheer');
      if (cheerTimer !== null) clearTimeout(cheerTimer);
      cheerTimer = setTimeout(() => {
        cheerTimer = null;
        el.classList.remove('sa-cheer');
      }, ms);
    },
    jump(index) {
      const s = seats[index % Math.max(1, seats.length)];
      if (s) replay(s, 'sa-jump');
    },
  };
}
