/**
 * Station 3 — Nhớ dãy. 2 to 5 pictures light up one after another, each with its
 * sound; then the child taps them back in the same order. A wrong tap is not a
 * penalty: the tune is simply played again.
 */
import { h, replay } from '../../../core/dom';
import { makeTappable } from '../../../core/tap';
import { sequenceParams } from '../levels';
import { animalPieces, colorPieces, draw, fromPhoto, fruitPieces, mix, pieceEl, soundOf, type Piece } from '../pieces';
import type { Station } from '../types';

/** How long each picture is shown: slow enough to hear and see. */
export const STEP_MS = 1300;

type Kind = 'animals' | 'colors' | 'fruits';
const KINDS: readonly Kind[] = ['animals', 'colors', 'fruits'];

export interface Tune {
  options: Piece[];
  /** Indexes into `options`, no repeats. */
  order: number[];
}

export function dealTune(level: number, kind: Kind, photos: readonly { id: string; url: string; createdAt: number }[], rng: () => number): Tune {
  const { length, options } = sequenceParams(level);
  const pool = kind === 'animals' ? animalPieces() : kind === 'colors' ? colorPieces() : fruitPieces();
  let chosen = draw(pool, options, rng);
  // A family photo takes one seat among the animals.
  if (kind === 'animals' && photos.length) chosen = [...chosen.slice(0, -1), fromPhoto(photos[Math.floor(rng() * photos.length)]!)];
  const opts = mix(chosen, rng);
  const order = mix(
    opts.map((_, i) => i),
    rng,
  ).slice(0, length);
  return { options: opts, order };
}

export const sequence: Station = {
  id: 'sequence',
  title: 'Nhớ dãy',
  icon: '🎶',
  color: '#fce7f3',
  intro: ['Nghe và nhìn,', 'rồi bấm lại,', 'theo thứ tự nhé!'],
  start(env, done) {
    const kind = KINDS[Math.floor(env.rng() * KINDS.length)]!;
    const { options, order } = dealTune(env.level, kind, env.photos, env.rng);
    const L = order.length;

    const spot = h('div', { class: 'brain-seq-spot' });
    const slotEls = order.map(() => h('span', { class: 'brain-seq-slot' }, '?'));
    const slotsRow = h('div', { class: 'brain-seq-slots' }, ...slotEls);
    const replayBtn = h('button', { class: 'brain-seq-replay', type: 'button', 'aria-label': 'nghe lại' }, '🔁');
    const top = h('div', { class: 'brain-seq-top' }, spot, slotsRow, replayBtn);
    const optEls = options.map((p, i) => {
      const el = h('button', { class: 'brain-seq-opt', type: 'button', 'aria-label': p.name }, pieceEl(p));
      makeTappable(el, () => pressed(i), { cooldownMs: 80, ctx: env.ctx });
      return el;
    });
    const optsRow = h('div', { class: 'brain-seq-opts', 'data-count': String(options.length) }, ...optEls);
    env.area.append(h('div', { class: 'brain-seq' }, top, optsRow));

    let phase: 'show' | 'answer' = 'show';
    let progress = 0;
    let run = 0;

    function setLocked(on: boolean): void {
      optsRow.classList.toggle('locked', on);
      replayBtn.classList.toggle('hidden', on);
    }

    function light(i: number): void {
      const p = options[i]!;
      optEls[i]!.classList.add('lit');
      env.later(() => optEls[i]!.classList.remove('lit'), STEP_MS - 350);
      spot.replaceChildren(pieceEl(p));
      replay(spot, 'anim-bounce');
      soundOf(env.ctx.audio, p, i);
      if (!p.fx) env.say([p.name]);
    }

    /** Show the tune from the start. */
    function play(lead = 0): void {
      const mine = ++run;
      phase = 'show';
      progress = 0;
      setLocked(true);
      slotEls.forEach((s) => {
        s.textContent = '?';
        s.classList.remove('filled');
      });
      spot.replaceChildren();
      order.forEach((idx, n) => {
        env.later(() => {
          if (mine === run) light(idx);
        }, lead + n * STEP_MS);
      });
      env.later(() => {
        if (mine !== run) return;
        phase = 'answer';
        setLocked(false);
        spot.replaceChildren(h('span', { class: 'brain-piece' }, '👆'));
        env.say(['Đến lượt bé!']);
      }, lead + L * STEP_MS + 300);
    }

    function pressed(i: number): void {
      if (phase !== 'answer') return;
      const p = options[i]!;
      if (i === order[progress]) {
        soundOf(env.ctx.audio, p, i);
        const slot = slotEls[progress]!;
        slot.replaceChildren(pieceEl(p));
        slot.classList.add('filled');
        replay(optEls[i]!, 'anim-bounce');
        progress++;
        if (progress === L) {
          phase = 'show';
          env.ctx.hint.clear();
          env.later(() => done(L), 600);
        }
        return;
      }
      env.stats.slips++;
      env.ctx.audio.boing();
      replay(optEls[i]!, 'anim-shake');
      phase = 'show';
      env.say(['Mình nghe lại nhé!']);
      env.later(() => play(900), 500);
    }

    makeTappable(replayBtn, () => play(), { ctx: env.ctx });
    play(1800);

    env.arm(() => {
      if (phase !== 'answer') return false;
      const want = order[progress];
      if (want !== undefined) replay(optEls[want]!, 'anim-wiggle');
    }, 8000);
  },
};
