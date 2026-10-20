/**
 * Station 5 — Tìm khác biệt. Two pictures that are nearly the same; one spot is
 * different. Tap it on either picture. A wrong spot only gives a soft "boing".
 */
import { h, replay, shuffle } from '../../../core/dom';
import { makeTappable } from '../../../core/tap';
import { diffParams } from '../levels';
import { fitGrid } from '../layout';
import { FAMILIES, nameOfEmoji, thingsFor } from '../pieces';
import type { Station } from '../types';

export interface Scene {
  cols: number;
  rows: number;
  left: string[];
  /** Same as `left` except at `odd`, which is another emoji — or '' when the thing vanished. */
  right: string[];
  odd: number;
}

export function dealScene(level: number, island: number, rng: () => number): Scene {
  const { cols, rows, similar, mayVanish } = diffParams(level);
  const n = cols * rows;
  const pool = thingsFor(island).map((p) => p.emoji!);
  const left = shuffle(pool, rng).slice(0, n);
  const odd = Math.floor(rng() * n);
  const was = left[odd]!;
  let now = '';
  if (similar) {
    const fam = FAMILIES.find((f) => f.includes(was));
    const sibs = (fam ?? []).filter((e) => e !== was);
    if (sibs.length) now = sibs[Math.floor(rng() * sibs.length)]!;
  }
  if (!now) {
    if (mayVanish && rng() < 0.4) now = '';
    else now = shuffle(pool.filter((e) => !left.includes(e)), rng)[0] ?? '';
  }
  const right = [...left];
  right[odd] = now;
  return { cols, rows, left, right, odd };
}

export const diff: Station = {
  id: 'diff',
  title: 'Tìm khác biệt',
  icon: '🔍',
  color: '#dcfce7',
  intro: ['Hai bức tranh,', 'gần giống nhau.', 'Tìm chỗ khác nhé!'],
  start(env, done) {
    const sc = dealScene(env.level, env.island, env.rng);
    let found = false;

    const cellsOf = (items: string[]) =>
      items.map((e, i) => {
        const el = h('button', { class: 'brain-diff-cell', type: 'button', 'aria-label': 'ô' }, e ? h('span', { class: 'brain-piece' }, e) : null);
        makeTappable(el, () => tapped(i), { cooldownMs: 120, ctx: env.ctx });
        return el;
      });
    const lc = cellsOf(sc.left);
    const rc = cellsOf(sc.right);
    const grid = (cells: HTMLElement[]) => h('div', { class: 'brain-diff-grid' }, ...cells);
    const gl = grid(lc);
    const gr = grid(rc);
    const panelL = h('div', { class: 'brain-diff-panel' }, gl);
    const panelR = h('div', { class: 'brain-diff-panel' }, gr);
    const wrap = h('div', { class: 'brain-diff' }, panelL, panelR);
    env.area.append(wrap);

    function layout(): void {
      const r = panelL.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const gap = Math.max(6, Math.min(r.width, r.height) * 0.025);
      const fit = fitGrid(sc.cols * sc.rows, r.width - 20, r.height - 20, gap, sc.cols * sc.rows, true);
      for (const g of [gl, gr]) {
        g.style.setProperty('--cols', String(fit.cols));
        g.style.setProperty('--size', `${Math.min(Math.max(fit.size, 0), 170)}px`);
        g.style.setProperty('--gap', `${gap}px`);
      }
    }
    env.onResize(layout);
    layout();
    wrap.style.setProperty('--cols', String(sc.cols));

    function tapped(i: number): void {
      if (found) return;
      if (i === sc.odd) {
        found = true;
        env.ctx.hint.clear();
        lc[i]!.classList.add('found');
        rc[i]!.classList.add('found');
        env.ctx.audio.ding();
        navigator.vibrate?.(15);
        const was = nameOfEmoji(sc.left[i]!);
        const now = sc.right[i]! ? nameOfEmoji(sc.right[i]!) : '';
        env.say(now ? ['Đây rồi!', was + ',', 'thành ' + now + '.'] : ['Đây rồi!', was + ',', 'biến mất rồi.']);
        env.later(() => done(3), 2800);
        return;
      }
      env.stats.slips++;
      env.ctx.audio.boing();
      replay(lc[i]!, 'anim-shake');
      replay(rc[i]!, 'anim-shake');
    }

    env.arm(() => {
      if (found) return false;
      // After a couple of wrong tries, circle the spot; before that just nudge both pictures.
      const cells = env.stats.slips + env.stats.hints >= 2 ? [lc[sc.odd]!, rc[sc.odd]!] : [];
      for (const c of cells) replay(c, 'anim-wiggle');
      if (!cells.length) {
        replay(panelL, 'anim-bounce');
        replay(panelR, 'anim-bounce');
      }
      return undefined;
    }, 8000);
  },
};
