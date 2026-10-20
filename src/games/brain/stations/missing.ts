/**
 * Station 4 — Tìm đồ biến mất. 4 to 6 things are named one by one, a cloth covers
 * them, then one is gone: "thiếu gì nhỉ?" A few pictures to choose from. A wrong
 * pick just fades away; the right one hops back into its place.
 */
import { h, replay } from '../../../core/dom';
import { makeTappable } from '../../../core/tap';
import { missingParams } from '../levels';
import { fitGrid } from '../layout';
import { draw, fromPhoto, mix, pieceEl, thingsFor, type Piece } from '../pieces';
import type { Station } from '../types';

/** How long each thing is shown and named. */
export const LOOK_MS = 1400;

export interface Table {
  shown: Piece[];
  /** Index in `shown` of the thing that vanishes. */
  gone: number;
  /** Answers to pick from, including the right one; none of the wrong ones were on the table. */
  choices: Piece[];
}

export function dealTable(
  level: number,
  island: number,
  photos: readonly { id: string; url: string; createdAt: number }[],
  rng: () => number,
): Table {
  const { shown: n, choices: c } = missingParams(level);
  const pool = thingsFor(island);
  const things = draw(pool, n + c, rng);
  let shown = things.slice(0, n);
  // A family photo sits on the table now and then: the child may be asked about it.
  if (photos.length && rng() < 0.6) shown = [...shown.slice(0, -1), fromPhoto(photos[Math.floor(rng() * photos.length)]!)];
  shown = mix(shown, rng);
  const gone = Math.floor(rng() * shown.length);
  const wrong = things.slice(n, n + c - 1);
  const choices = mix([shown[gone]!, ...wrong], rng);
  return { shown, gone, choices };
}

export const missing: Station = {
  id: 'missing',
  title: 'Thiếu gì nhỉ?',
  icon: '🧺',
  color: '#fef3c7',
  intro: ['Nhìn kỹ nhé,', 'rồi đoán xem,', 'thiếu gì!'],
  start(env, done) {
    const table = dealTable(env.level, env.island, env.photos, env.rng);
    const { shown, gone, choices } = table;

    const cells = shown.map((p, i) => {
      const el = h('button', { class: 'brain-miss-cell', type: 'button', 'aria-label': p.name }, pieceEl(p));
      makeTappable(el, () => tapCell(i), { ctx: env.ctx });
      return el;
    });
    const cloth = h('div', { class: 'brain-miss-cloth' }, h('span', { class: 'brain-miss-q' }, '🧺'));
    const grid = h('div', { class: 'brain-miss-grid' }, ...cells);
    const tableEl = h('div', { class: 'brain-miss-table' }, grid, cloth);
    const choiceEls = choices.map((p, i) => {
      const el = h('button', { class: 'brain-miss-choice', type: 'button', 'aria-label': p.name }, pieceEl(p));
      makeTappable(el, () => pick(i), { cooldownMs: 80, ctx: env.ctx });
      return el;
    });
    const choiceRow = h('div', { class: 'brain-miss-choices' }, ...choiceEls);
    env.area.append(h('div', { class: 'brain-miss' }, tableEl, choiceRow));

    let phase: 'look' | 'ask' | 'won' = 'look';

    function layout(): void {
      const r = tableEl.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const gap = Math.max(10, Math.min(r.width, r.height) * 0.03);
      const fit = fitGrid(shown.length, r.width - 24, r.height - 24, gap);
      grid.style.setProperty('--cols', String(fit.cols));
      grid.style.setProperty('--size', `${Math.min(fit.size, 220)}px`);
      grid.style.setProperty('--gap', `${gap}px`);
    }
    env.onResize(layout);
    layout();

    function tapCell(i: number): void {
      if (phase === 'won') return;
      const p = shown[i]!;
      if (phase === 'ask' && i === gone) return;
      env.ctx.audio.tick();
      replay(cells[i]!, 'anim-bounce');
      if (phase === 'look') env.say([p.name]);
    }

    // 1. Look: name each thing, slowly, one at a time.
    const lead = 1900;
    shown.forEach((p, i) => {
      env.later(() => {
        if (phase !== 'look') return;
        cells[i]!.classList.add('lit');
        replay(cells[i]!, 'anim-bounce');
        env.ctx.audio.tick();
        env.say([p.name]);
        env.later(() => cells[i]!.classList.remove('lit'), LOOK_MS - 300);
      }, lead + i * LOOK_MS);
    });
    // 2. Cover them up.
    const coverAt = lead + shown.length * LOOK_MS + 700;
    env.later(() => {
      cloth.classList.add('down');
      env.ctx.audio.puff();
      env.say(['Che lại nào!']);
    }, coverAt);
    // 3. Lift the cloth: one is missing.
    env.later(() => {
      cells[gone]!.classList.add('gone');
      cloth.classList.remove('down');
      phase = 'ask';
      choiceRow.classList.add('show');
      env.say(['Thiếu gì nhỉ?']);
    }, coverAt + 2200);

    function pick(i: number): void {
      if (phase !== 'ask') return;
      const el = choiceEls[i]!;
      if (el.classList.contains('out')) return;
      if (i === choices.indexOf(shown[gone]!)) {
        phase = 'won';
        env.ctx.hint.clear();
        el.classList.add('right');
        cells[gone]!.classList.remove('gone');
        replay(cells[gone]!, 'anim-bounce');
        env.ctx.audio.ding();
        navigator.vibrate?.(15);
        env.say(shown[gone]!.photo ? ['Đúng rồi,', 'ảnh nhà mình!'] : ['Đúng rồi,', `${shown[gone]!.name}!`]);
        env.later(() => done(choices.length), 1800);
        return;
      }
      env.stats.slips++;
      env.ctx.audio.boing();
      replay(el, 'anim-shake');
      el.classList.add('out');
      env.say(['Chưa phải,', 'thử lại nhé!']);
    }

    env.arm(() => {
      if (phase !== 'ask') return false;
      const right = choiceEls[choices.indexOf(shown[gone]!)];
      if (right) replay(right, 'anim-wiggle');
    }, 7000);
  },
};
