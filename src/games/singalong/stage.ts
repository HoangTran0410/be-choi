import { h, randInt, replay } from '../../core/dom';
import { perf } from '../../core/frame';
import type { Photo } from '../../core/photos';
import type { GameContext } from '../../core/types';
import { CHARACTERS, HATS, STAGES, type Band } from './catalog';
import type { VoiceFrame } from './voice';

/** The child is singing loudly enough for the stage to react… */
export const LOUD = 0.28;
/** …and has gone quiet again (hysteresis, so the lights do not flicker). */
export const QUIET = 0.16;
const NOTE_GAP_MS = 240;
const NOTE_LIFE_MS = 1600;
const MAX_NOTES = 6;
const MAX_SPARKS = 24;
const SPARK_LIFE_MS = 1700;

export type LightStyle = 'gold' | 'rainbow' | 'pink' | 'blue';
export type BurstKind = 'sparkle' | 'rainbow' | 'fire' | 'bubbles';

const BURST_EMOJI: Record<BurstKind, readonly string[]> = {
  sparkle: ['✨', '⭐', '🌟'],
  rainbow: ['🌈', '☁️', '💖'],
  fire: ['🎆', '🎇', '✨'],
  bubbles: ['🫧', '💙', '🫧'],
};
const NOTE_EMOJI: readonly string[] = ['🎵', '🎶', '🎼'];

/** What the singer's face is: a character, or a photo of someone the child loves. */
export type Face = { kind: 'emoji'; emoji: string } | { kind: 'photo'; url: string };

/** `char:cat` / `photo:p1a2` → a face. A photo that was removed falls back to the first character. */
export function resolveFace(face: string, photos: readonly Photo[]): Face {
  const [kind, id] = [face.slice(0, face.indexOf(':')), face.slice(face.indexOf(':') + 1)];
  if (kind === 'photo') {
    const photo = photos.find((p) => p.id === id);
    if (photo) return { kind: 'photo', url: photo.url };
  } else {
    const c = CHARACTERS.find((x) => x.id === id);
    if (c) return { kind: 'emoji', emoji: c.emoji };
  }
  return { kind: 'emoji', emoji: CHARACTERS[0]?.emoji ?? '🧒' };
}

/** Paint a face into `el`: an emoji as text, a photo as a round picture. */
export function paintFace(el: HTMLElement, face: Face): void {
  el.textContent = '';
  el.classList.toggle('sa-photo', face.kind === 'photo');
  if (face.kind === 'photo') el.style.backgroundImage = `url("${face.url}")`;
  else {
    el.style.removeProperty('background-image');
    el.textContent = face.emoji;
  }
}

export interface Stage {
  /** Backdrop, curtains and lights: sits behind everything. */
  back: HTMLElement;
  /** Floating notes and sparks: sits on top of everything and never takes a touch. */
  fx: HTMLElement;
  /** The singer, big and tappable (a tap is a clap). */
  singer: HTMLButtonElement;
  setTheme(id: string): void;
  setFace(face: Face): void;
  setHat(id: string): void;
  setLights(style: LightStyle): void;
  /** Feed every voice frame: lights, the singer's size and floating notes follow. */
  react(frame: VoiceFrame): void;
  burst(kind: BurstKind): void;
  /** A little bounce for the singer. */
  wave(): void;
}

