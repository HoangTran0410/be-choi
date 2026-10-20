import { h, replay } from '../../../core/dom';
import { onFrame } from '../../../core/frame';
import { BIRD_X, makeWorld, NOTES_PER_ROUND, roundDone, step, type Item } from '../../birdsong/logic';
import { createTracker, type ShowTracker } from '../show';
import type { VoiceFrame } from '../voice';
import { makeRing, stepRing } from './ring';
import type { Env, Mode } from './types';

const MAX_STEP_MS = 50;
const SPARK_MS = 700;
/** A show never drags on: after this long the bird lands and the curtain falls. */
const MAX_SHOW_S = 100;

/**
 * "Chim bay": sing and the bird climbs; go quiet and it glides down (the old
 * singing-bird game). New: a glowing ring drifts to a new height now and then, and
 * one steady note that keeps the bird inside it fills a meter and earns a bonus
 * ticket. With no microphone, a finger on the sky does the lifting.
 */
export function createBirdMode(env: Env, panel: HTMLElement): Mode {
  const timers = env.timers();
  const world = h('div', { class: 'sa-world' });
  const ringEl = h('div', { class: 'sa-ring' }, h('span', { class: 'sa-ring-fill' }));
  const bird = h('span', { class: 'sa-bird' }, '🐦');
  const sky = h('div', { class: 'sa-sky' }, h('span', { class: 'sa-sun' }, '☀️'), world, ringEl, bird, h('div', { class: 'sa-ground' }));
  const slots = Array.from({ length: NOTES_PER_ROUND }, () => h('span', { class: 'sa-slot' }, '🎵'));
  const score = h('div', { class: 'sa-score', 'aria-hidden': 'true' }, ...slots);
  panel.append(sky, score);

  let state = makeWorld();
  let ring = makeRing();
  let tracker: ShowTracker | null = null;
  let level = 0;
  let elapsed = 0;
  let ending = false;
  let stopLoop: (() => void) | null = null;
  const els = new Map<number, HTMLElement>();

  function resetWorld(): void {
    state = makeWorld();
    ring = makeRing();
    tracker = createTracker();
    elapsed = 0;
    ending = false;
    for (const el of els.values()) el.remove();
    els.clear();
    slots.forEach((s) => s.classList.remove('sa-got'));
    ringEl.classList.remove('sa-ring-in');
    ringEl.style.setProperty('--fill', '0');
  }

  function place(el: HTMLElement, item: Item): void {
    el.style.left = `${((item.x - state.distance) * 100).toFixed(2)}%`;
    el.style.top = `${(item.y * 100).toFixed(2)}%`;
  }

  function draw(): void {
    bird.style.top = `${(state.y * 100).toFixed(2)}%`;
    bird.style.setProperty('--tilt', `${Math.max(-25, Math.min(25, state.vy * 40)).toFixed(1)}deg`);
    ringEl.style.top = `${(ring.y * 100).toFixed(2)}%`;
    ringEl.style.height = `${(ring.r * 200).toFixed(1)}%`;
    ringEl.style.setProperty('--fill', Math.min(1, ring.held / ring.goal).toFixed(2));
    const seen = new Set<number>();
    for (const item of state.items) {
      seen.add(item.id);
      let el = els.get(item.id);
      if (!el) {
        el = h('span', { class: `sa-item sa-it-${item.kind}` }, item.kind === 'note' ? '🎵' : '☁️');
        els.set(item.id, el);
        world.append(el);
      }
      place(el, item);
    }
    for (const [id, el] of els) {
      if (!seen.has(id)) {
        el.remove();
        els.delete(id);
      }
    }
  }

  function spark(item: Item): void {
    const el = h('span', { class: 'sa-bird-spark', style: `left:${(BIRD_X * 100).toFixed(0)}%;top:${(item.y * 100).toFixed(0)}%` }, '✨');
    sky.append(el);
    timers.after(SPARK_MS, () => el.remove());
  }

  async function endShow(): Promise<void> {
    if (ending) return;
    ending = true;
    const stats = tracker?.stats();
    tracker = null;
    stopLoop?.();
    stopLoop = null;
    if (!stats || !env.alive()) return;
    await env.finish(stats);
    if (!env.alive()) return;
    resetWorld();
    draw();
    env.say('Bay tiếp nào!');
    startLoop();
  }

  function tick(dtMs: number): void {
    const dt = Math.min(MAX_STEP_MS, dtMs || 16) / 1000;
    elapsed += dt;
    const out = step(state, level, dt);
    for (const item of out.caught) {
      els.get(item.id)?.remove();
      els.delete(item.id);
      spark(item);
      if (item.kind === 'note') {
        env.ctx.audio.pop(1.4);
        replay(bird, 'anim-bounce');
      } else {
        env.ctx.audio.ding();
      }
    }
    if (out.caught.some((i) => i.kind === 'note')) {
      slots.forEach((s, i) => s.classList.toggle('sa-got', i < state.caught));
      env.touch();
    }
    if (out.bumped) env.ctx.audio.boing();
    const r = stepRing(ring, state.y, dt);
    ringEl.classList.toggle('sa-ring-in', r.inside);
    if (r.completed) {
      tracker?.addBonus();
      env.ctx.audio.ding();
      env.stage.burst('sparkle');
      env.audience.cheer(1000);
      env.say('Giữ giỏi quá! Chim vào vòng sáng rồi.', { quiet: true });
    }
    draw();
    if (roundDone(state) || elapsed >= MAX_SHOW_S) void endShow();
  }

  function startLoop(): void {
    stopLoop?.();
    stopLoop = onFrame((_now, dt) => {
      tick(dt);
    });
  }

  function lift(down: boolean, e: Event): void {
    e.preventDefault();
    if (down) {
      env.voice.press();
      env.touch();
    } else env.voice.release();
  }
  sky.addEventListener('pointerdown', (e) => lift(true, e));
  sky.addEventListener('pointerup', (e) => lift(false, e));
  sky.addEventListener('pointercancel', (e) => lift(false, e));
  sky.addEventListener('pointerleave', (e) => lift(false, e));

  return {
    enter() {
      resetWorld();
      draw();
      env.say(env.voice.micOn ? 'Hát to lên, chim sẽ bay lên cao. Hát đều, chim vào vòng sáng.' : 'Giữ tay lên bầu trời, chim sẽ bay lên.', { speak: true });
      startLoop();
    },
    leave() {
      stopLoop?.();
      stopLoop = null;
      timers.clear();
      env.voice.release();
      tracker = null;
      level = 0;
    },
    frame(f: VoiceFrame) {
      level = f.level;
      tracker?.feed({ active: f.active, onset: f.onset, band: f.band }, 33);
    },
    nudge() {
      replay(bird, 'anim-wiggle');
      env.say('Giữ tay lên bầu trời, chim sẽ bay lên.', { speak: true });
    },
  };
}
