import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { blobPixels, CLEAN_DONE, cleanRatio, dirtColor, makeWashRound, type WashRound } from './logic';
import './style.css';

/** Minimum gap between two scrub ticks. */
const TICK_MS = 120;
/** How often the dirt is measured while rubbing. */
const CHECK_MS = 300;
/** A soap bubble every n-th move. */
const SUDS_EVERY = 6;
const SUDS_MS = 800;
const SPARKLE_MS = 900;
const SPARKLE_STAGGER_MS = 70;
/** How long the hint sponge stays on the subject. */
const HINT_SHOW_MS = 1100;
/** Where the ✨ appear on the subject, in percent of its box. */
const SPARKLES = [
  { x: 50, y: 50 },
  { x: 24, y: 28 },
  { x: 76, y: 30 },
  { x: 30, y: 74 },
  { x: 72, y: 72 },
];

/**
 * Wash: rub the dirt off an animal or vehicle. The dirt is a canvas overlay
 * erased with `destination-out`; the round ends once 90 % of it is gone.
 */
function start(ctx: GameContext): void {
  const wrap = h('div', { class: 'wash' });
  const subject = h('div', { class: 'wash-subject' });
  const emoji = h('span', { class: 'wash-item' });
  const canvas = h('canvas', { class: 'wash-dirt' });
  const sponge = h('div', { class: 'wash-sponge', hidden: true }, '🧽');
  subject.append(emoji, canvas);
  wrap.append(subject, sponge);
  ctx.stage.append(wrap);

  let round: WashRound | null = null;
  let done = false;
  let disposed = false;
  /** The canvas bitmap matches a laid-out subject box and holds the dirt. */
  let ready = false;
  let moves = 0;
  let lastTick = 0;
  let lastCheck = 0;
  const pressed = new Set<number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let c2d: CanvasRenderingContext2D | null = null;
  let c2dTried = false;

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  /** jsdom has no 2d context: ask once, and every caller guards the null. */
  function ctx2d(): CanvasRenderingContext2D | null {
    if (!c2dTried) {
      c2dTried = true;
      c2d = canvas.getContext('2d', { willReadFrequently: true });
    }
    return c2d;
  }

  /** Client coords → coords inside the wrapper. */
  function local(cx: number, cy: number): { x: number; y: number } {
    const r = wrap.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  }

  function drawDirt(): void {
    const c = ctx2d();
    if (!c || !round || !ready) return;
    const { width, height } = canvas;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, width, height);
    for (const b of round.blobs) {
      const { cx, cy, r } = blobPixels(b, width, height);
      const g = c.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
      g.addColorStop(0, dirtColor(0.9));
      g.addColorStop(1, dirtColor(0));
      c.fillStyle = g;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** Match the bitmap to the subject box (DPR-scaled); redraw the dirt when it changed. */
  function fit(force = false): void {
    const rect = subject.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(rect.width * dpr);
    const hgt = Math.round(rect.height * dpr);
    if (w < 1 || hgt < 1) {
      ready = false;
      return;
    }
    const changed = w !== canvas.width || hgt !== canvas.height;
    if (!changed && !force && ready) return;
    canvas.width = w;
    canvas.height = hgt;
    ready = true;
    drawDirt();
  }

  /** Erase a soft circle under the sponge. */
  function scrub(cx: number, cy: number): void {
    const c = ctx2d();
    if (!c || !ready) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const sx = canvas.width / rect.width;
    const x = (cx - rect.left) * sx;
    const y = (cy - rect.top) * (canvas.height / rect.height);
    const r = (sponge.offsetWidth || 64) * 0.45 * sx;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    const g = c.createRadialGradient(x, y, r * 0.7, x, y, r);
    g.addColorStop(0, 'rgba(0, 0, 0, 1)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function check(): void {
    const c = ctx2d();
    if (!c || !ready || done) return;
    const { width, height } = canvas;
    if (width < 1 || height < 1) return;
    const ratio = cleanRatio(c.getImageData(0, 0, width, height).data, 4);
    if (ratio >= CLEAN_DONE) void finish(c);
  }

  function sparkle(): void {
    SPARKLES.forEach((s, i) => {
      const delay = i * SPARKLE_STAGGER_MS;
      const el = h('div', { class: 'wash-sparkle', style: `left:${s.x}%;top:${s.y}%;animation-delay:${delay}ms` }, '✨');
      subject.append(el);
      later(() => el.remove(), SPARKLE_MS + delay);
    });
  }

  function suds(cx: number, cy: number): void {
    const p = local(cx, cy);
    const size = (0.25 + Math.random() * 0.2).toFixed(2);
    const drift = Math.round((Math.random() - 0.5) * 40);
    const el = h('div', {
      class: 'wash-suds',
      style: `left:${p.x}px;top:${p.y}px;--wash-suds:${size};--wash-drift:${drift}px`,
    });
    wrap.append(el);
    later(() => el.remove(), SUDS_MS);
  }

  function showSponge(x: number, y: number): void {
    sponge.style.left = `${x}px`;
    sponge.style.top = `${y}px`;
    sponge.hidden = false;
  }

  async function finish(c: CanvasRenderingContext2D): Promise<void> {
    done = true;
    pressed.clear();
    sponge.hidden = true;
    c.clearRect(0, 0, canvas.width, canvas.height);
    sparkle();
    replay(emoji, 'anim-bounce');
    ctx.audio.ding();
    navigator.vibrate?.(15);
    ctx.speak('Sạch rồi!');
    ctx.hint.clear();
    await ctx.celebrate();
    ctx.addStar();
    if (disposed) return;
    play(round?.item.emoji);
  }

  function armHint(): void {
    ctx.hint.arm(() => {
      if (done || pressed.size > 0) return;
      const s = subject.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      showSponge(s.left - w.left + s.width / 2, s.top - w.top + s.height / 2);
      replay(sponge, 'anim-wiggle');
      later(() => {
        if (pressed.size === 0) sponge.hidden = true;
      }, HINT_SHOW_MS);
    });
  }

  function play(exclude?: string): void {
    round = makeWashRound(Math.random, exclude);
    done = false;
    moves = 0;
    lastCheck = Date.now();
    emoji.textContent = round.item.emoji;
    replay(emoji, 'anim-bounce');
    fit(true);
    ctx.speak(`${round.item.name} bị bẩn rồi`);
    armHint();
  }

  wrap.addEventListener('pointerdown', (e) => {
    if (done) return;
    e.preventDefault();
    pressed.add(e.pointerId);
    ctx.hint.touch();
    if (!ready) fit();
    const p = local(e.clientX, e.clientY);
    showSponge(p.x, p.y);
    scrub(e.clientX, e.clientY);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (done || !pressed.has(e.pointerId)) return;
    const p = local(e.clientX, e.clientY);
    showSponge(p.x, p.y);
    scrub(e.clientX, e.clientY);
    moves++;
    const now = Date.now();
    if (now - lastTick >= TICK_MS) {
      lastTick = now;
      ctx.audio.tick();
    }
    if (moves % SUDS_EVERY === 0) suds(e.clientX, e.clientY);
    if (now - lastCheck >= CHECK_MS) {
      lastCheck = now;
      check();
    }
  });
  const release = (e: PointerEvent): void => {
    if (!pressed.delete(e.pointerId)) return;
    if (pressed.size === 0) {
      sponge.hidden = true;
      check();
    }
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // Layout may settle after the first paint (fonts, safe areas): fit once more.
  const raf = requestAnimationFrame(() => fit());
  const onResize = (): void => fit();
  window.addEventListener('resize', onResize);

  ctx.onCleanup(() => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pointerup', release);
    window.removeEventListener('pointercancel', release);
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });

  play();
}

const game: GameModule = { ...meta, start };
export default game;