export function createStage(ctx: Pick<GameContext, 'onCleanup'>): Stage {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, fn: () => void): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  ctx.onCleanup(() => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });

  const deco = h('div', { class: 'sa-deco', 'aria-hidden': 'true' });
  const lights = h(
    'div',
    { class: 'sa-lights', 'aria-hidden': 'true' },
    ...Array.from({ length: 5 }, (_, i) => h('span', { class: 'sa-light', style: `--i:${i}` })),
  );
  const back = h(
    'div',
    { class: 'sa-back', 'aria-hidden': 'true' },
    deco,
    h('div', { class: 'sa-curtain sa-curtain-l' }),
    h('div', { class: 'sa-curtain sa-curtain-r' }),
    lights,
  );
  const fx = h('div', { class: 'sa-fx', 'aria-hidden': 'true' });
  const hat = h('span', { class: 'sa-hat' });
  const face = h('span', { class: 'sa-face' });
  const mike = h('span', { class: 'sa-mike' }, '🎤');
  const singer = h('button', { class: 'sa-singer', type: 'button', 'aria-label': 'Ca sĩ nhí. Chạm để vỗ tay' }, face, hat, mike);

  let loud = false;
  let lastLevel = -1;
  let lastHeight = -1;
  let lastNoteAt = -Infinity;
  let sparks = 0;

  function setTheme(id: string): void {
    const theme = STAGES.find((s) => s.id === id) ?? STAGES[0];
    if (!theme) return;
    back.dataset.stage = theme.id;
    deco.replaceChildren(...theme.deco.map((e, i) => h('span', { class: 'sa-deco-item', style: `--i:${i}` }, e)));
  }

  function setHat(id: string): void {
    const found = HATS.find((x) => x.id === id) ?? HATS[0];
    const none = !found || found.id === 'none';
    hat.textContent = none ? '' : found.emoji;
    hat.hidden = none;
    hat.classList.toggle('sa-hat-eyes', found?.id === 'shades');
    hat.classList.toggle('sa-hat-ears', found?.id === 'phones');
  }

  function floatNote(band: Band | null): void {
    const now = Date.now();
    if (now - lastNoteAt < NOTE_GAP_MS || fx.querySelectorAll('.sa-note').length >= (perf.low ? 3 : MAX_NOTES)) return;
    lastNoteAt = now;
    // Notes rise out of the singer, wherever the layout put them.
    const s = singer.getBoundingClientRect();
    const f = fx.getBoundingClientRect();
    const left = f.width > 0 ? ((s.left + s.width / 2 - f.left) / f.width) * 100 + randInt(-8, 8) : randInt(22, 78);
    const bottom = f.height > 0 ? ((f.bottom - s.top) / f.height) * 100 - 6 : 28;
    const el = h(
      'span',
      { class: 'sa-note', style: `left:${left.toFixed(1)}%;bottom:${bottom.toFixed(1)}%;--band:${band ?? 1}` },
      NOTE_EMOJI[band ?? 1] ?? '🎵',
    );
    fx.append(el);
    after(NOTE_LIFE_MS, () => el.remove());
  }

  return {
    back,
    fx,
    singer,
    setTheme,
    setHat,
    setFace(f) {
      paintFace(face, f);
    },
    setLights(style) {
      back.dataset.lights = style;
    },
    react(frame) {
      if (Math.abs(frame.level - lastLevel) > 0.03 || frame.level === 0) {
        lastLevel = frame.level;
        back.style.setProperty('--sa-level', frame.level.toFixed(2));
        singer.style.setProperty('--sa-level', frame.level.toFixed(2));
      }
      const height = frame.height ?? 0.5;
      if (Math.abs(height - lastHeight) > 0.05) {
        lastHeight = height;
        singer.style.setProperty('--sa-height', height.toFixed(2));
      }
      if (frame.level > LOUD) {
        if (!loud) {
          loud = true;
          back.classList.add('sa-loud');
          singer.classList.add('sa-singing');
        }
        floatNote(frame.band);
      } else if (loud && frame.level < QUIET) {
        loud = false;
        back.classList.remove('sa-loud');
        singer.classList.remove('sa-singing');
      }
    },
    burst(kind) {
      const set = BURST_EMOJI[kind];
      const n = perf.low ? 5 : 11;
      for (let i = 0; i < n && sparks < MAX_SPARKS; i++) {
        sparks++;
        const el = h(
          'span',
          { class: `sa-spark sa-spark-${kind}`, style: `left:${randInt(8, 92)}%;--dx:${randInt(-14, 14)}vmin;--d:${randInt(0, 400)}ms` },
          set[i % set.length] ?? '✨',
        );
        fx.append(el);
        after(SPARK_LIFE_MS + 400, () => {
          el.remove();
          sparks = Math.max(0, sparks - 1);
        });
      }
    },
    wave() {
      replay(singer, 'sa-wave');
    },
  };
}
