import { h, replay } from '../../core/dom';
import { createMic } from '../../core/mic';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { BIRD_X, makeWorld, NOTES_PER_ROUND, roundDone, step, type Item } from './logic';
import './style.css';

/** Lift a held finger gives, for a child playing with no microphone. */
const TOUCH_LEVEL = 0.6;
const SPARK_MS = 700;
const MAX_STEP_MS = 50;

/**
 * Sing and the bird climbs; go quiet and it glides down. Notes and cloud rings
 * drift in from the right at about the height the bird is flying, so even a
 * two-year-old holding one loud "aaaa" flies through something. Nothing is ever
 * lost: the grass just bounces the bird back up. Eight notes make a star.
 */
function start(ctx: GameContext): void {
  const mic = createMic();
  let alive = true;
  let level = 0;
  let micLevel = 0;
  let holding = false;

  const root = h('div', { class: 'birdsong' });
  const world = h('div', { class: 'bird-world' });
  const bird = h('span', { class: 'bird-bird' }, '🐦');
  const ground = h('div', { class: 'bird-ground' });
  const score = h('div', { class: 'bird-score' }, ...Array.from({ length: NOTES_PER_ROUND }, () => h('span', { class: 'bird-slot' }, '🎵')));
  const micBtn = h('button', { class: 'btn-round bird-mic', type: 'button', 'aria-label': 'Bật micro' }, '🎤');
  root.append(h('span', { class: 'bird-sun' }, '☀️'), world, bird, ground, score, micBtn);
  ctx.stage.append(root);

  const slots = [...score.querySelectorAll<HTMLElement>('.bird-slot')];
  const state = makeWorld();
  const itemEls = new Map<number, HTMLElement>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function after(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  function place(el: HTMLElement, item: Item): void {
    el.style.left = `${((item.x - state.distance) * 100).toFixed(2)}%`;
    el.style.top = `${(item.y * 100).toFixed(2)}%`;
  }

  function draw(): void {
    bird.style.top = `${(state.y * 100).toFixed(2)}%`;
    bird.style.setProperty('--bird-tilt', `${Math.max(-25, Math.min(25, state.vy * 40)).toFixed(1)}deg`);
    const seen = new Set<number>();
    for (const item of state.items) {
      seen.add(item.id);
      let el = itemEls.get(item.id);
      if (!el) {
        el = h('span', { class: `bird-item bird-${item.kind}` }, item.kind === 'note' ? '🎵' : '☁️');
        itemEls.set(item.id, el);
        world.append(el);
      }
      place(el, item);
    }
    for (const [id, el] of itemEls) {
      if (!seen.has(id)) {
        el.remove();
        itemEls.delete(id);
      }
    }
  }

  function showScore(): void {
    slots.forEach((slot, i) => slot.classList.toggle('bird-got', i < state.caught));
  }

  function spark(item: Item): void {
    const el = h('span', { class: 'bird-spark', style: `left:${(BIRD_X * 100).toFixed(0)}%;top:${(item.y * 100).toFixed(0)}%` }, '✨');
    root.append(el);
    after(SPARK_MS, () => el.remove());
  }

  async function finishRound(): Promise<void> {
    await ctx.celebrate();
    if (!alive) return;
    ctx.addStar();
    state.caught = 0;
    showScore();
  }

  function frame(dt: number): void {
    level = Math.max(micLevel, holding ? TOUCH_LEVEL : 0);
    const out = step(state, level, dt);
    for (const item of out.caught) {
      const el = itemEls.get(item.id);
      el?.remove();
      itemEls.delete(item.id);
      spark(item);
      if (item.kind === 'note') {
        ctx.audio.pop(1.4);
        replay(bird, 'anim-bounce');
      } else {
        ctx.audio.ding();
      }
    }
    if (out.caught.some((i) => i.kind === 'note')) {
      showScore();
      ctx.hint.touch();
      if (roundDone(state)) void finishRound();
    }
    if (out.bumped) ctx.audio.boing();
    root.classList.toggle('bird-singing', level > 0.2);
    draw();
  }

  let raf = 0;
  let last = 0;
  function loop(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(MAX_STEP_MS, now - last) / 1000 : 0.016;
    last = now;
    frame(dt);
  }

  // ---- the child ----
  async function onMic(): Promise<void> {
    ctx.hint.touch();
    ctx.audio.tick();
    if (mic.listening) return;
    micBtn.classList.add('bird-waiting');
    const ok = await mic.start();
    micBtn.classList.remove('bird-waiting');
    if (!alive) {
      mic.stop();
      return;
    }
    if (!ok) {
      micBtn.hidden = true;
      ctx.speak('Giữ tay lên màn hình để chim bay nhé');
      return;
    }
    micBtn.classList.add('bird-on');
    mic.onFrame((f) => {
      micLevel = f.level;
    });
    ctx.speak('Hát to lên cho chim bay nào!');
  }

  root.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('.bird-mic')) return;
    e.preventDefault();
    holding = true;
    ctx.hint.touch();
  });
  root.addEventListener('pointerup', () => {
    holding = false;
  });
  root.addEventListener('pointercancel', () => {
    holding = false;
  });
  root.addEventListener('pointerleave', () => {
    holding = false;
  });
  micBtn.addEventListener('pointerup', () => void onMic());

  ctx.hint.arm(() => {
    replay(micBtn.hidden ? bird : micBtn, 'anim-wiggle');
  });

  showScore();
  draw();
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);

  ctx.onCleanup(() => {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    mic.stop();
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });
}

const game: GameModule = { ...meta, start };
export default game;
