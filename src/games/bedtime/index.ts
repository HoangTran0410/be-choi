import { createChecklist } from '../../core/chores';
import { h, replay } from '../../core/dom';
import { findSong, noteFreq, schedule, SONGS } from '../../core/music';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { CHEERS, JOBS, JOB_ICON, LULLABY_BPM, LULLABY_NOTES, NUDGES, UNDOS, makeNight, type Job, type Night } from './logic';
import './style.css';

/** How long a toy takes to fly into the box. */
const TOY_FLY_MS = 500;
/** Breath between the last toy landing and the tick going green. */
const STEP_MS = 700;
const NEXT_NIGHT_MS = 2200;
const ZZZ_MS = 1600;
/** "Ngôi sao lấp lánh", the only song that belongs at bedtime. */
const LULLABY = findSong('twinkle') ?? SONGS[0];

/**
 * Giờ đi ngủ: the four things that happen before bed — put the toys away, turn
 * the lamp off, pull the blanket up, and ask the moon for a song.
 *
 * Nothing here waits its turn. A two-year-old presses whatever catches their
 * eye, so every object works the moment it is touched, the lamp and the blanket
 * go back and forth as often as they like, and the friend only falls asleep once
 * all four ticks along the top have turned green — in whatever order they got there.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let round = 0;
  const chores = createChecklist(JOBS);
  /** True from the moment the friend drops off until the next night begins. */
  let asleep = false;
  let night: Night | null = null;
  let left = 0;
  let cancelSong: (() => void) | null = null;
  /** Jobs already asked for out loud tonight, so the hint does not repeat itself. */
  const nudged = new Set<Job>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const friend = h('div', { class: 'bedtime-friend' });
  const zzz = h('span', { class: 'bedtime-zzz' }, '💤');
  const blanket = h('button', { class: 'bedtime-blanket', type: 'button', 'aria-label': 'đắp chăn' });
  const bed = h(
    'div',
    { class: 'bedtime-bed' },
    h('div', { class: 'bedtime-head' }),
    h('div', { class: 'bedtime-pillow' }),
    friend,
    zzz,
    blanket,
  );
  const lamp = h('button', { class: 'bedtime-lamp', type: 'button', 'aria-label': 'tắt đèn' }, '💡');
  const moon = h('button', { class: 'bedtime-moon', type: 'button', 'aria-label': 'hát ru' }, '🌙');
  const sky = h('div', { class: 'bedtime-sky' }, moon);
  const window_ = h('div', { class: 'bedtime-window' }, sky);
  const box = h('div', { class: 'bedtime-box' }, h('span', { class: 'bedtime-box-lid' }, '🧺'));
  const floor = h('div', { class: 'bedtime-floor' });
  /** One tick per job, so the child can see what is left without being told. */
  const ticks = new Map<Job, HTMLElement>();
  for (const job of JOBS) {
    ticks.set(job, h('div', { class: 'bedtime-tick', 'data-job': job }, JOB_ICON[job]));
  }
  const todo = h('div', { class: 'bedtime-todo' }, ...ticks.values());
  const room = h('div', { class: 'bedtime-room' }, window_, lamp, bed, box, floor, todo);
  const wrap = h('div', { class: 'bedtime' }, room);
  ctx.stage.append(wrap);

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
  }

  // ---- the jobs, none of which waits for another ----

  /** Wiggle something still to do, so a stuck child has somewhere to look. */
  function armHint(): void {
    ctx.hint.arm(() => {
      const waiting = chores.left();
      const job = waiting[Math.floor(Math.random() * waiting.length)];
      if (!job) return;
      const tick = ticks.get(job);
      if (tick) replay(tick, 'anim-wiggle');
      if (job === 'toys') {
        const toy = floor.querySelector('.bedtime-toy:not(.away)');
        if (toy) replay(toy, 'anim-wiggle');
      } else if (job === 'light') replay(lamp, 'anim-wiggle');
      else if (job === 'blanket') replay(blanket, 'anim-wiggle');
      else replay(moon, 'anim-wiggle');
      // Asking out loud once per job is a reminder; asking every six seconds is nagging.
      if (nudged.has(job)) return;
      nudged.add(job);
      ctx.speak(NUDGES[job]);
    });
  }

  /**
   * Mark a job done or undone. Says so out loud, ticks it off, and puts the
   * friend to sleep when this was the last one outstanding.
   */
  function setJob(job: Job, done: boolean): void {
    if (!chores.set(job, done)) return;
    const tick = ticks.get(job);
    tick?.classList.toggle('done', done);
    if (tick && done) replay(tick, 'anim-bounce');
    const line = done ? CHEERS[job] : UNDOS[job];
    if (line) ctx.speak(line);
    if (done && chores.allDone()) void sleep();
    else armHint();
  }

  function tidy(toy: HTMLElement): void {
    if (asleep || toy.classList.contains('away')) return;
    toy.classList.add('away');
    // Fly to the basket: the box is in the bottom corner, so aim there.
    const from = toy.getBoundingClientRect();
    const to = box.getBoundingClientRect();
    toy.style.setProperty('--dx', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    toy.style.setProperty('--dy', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    ctx.audio.pop();
    navigator.vibrate?.(10);
    left--;
    later(() => {
      toy.remove();
      replay(box, 'anim-bounce');
      ctx.audio.tick();
      if (left === 0) later(() => setJob('toys', true), STEP_MS);
    }, TOY_FLY_MS);
  }

  lamp.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    replay(lamp, 'anim-bounce');
    if (asleep) return;
    // A switch, not a step: off, on, off again is a game in itself at this age.
    const off = !chores.done('light');
    wrap.classList.toggle('dark', off);
    ctx.audio.tick();
    ctx.audio.pop(off ? 0.6 : 1.4);
    setJob('light', off);
  });

  blanket.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    if (asleep) return;
    const tucked = !chores.done('blanket');
    blanket.classList.toggle('tucked', tucked);
    if (tucked) ctx.audio.puff();
    else ctx.audio.pop(0.8);
    navigator.vibrate?.(12);
    setJob('blanket', tucked);
  });

  function twinkle(): void {
    const star = h(
      'span',
      {
        class: 'bedtime-star',
        style: `left:${8 + Math.random() * 84}%;top:${6 + Math.random() * 62}%`,
      },
      Math.random() < 0.3 ? '✨' : '⭐',
    );
    sky.append(star);
    later(() => star.remove(), 1600);
  }

  function stopSong(): void {
    cancelSong?.();
    cancelSong = null;
  }

  moon.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    replay(moon, 'anim-bounce');
    // Singing again is always allowed; only a song already in the air is not interrupted.
    if (asleep || cancelSong) return;
    const notes = (LULLABY?.notes ?? []).slice(0, LULLABY_NOTES);
    if (notes.length === 0) {
      setJob('lullaby', true);
      return;
    }
    ctx.speak(LULLABY?.title ?? '');
    cancelSong = schedule(
      notes,
      LULLABY_BPM,
      (_i, n, ms) => {
        if (n.n === 'R') return;
        ctx.audio.note(noteFreq(n.n), (ms / 1000) * 1.1, 'bell');
        twinkle();
      },
      () => {
        cancelSong = null;
        later(() => setJob('lullaby', true), ZZZ_MS * 0.4);
      },
    );
  });

  // ---- lights out ----

  async function sleep(): Promise<void> {
    asleep = true;
    stopSong();
    friend.classList.add('asleep');
    zzz.classList.add('showing');
    ctx.speak('Ngủ ngon nhé!');
    ctx.hint.clear();
    await ctx.celebrate();
    if (!alive) return;
    ctx.addStar();
    later(() => {
      round++;
      play(night?.friend.emoji);
    }, NEXT_NIGHT_MS);
  }

  // ---- a night ----

  function play(exclude?: string): void {
    if (!alive) return;
    stopSong();
    chores.reset();
    asleep = false;
    nudged.clear();
    night = makeNight(round, Math.random, exclude);
    left = night.toys.length;
    friend.textContent = night.friend.emoji;
    friend.classList.remove('asleep');
    zzz.classList.remove('showing');
    blanket.classList.remove('tucked');
    wrap.classList.remove('dark');
    for (const tick of ticks.values()) tick.classList.remove('done');
    for (const star of sky.querySelectorAll('.bedtime-star')) star.remove();
    floor.replaceChildren(
      ...night.toys.map((toy) => {
        const el = h(
          'button',
          {
            class: 'bedtime-toy',
            type: 'button',
            'data-toy': toy.emoji,
            'aria-label': 'cất đồ chơi',
            style: `left:${toy.x.toFixed(1)}%;top:${toy.y.toFixed(1)}%`,
          },
          toy.emoji,
        );
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          ctx.hint.touch();
          tidy(el);
        });
        return el;
      }),
    );
    ctx.speak(`Tới giờ ngủ của ${night.friend.name} rồi!`);
    armHint();
  }

  ctx.onCleanup(() => {
    alive = false;
    stopSong();
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });

  play();
}

const game: GameModule = { ...meta, start };
export default game;
