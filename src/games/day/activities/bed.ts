import { h, mulberry32, replay } from '../../../core/dom';
import { findSong, noteFreq, schedule, SONGS } from '../../../core/music';
import { CHEERS, JOBS, JOB_ICON, LULLABY_BPM, LULLABY_NOTES, NUDGES, TOYS, type Job } from '../../bedtime/logic';
import { take } from '../day';
import type { Activity } from '../env';

const LULLABY = findSong('twinkle') ?? SONGS[0];
const TOY_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [10, 62],
  [34, 70],
  [56, 60],
];

/**
 * Ru bạn nhỏ đi ngủ: put the toys in their basket, switch the lamp off, pull the blanket up and
 * sing the lullaby to the moon — in any order, and the lamp and blanket can be undone. When all
 * four are done the little friend falls asleep.
 */
export const bed: Activity = (env) => {
  const { ctx, scope, kid, plan } = env;
  const rng = mulberry32(plan.seed + 71);
  const done = new Set<Job>();
  let toysLeft = 3;
  let dark = false;
  let covered = false;
  let singing = false;
  let asleep = false;

  const mini = env.kidView('mini');
  const lamp = h('button', { class: 'bed-lamp', type: 'button', 'aria-label': 'Đèn' }, '💡');
  const moon = h('button', { class: 'bed-moon', type: 'button', 'aria-label': 'Mặt trăng' }, '🌙');
  const blanket = h('div', { class: 'bed-blanket' });
  const bedEl = h('button', { class: 'bed-bed', type: 'button', 'aria-label': 'Giường' }, h('span', { class: 'bed-pillow' }), h('div', { class: 'bed-kid' }, mini), blanket);
  const basket = h('div', { class: 'bed-basket', 'aria-label': 'Hộp đồ chơi' }, '🧺');
  const toys = take(TOYS, 3, rng).map((emoji, i) => {
    const [x, y] = TOY_SPOTS[i] ?? [20, 66];
    const b = h('button', { class: 'bed-toy', type: 'button', style: `left:${x}%;top:${y}%`, 'aria-label': emoji }, emoji);
    scope.piece(b, () => basket, () => tidy(b));
    return b;
  });
  const ticks = new Map<Job, HTMLElement>();
  const row = h(
    'div',
    { class: 'bed-ticks', 'aria-hidden': 'true' },
    ...JOBS.map((j) => {
      const t = h('span', { class: 'bed-tick' }, JOB_ICON[j]);
      ticks.set(j, t);
      return t;
    }),
  );
  const room = h('div', { class: 'bed' }, h('div', { class: 'bed-room' }), row, lamp, moon, bedEl, ...toys, basket);
  env.host.append(room);

  function setJob(j: Job, on: boolean): void {
    if (on) {
      if (done.has(j)) return;
      done.add(j);
      ctx.audio.ding();
      env.say(CHEERS[j]);
    } else done.delete(j);
    ticks.get(j)?.classList.toggle('done', on);
    if (done.size === JOBS.length) sleep();
  }

  function tidy(b: HTMLElement): void {
    ctx.hint.touch();
    if (b.classList.contains('gone')) return;
    b.classList.add('gone');
    ctx.audio.pop(1.1);
    replay(basket, 'anim-bounce');
    toysLeft--;
    if (toysLeft === 0) setJob('toys', true);
  }

  scope.tap(lamp, () => {
    ctx.hint.touch();
    dark = !dark;
    room.classList.toggle('dark', dark);
    ctx.audio.tick();
    if (dark) setJob('light', true);
    else {
      setJob('light', false);
      env.say('Sáng rồi!');
    }
  });

  scope.tap(bedEl, () => {
    ctx.hint.touch();
    covered = !covered;
    bedEl.classList.toggle('covered', covered);
    ctx.audio.pop(0.9);
    if (covered) setJob('blanket', true);
    else {
      setJob('blanket', false);
      env.say('Mở chăn ra!');
    }
  });

  scope.tap(moon, () => {
    ctx.hint.touch();
    replay(moon, 'anim-bounce');
    if (singing || asleep) return;
    const notes = (LULLABY?.notes ?? []).slice(0, LULLABY_NOTES);
    if (notes.length === 0) {
      setJob('lullaby', true);
      return;
    }
    singing = true;
    env.say(LULLABY?.title ?? 'Hát ru…');
    const cancel = schedule(
      notes,
      LULLABY_BPM,
      (_i, n, ms) => {
        if (n.n !== 'R') ctx.audio.note(noteFreq(n.n), (ms / 1000) * 1.1, 'bell');
      },
      () => {
        singing = false;
        setJob('lullaby', true);
      },
    );
    scope.own(cancel);
  });

  function sleep(): void {
    if (asleep) return;
    asleep = true;
    ctx.hint.clear();
    kid.set({ asleep: true, mood: 'sleepy' });
    room.classList.add('dark');
    scope.later(() => env.say('Bạn nhỏ ngủ rồi… chúc ngủ ngon!'), 900);
    scope.later(() => env.finish(), 4200);
  }

  env.say('Tối rồi… đi ngủ thôi!');
  ctx.hint.arm(() => {
    const open = JOBS.find((j) => !done.has(j));
    if (open) env.say(NUDGES[open]);
    const target = open === 'light' ? lamp : open === 'lullaby' ? moon : open === 'blanket' ? bedEl : toys.find((t) => !t.classList.contains('gone')) ?? basket;
    replay(target, 'anim-wiggle');
  });
};
