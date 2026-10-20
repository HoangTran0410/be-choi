/**
 * Station 2 — Xếp bi màu. The old `tubes` game, played here as one station: its own
 * drag-and-tap board, its own ladder (`tubesLevel`). The old game would roll on to
 * the next board by itself; here "round won" is handed back to the island instead.
 */
import { h } from '../../../core/dom';
import type { GameContext } from '../../../core/types';
import { startTubes } from '../../tubes/index';
import { tubesLevel } from '../levels';
import type { Station } from '../types';

/** Number of full tubes at each ladder rung (colours in play). */
const COLORS_AT = [2, 3, 3, 4, 5, 6, 6];

export const tubes: Station = {
  id: 'tubes',
  title: 'Xếp bi màu',
  icon: '🧪',
  color: '#e2e8f0',
  intro: ['Xếp bi cùng màu,', 'vào một ống nhé!'],
  start(env, done) {
    const level = tubesLevel(env.level);
    const box = h('div', { class: 'brain-tubes' });
    env.area.append(box);
    const cleanups: Array<() => void> = [];
    let finished = false;
    const inner: GameContext = {
      ...env.ctx,
      stage: box,
      onCleanup: (fn) => void cleanups.push(fn),
      addStar: () => undefined,
      hint: {
        arm: (fn, ms) => env.arm(fn, ms),
        touch: () => env.ctx.hint.touch(),
        clear: () => env.ctx.hint.clear(),
      },
      speak: (t) => env.say([t]),
      celebrate: () => {
        // The board is solved. Hand it back, and leave the old game parked: it
        // would otherwise deal itself the next board.
        if (!finished) {
          finished = true;
          env.later(() => done((COLORS_AT[level] ?? 3) * 2), 500);
        }
        return new Promise<void>(() => undefined);
      },
    };
    startTubes(inner, level);
    return () => {
      for (const fn of cleanups.reverse()) fn();
    };
  },
};
