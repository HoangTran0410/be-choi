import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { MAX_ALIVE, makeBubble, popPitch, SPAWN_MS, starEvery } from './logic';
import './style.css';

interface Live {
  el: HTMLElement;
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
  popped: boolean;
}

/**
 * Bubble pop: bubbles drift up, tapping pops them. Pure cause-and-effect,
 * no rounds, a star every 15 pops. Reference implementation for tap games.
 */
function start(ctx: GameContext): void {
  const field = h('div', { class: 'bubbles' });
  ctx.stage.append(field);

  const live: Live[] = [];
  let pops = 0;
  let raf = 0;
  let last = performance.now();

  function scale(): number {
    const min = Math.min(field.clientWidth || 400, field.clientHeight || 600);
    return Math.min(1.8, Math.max(0.9, min / 600));
  }

  /** `initial` bubbles start inside the stage so the screen is never empty on open. */
  function spawn(initial = false): void {
    if (live.filter((b) => !b.popped).length >= MAX_ALIVE) return;
    const spec = makeBubble();
    const size = Math.max(88, Math.round(spec.size * scale()));
    const w = field.clientWidth || 400;
    const el = h('div', {
      class: 'bubble',
      style: `width:${size}px;height:${size}px;--hue:${spec.hue}`,
    });
    if (spec.item) el.append(h('span', { class: 'bubble-item' }, spec.item.emoji));
    const bubble: Live = {
      el,
      x: spec.x * Math.max(0, w - size),
      y: initial ? (field.clientHeight || 600) * (0.2 + Math.random() * 0.7) : (field.clientHeight || 600) + size,
      size,
      speed: spec.speed * scale(),
      phase: Math.random() * Math.PI * 2,
      popped: false,
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pop(bubble, spec.item?.name ?? null, spec.size);
    });
    field.append(el);
    live.push(bubble);
  }

  function pop(b: Live, name: string | null, baseSize: number): void {
    if (b.popped) return;
    b.popped = true;
    replay(b.el, 'anim-pop');
    ctx.audio.pop(popPitch(baseSize));
    navigator.vibrate?.(10);
    if (name) ctx.speak(name);
    setTimeout(() => remove(b), 300);
    pops++;
    if (pops % starEvery() === 0) {
      ctx.addStar();
      ctx.audio.jingle();
      const star = h('div', { class: 'bubble-star anim-pop', style: `left:${b.x + b.size / 2}px;top:${b.y + b.size / 2}px` }, '⭐');
      field.append(star);
      setTimeout(() => star.remove(), 700);
    }
  }

  function remove(b: Live): void {
    b.el.remove();
    const i = live.indexOf(b);
    if (i >= 0) live.splice(i, 1);
  }

  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const b of [...live]) {
      if (b.popped) continue;
      b.y -= b.speed * dt;
      const sway = Math.sin(now / 900 + b.phase) * 18;
      b.el.style.transform = `translate(${b.x + sway}px, ${b.y}px)`;
      if (b.y < -b.size) remove(b);
    }
    raf = requestAnimationFrame(frame);
  }

  spawn(true);
  spawn(true);
  spawn(true);
  const timer = setInterval(spawn, SPAWN_MS);
  raf = requestAnimationFrame(frame);

  ctx.onCleanup(() => {
    clearInterval(timer);
    cancelAnimationFrame(raf);
  });
}

const game: GameModule = { ...meta, start };
export default game;
