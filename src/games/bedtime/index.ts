import { h, replay } from '../../core/dom';
import { findSong, noteFreq, schedule, SONGS } from '../../core/music';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  LULLABY_BPM,
  LULLABY_NOTES,
  PROMPTS,
  makeNight,
  nextPhase,
  type Night,
  type Phase,
  type PhaseEvent,
} from './logic';
import './style.css';

/** How long a toy takes to fly into the box. */
const TOY_FLY_MS = 500;
/** Breath between the last toy landing and the lamp being asked for. */
const STEP_MS = 700;
const NEXT_NIGHT_MS = 2200;
const ZZZ_MS = 1600;
/** "Ngôi sao lấp lánh", the only song that belongs at bedtime. */
const LULLABY = findSong('twinkle') ?? SONGS[0];

/**
 * Giờ đi ngủ: the four things that happen before bed, in order — put the toys
 * away, turn the lamp off, pull the blanket up, then ask the moon for a song.
 *
 * It is the quiet game of the set: the room dims as it goes, the last step is a
 * lullaby on bells with the stars coming out, and it ends with a sleeping friend.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let round = 0;
  let phase: Phase = 'toys';
  let night: Night | null = null;
  let left = 0;
  let cancelSong: (() => void) | null = null;
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
  const room = h('div', { class: 'bedtime-room' }, window_, lamp, bed, box, floor);
  const wrap = h('div', { class: 'bedtime' }, room);
  ctx.stage.append(wrap);

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
  }

  // ---- phases ----

  function armHint(): void {
    if (phase === 'done') {
      ctx.hint.clear();
      return;
    }
    ctx.hint.arm(() => {
      if (phase === 'toys') {
        const toy = floor.querySelector('.bedtime-toy:not(.away)');
        if (toy) replay(toy, 'anim-wiggle');
      } else if (phase === 'light') replay(lamp, 'anim-wiggle');
      else if (phase === 'blanket') replay(blanket, 'anim-wiggle');
      else if (phase === 'lullaby') replay(moon, 'anim-wiggle');
    });
  }

  function enter(next: Phase): void {
    phase = next;
    wrap.dataset.phase = next;
    if (next !== 'done') ctx.speak(PROMPTS[next]);
    armHint();
  }

  function transition(event: PhaseEvent): void {
    const next = nextPhase(phase, event);
    if (next !== phase) enter(next);
  }

  // ---- the jobs ----

  function tidy(toy: HTMLElement): void {
    if (phase !== 'toys' || toy.classList.contains('away')) return;
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
      if (left === 0) later(() => transition('tidy'), STEP_MS);
    }, TOY_FLY_MS);
  }

  lamp.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    replay(lamp, 'anim-bounce');
    if (phase !== 'light') return;
    wrap.classList.add('dark');
    ctx.audio.tick();
    ctx.audio.pop(0.6);
    transition('dark');
  });

  blanket.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    if (phase !== 'blanket') {
      replay(blanket, 'anim-wiggle');
      return;
    }
    blanket.classList.add('tucked');
    ctx.audio.puff();
    navigator.vibrate?.(12);
    transition('tucked');
  });

  function twinkle(): void {
    const star = h('span', {
      class: 'bedtime-star',
      style: `left:${8 + Math.random() * 84}%;top:${6 + Math.random() * 62}%`,
    }, Math.random() < 0.3 ? '✨' : '⭐');
    sky.append(star);
    later(() => star.remove(), 1600);
  }

  function stopSong(): void {
    cancelSong?.();
    cancelSong = null;
  }

  async function slept(): Promise<void> {
    transition('sung');
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

  moon.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    replay(moon, 'anim-bounce');
    if (phase !== 'lullaby' || cancelSong) return;
    ctx.hint.clear();
    const notes = (LULLABY?.notes ?? []).slice(0, LULLABY_NOTES);
    if (notes.length === 0) {
      void slept();
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
        later(() => void slept(), ZZZ_MS * 0.4);
      },
    );
  });

  // ---- a night ----

  function play(exclude?: string): void {
    if (!alive) return;
    stopSong();
    night = makeNight(round, Math.random, exclude);
    left = night.toys.length;
    friend.textContent = night.friend.emoji;
    friend.classList.remove('asleep');
    zzz.classList.remove('showing');
    blanket.classList.remove('tucked');
    wrap.classList.remove('dark');
    for (const star of sky.querySelectorAll('.bedtime-star')) star.remove();
    floor.replaceChildren(
      ...night.toys.map((toy) => {
        const el = h('button', {
          class: 'bedtime-toy',
          type: 'button',
          'data-toy': toy.emoji,
          'aria-label': 'cất đồ chơi',
          style: `left:${toy.x.toFixed(1)}%;top:${toy.y.toFixed(1)}%`,
        }, toy.emoji);
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          ctx.hint.touch();
          tidy(el);
        });
        return el;
      }),
    );
    // Introduce tonight's friend, then the first job.
    ctx.speak(`Tới giờ ngủ của ${night.friend.name} rồi!`);
    enter('toys');
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
