import { h, randInt, replay } from '../../core/dom';
import { noteFreq } from '../../core/music';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  GROOVES,
  PARTS,
  SILENT_BARS,
  STAR_AFTER_MS,
  STAR_MIN_ACTIVE,
  STEPS,
  isDrumKind,
  noteSeconds,
  stepEvents,
  stepMs,
  transpose,
  type Groove,
  type Part,
} from './logic';
import './style.css';

/** Active tiles bump on every quarter-note beat for this long. */
const BEAT_MS = 120;
const STAR_FLOAT_MS = 900;

/**
 * Animal band: six animals, each looping one part of the same song (drums,
 * bass, chords, melody, shaker, bells). Tapping an animal adds it to or
 * removes it from the band; the first animal starts a 16-step sequencer that
 * everyone stays locked to. Three groove buttons change tempo and key. One
 * minute of playing with at least three animals earns a star.
 */
function start(ctx: GameContext): void {
  const firstGroove = GROOVES[0];
  if (!firstGroove) throw new Error('orchestra: GROOVES is empty');

  let alive = true;
  let groove: Groove = firstGroove;
  const active = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let seq: ReturnType<typeof setInterval> | null = null;
  let beatTimer: ReturnType<typeof setTimeout> | null = null;
  let step = -1;
  let bar = 0;
  /** Bars that started with nobody playing (in a row). */
  let silentBars = 0;
  /** Milliseconds played with at least `STAR_MIN_ACTIVE` animals. */
  let playedMs = 0;
  let starred = false;

  const root = h('div', { class: 'orchestra' });
  const stageEl = h('div', { class: 'orchestra-stage' });
  const tiles = new Map<string, HTMLButtonElement>();
  for (const part of PARTS) {
    const tile = h(
      'button',
      {
        class: 'orchestra-animal',
        type: 'button',
        'data-id': part.id,
        'aria-label': part.name,
        'aria-pressed': 'false',
        style: `--orchestra-color:${part.color}`,
      },
      h('span', { class: 'orchestra-emoji' }, part.emoji),
    );
    tiles.set(part.id, tile);
    stageEl.append(tile);
  }
  const bottom = h('div', { class: 'orchestra-bar' });
  const grooveBtns = new Map<string, HTMLButtonElement>();
  for (const g of GROOVES) {
    const btn = h(
      'button',
      { class: 'orchestra-groove btn-round', type: 'button', 'data-id': g.id, 'aria-label': g.name, 'aria-pressed': 'false' },
      g.emoji,
    );
    grooveBtns.set(g.id, btn);
    bottom.append(btn);
  }
  const stopBtn = h('button', { class: 'orchestra-stop btn-round', type: 'button', 'aria-label': 'Dừng' }, '⏹');
  bottom.append(stopBtn);
  root.append(stageEl, bottom);
  ctx.stage.append(root);

  function later(ms: number, fn: () => void): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function clearTimers(): void {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    beatTimer = null;
  }

  function play(part: Part, value: string): void {
    if (part.kind === 'drum') {
      if (isDrumKind(value)) ctx.audio.drum(value);
      return;
    }
    const dur = noteSeconds(part, groove.bpm);
    for (const n of value.split('+')) {
      const freq = noteFreq(transpose(n, groove.semitones));
      if (freq > 0) ctx.audio.note(freq, dur, part.timbre);
    }
  }

  /** Scale-bump every active tile for `BEAT_MS`. */
  function bump(): void {
    if (beatTimer !== null) {
      clearTimeout(beatTimer);
      timers.delete(beatTimer);
    }
    for (const id of active) tiles.get(id)?.classList.add('orchestra-beat');
    beatTimer = later(BEAT_MS, () => {
      beatTimer = null;
      for (const tile of tiles.values()) tile.classList.remove('orchestra-beat');
    });
  }

  function star(): void {
    starred = true;
    ctx.addStar();
    ctx.audio.jingle();
    const el = h('span', { class: 'orchestra-star' }, '⭐');
    root.append(el);
    later(STAR_FLOAT_MS, () => el.remove());
  }

  function tick(): void {
    if (!alive) return;
    step++;
    if (step >= STEPS) {
      step = 0;
      bar++;
    }
    if (step === 0) {
      if (active.size === 0) {
        silentBars++;
        if (silentBars >= SILENT_BARS) {
          stopSequencer();
          return;
        }
      } else {
        silentBars = 0;
      }
    }
    for (const { part, value } of stepEvents(active, step, bar)) play(part, value);
    if (step % 4 === 0 && active.size > 0) bump();
    if (!starred && active.size >= STAR_MIN_ACTIVE) {
      playedMs += stepMs(groove.bpm);
      if (Math.round(playedMs) >= STAR_AFTER_MS) star();
    }
  }

  function startSequencer(): void {
    if (seq !== null) return;
    step = -1;
    bar = 0;
    silentBars = 0;
    seq = setInterval(tick, stepMs(groove.bpm));
    root.classList.add('orchestra-playing');
  }

  function stopSequencer(): void {
    if (seq === null) return;
    clearInterval(seq);
    seq = null;
    step = -1;
    bar = 0;
    silentBars = 0;
    root.classList.remove('orchestra-playing');
    for (const tile of tiles.values()) tile.classList.remove('orchestra-beat');
  }

  function setGroove(g: Groove): void {
    groove = g;
    root.dataset.groove = g.id;
    root.style.setProperty('--orchestra-beat', `${stepMs(g.bpm) * 4}ms`);
    for (const [id, btn] of grooveBtns) {
      const on = id === g.id;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    if (seq !== null) {
      // Keep the step and bar: only the tempo changes.
      clearInterval(seq);
      seq = setInterval(tick, stepMs(g.bpm));
    }
  }

  function setActive(part: Part, on: boolean): void {
    const tile = tiles.get(part.id);
    if (on) active.add(part.id);
    else active.delete(part.id);
    tile?.classList.toggle('orchestra-active', on);
    tile?.classList.toggle('orchestra-dance', on);
    tile?.setAttribute('aria-pressed', String(on));
    if (on) {
      silentBars = 0;
      startSequencer();
    }
  }

  function stopAll(): void {
    for (const part of PARTS) setActive(part, false);
    stopSequencer();
  }

  function partOf(target: EventTarget | null): Part | null {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>('.orchestra-animal');
    if (!el || !stageEl.contains(el)) return null;
    return PARTS.find((p) => p.id === el.dataset.id) ?? null;
  }

  stageEl.addEventListener('pointerdown', (e: Event) => {
    const part = partOf(e.target);
    if (!part) return;
    e.preventDefault();
    ctx.audio.tick();
    navigator.vibrate?.(8);
    setActive(part, !active.has(part.id));
  });

  bottom.addEventListener('pointerdown', (e: Event) => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('.orchestra-stop')) {
      e.preventDefault();
      ctx.audio.tick();
      stopAll();
      return;
    }
    const el = e.target.closest<HTMLElement>('.orchestra-groove');
    if (!el) return;
    e.preventDefault();
    const g = GROOVES.find((x) => x.id === el.dataset.id);
    if (!g) return;
    ctx.audio.tick();
    setGroove(g);
  });

  setGroove(groove);

  // Nothing is spoken here: iOS ducks Web Audio while TTS speaks. The nudge is visual.
  ctx.hint.arm(() => {
    if (!alive) return;
    const idle = PARTS.filter((p) => !active.has(p.id));
    if (idle.length === 0) return;
    const part = idle[randInt(0, idle.length - 1)];
    const emoji = part ? tiles.get(part.id)?.firstElementChild : null;
    if (emoji) replay(emoji, 'orchestra-nudge');
  });

  ctx.onCleanup(() => {
    alive = false;
    stopSequencer();
    clearTimers();
  });
}

const game: GameModule = { ...meta, start };
export default game;
