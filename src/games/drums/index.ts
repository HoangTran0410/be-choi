import type { DrumKind } from '../../core/audio';
import { h } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { BEAT_STEPS, beatAt, PADS, STAR_EVERY, stepMs, type Pad } from './logic';
import './style.css';

const HIT_MS = 120;
const LIT_MS = 100;
const BURST_MS = 500;
const STAR_MS = 700;
const SPEAK_GAP_MS = 2000;

/**
 * Drum kit: six coloured pads, each a synthesized percussion sound. Every tap
 * plays the pad, squashes it and floats its emoji up. A play-along button
 * loops one bar of kick / snare / hi-hat and lights the pads as they sound so
 * the child can drum along. Multi-touch, no rounds, a star every 40 taps.
 */
function start(ctx: GameContext): void {
  const root = h('div', { class: 'drums' });
  const grid = h('div', { class: 'drums-pads' });
  const padEls = new Map<DrumKind, HTMLButtonElement>();
  for (const pad of PADS) {
    const el = h(
      'button',
      {
        class: 'drums-pad',
        type: 'button',
        'data-kind': pad.kind,
        'aria-label': pad.name,
        style: `--drums-color:${pad.color}`,
      },
      h('span', { class: 'drums-emoji' }, pad.emoji),
    );
    padEls.set(pad.kind, el);
    grid.append(el);
  }
  const beatBtn = h('button', { class: 'drums-beat btn-round', type: 'button', 'aria-label': 'Gõ theo nhịp', 'aria-pressed': 'false' }, '▶');
  root.append(grid, beatBtn);
  ctx.stage.append(root);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** One pending "remove class" timer per pad and class, so rapid hits do not flicker. */
  const flashes = new Map<string, ReturnType<typeof setTimeout>>();
  const lastSpoken = new Map<DrumKind, number>();
  let hits = 0;
  let beatTimer: ReturnType<typeof setInterval> | null = null;
  let step = -1;

  function after(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  /** Add `cls` to a pad and remove it `ms` later; a repeat within that window restarts the timer. */
  function flash(kind: DrumKind, cls: string, ms: number): void {
    const el = padEls.get(kind);
    if (!el) return;
    const key = `${kind}:${cls}`;
    const pending = flashes.get(key);
    if (pending !== undefined) {
      clearTimeout(pending);
      timers.delete(pending);
    }
    el.classList.add(cls);
    const t = setTimeout(() => {
      timers.delete(t);
      flashes.delete(key);
      el.classList.remove(cls);
    }, ms);
    timers.add(t);
    flashes.set(key, t);
  }

  interface Point {
    x: number;
    y: number;
  }

  /** Centre of a pad, in `root` coordinates. */
  function centreOf(el: HTMLElement): Point {
    const rootRect = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - rootRect.left + r.width / 2, y: r.top - rootRect.top + r.height / 2 };
  }

  /** The touch point in `root` coordinates, or the pad centre when the event carries none. */
  function pointOn(el: HTMLElement, x: number, y: number): Point {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return centreOf(el);
    const rootRect = root.getBoundingClientRect();
    return { x: x - rootRect.left, y: y - rootRect.top };
  }

  function float(cls: string, text: string, at: Point, ms: number): void {
    const el = h('span', { class: cls, style: `left:${at.x}px;top:${at.y}px` }, text);
    root.append(el);
    after(ms, () => el.remove());
  }

  function padOf(target: EventTarget | null): { pad: Pad; el: HTMLButtonElement } | null {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLButtonElement>('.drums-pad');
    if (!el || !grid.contains(el)) return null;
    const pad = PADS.find((p) => p.kind === el.dataset.kind);
    return pad ? { pad, el } : null;
  }

  function hit(pad: Pad, el: HTMLButtonElement, x: number, y: number): void {
    ctx.audio.drum(pad.kind);
    flash(pad.kind, 'drums-hit', HIT_MS);
    float('drums-burst', pad.emoji, pointOn(el, x, y), BURST_MS);
    navigator.vibrate?.(10);

    const now = Date.now();
    const last = lastSpoken.get(pad.kind);
    if (last === undefined || now - last >= SPEAK_GAP_MS) {
      lastSpoken.set(pad.kind, now);
      ctx.speak(pad.name);
    }

    hits++;
    if (hits % STAR_EVERY === 0) {
      ctx.addStar();
      ctx.audio.jingle();
      float('drums-star', '⭐', centreOf(el), STAR_MS);
    }
  }

  function onPadDown(e: PointerEvent): void {
    const found = padOf(e.target);
    if (!found) return;
    e.preventDefault();
    hit(found.pad, found.el, e.clientX, e.clientY);
  }

  function tick(): void {
    step = (step + 1) % BEAT_STEPS;
    for (const kind of beatAt(step)) {
      ctx.audio.drum(kind);
      flash(kind, 'drums-lit', LIT_MS);
    }
  }

  function stopBeat(): void {
    if (beatTimer === null) return;
    clearInterval(beatTimer);
    beatTimer = null;
    beatBtn.textContent = '▶';
    beatBtn.classList.remove('drums-on');
    beatBtn.setAttribute('aria-pressed', 'false');
    for (const el of padEls.values()) el.classList.remove('drums-lit');
  }

  function startBeat(): void {
    if (beatTimer !== null) return;
    step = -1;
    beatTimer = setInterval(tick, stepMs());
    beatBtn.textContent = '⏸';
    beatBtn.classList.add('drums-on');
    beatBtn.setAttribute('aria-pressed', 'true');
    ctx.speak('Gõ theo nhé!');
  }

  function onBeatDown(e: PointerEvent): void {
    e.preventDefault();
    ctx.audio.tick();
    if (beatTimer === null) startBeat();
    else stopBeat();
  }

  grid.addEventListener('pointerdown', onPadDown);
  beatBtn.addEventListener('pointerdown', onBeatDown);

  ctx.onCleanup(() => {
    stopBeat();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    flashes.clear();
  });
}

const game: GameModule = { ...meta, start };
export default game;
