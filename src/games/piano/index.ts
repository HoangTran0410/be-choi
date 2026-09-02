import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { KEYS, keyAt } from './logic';
import './style.css';

const NOTE_GLYPHS = ['🎵', '🎶'] as const;
const NOTE_MS = 700;

/**
 * Animal piano: eight rainbow keys, one octave. Every touch plays a note and
 * bounces the animal; sliding a finger across the keys plays each one it
 * crosses. Multi-touch, no rounds, no stars, no hint.
 */
function start(ctx: GameContext): void {
  const piano = h('div', { class: 'piano' });
  const keyEls = KEYS.map((k, i) =>
    h(
      'button',
      {
        class: 'piano-key',
        type: 'button',
        'data-index': i,
        'aria-label': k.animal.name,
        style: `--piano-color:${k.color}`,
      },
      h('span', { class: 'piano-animal' }, k.animal.emoji),
    ),
  );
  piano.append(...keyEls);
  ctx.stage.append(piano);

  /** Key index under each active pointer; -1 when the finger is down but off the keys. */
  const active = new Map<number, number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function indexOf(target: EventTarget | null): number {
    if (!(target instanceof Element)) return -1;
    const key = target.closest<HTMLElement>('.piano-key');
    if (!key || !piano.contains(key)) return -1;
    const index = Number(key.dataset.index);
    return Number.isInteger(index) ? index : -1;
  }

  function indexAtPoint(x: number, y: number): number {
    if (typeof document.elementFromPoint !== 'function') return -1;
    return indexOf(document.elementFromPoint(x, y));
  }

  function spawnNote(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const rect = piano.getBoundingClientRect();
    const glyph = NOTE_GLYPHS[Math.random() < 0.5 ? 0 : 1];
    const note = h('span', { class: 'piano-note', style: `left:${x - rect.left}px;top:${y - rect.top}px` }, glyph);
    piano.append(note);
    const t = setTimeout(() => {
      note.remove();
      timers.delete(t);
    }, NOTE_MS);
    timers.add(t);
  }

  function press(index: number, x: number, y: number): void {
    const key = keyAt(index);
    const el = keyEls[index];
    if (!key || !el) return;
    ctx.audio.note(key.freq, 0.6);
    el.classList.add('pressed');
    const glyph = el.firstElementChild;
    if (glyph) replay(glyph, 'anim-bounce');
    navigator.vibrate?.(8);
    spawnNote(x, y);
  }

  /** Un-press a key unless another finger is still on it. */
  function release(index: number): void {
    for (const i of active.values()) if (i === index) return;
    keyEls[index]?.classList.remove('pressed');
  }

  function onDown(e: PointerEvent): void {
    const index = indexOf(e.target);
    if (index < 0) return;
    e.preventDefault();
    // Touch pointers are implicitly captured by the key; release so the pointer
    // can be tracked across keys (and so mouse hover works the same way).
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* not captured: nothing to release */
    }
    active.set(e.pointerId, index);
    press(index, e.clientX, e.clientY);
  }

  function onMove(e: PointerEvent): void {
    const prev = active.get(e.pointerId);
    if (prev === undefined) return;
    const next = indexAtPoint(e.clientX, e.clientY);
    if (next === prev) return;
    active.set(e.pointerId, next);
    if (prev >= 0) release(prev);
    if (next >= 0) press(next, e.clientX, e.clientY);
  }

  function onUp(e: PointerEvent): void {
    const prev = active.get(e.pointerId);
    if (prev === undefined) return;
    active.delete(e.pointerId);
    if (prev >= 0) release(prev);
  }

  function releaseAll(): void {
    active.clear();
    for (const el of keyEls) el.classList.remove('pressed');
  }

  piano.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', releaseAll);

  ctx.onCleanup(() => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', releaseAll);
    for (const t of timers) clearTimeout(t);
    timers.clear();
    active.clear();
  });
}

const game: GameModule = { ...meta, start };
export default game;
