import { h, replay } from '../../core/dom';
import { fitsScale, noteFreq, scaleIndex, schedule, SONGS, type Song } from '../../core/music';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';

/** Only songs that fit the eight bars: the play-along has to be able to ask for every note. */
const SONGBOOK: readonly Song[] = SONGS.filter(fitsScale);
import {
  advance,
  BAR_COLORS,
  BARS,
  barLength,
  expectedBar,
  parseRec,
  REC_MAX_EVENTS,
  REC_MAX_MS,
  serializeRec,
  type RecEvent,
} from './logic';
import './style.css';

const NOTE_GLYPHS = ['🎵', '🎶'] as const;
const NOTE_MS = 700;
const LIT_MS = 200;
const TAP_DUR = 0.8;
/** Keep 🔁 in its "playing" state this long after the last replayed strike. */
const REPLAY_TAIL_MS = 600;
const REC_KEY = 'be-choi:xylo-rec';

function loadRec(): RecEvent[] {
  try {
    const raw = localStorage.getItem(REC_KEY);
    return raw ? (parseRec(raw) ?? []) : [];
  } catch {
    return [];
  }
}

function saveRec(events: readonly RecEvent[]): void {
  try {
    localStorage.setItem(REC_KEY, serializeRec(events));
  } catch {
    /* private browsing or full: the recording still replays this session */
  }
}

/**
 * Toy xylophone: eight rainbow bars, one octave. Every touch plays a note;
 * sliding a finger across the bars plays each one it crosses (multi-touch).
 * Pick a song and the next bar to hit glows with a pointing finger; ▶ plays
 * the song on its own. ⏺ records the child's strikes and 🔁 plays them back
 * (the last recording survives in localStorage). No fail state, no timer.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let song: Song | null = null;
  let index = 0;
  let stopPlayback: (() => void) | null = null;
  /** In-progress recording, or null. */
  let rec: { t0: number; events: RecEvent[] } | null = null;
  /** The last finished recording (possibly from an earlier session). */
  let saved: RecEvent[] = loadRec();
  let cancelReplay: (() => void) | null = null;

  const root = h('div', { class: 'xylo' });
  const strip = h('div', { class: 'xylo-songs' });
  const songEls = SONGBOOK.map((s, i) =>
    h(
      'button',
      { class: 'xylo-song', type: 'button', 'data-index': i, 'aria-label': s.title, onpointerdown: () => selectSong(s) },
      s.icon,
    ),
  );
  const playBtn = h('button', { class: 'xylo-play', type: 'button', 'aria-label': 'Phát bài hát', onpointerdown: togglePlay }, '▶');
  const recBtn = h('button', { class: 'xylo-rec', type: 'button', 'aria-label': 'Ghi âm', onpointerdown: toggleRec }, '⏺');
  const replayBtn = h(
    'button',
    { class: 'xylo-replay', type: 'button', 'aria-label': 'Nghe lại', hidden: saved.length === 0, onpointerdown: toggleReplay },
    '🔁',
  );
  strip.append(...songEls, playBtn, recBtn, replayBtn);

  const bars = h('div', { class: 'xylo-bars' });
  const barEls = BARS.map((_, i) =>
    h(
      'div',
      {
        class: 'xylo-bar',
        'data-index': i,
        style: `--xylo-color:${BAR_COLORS[i] ?? '#f97316'};--xylo-len:${barLength(i)}%`,
      },
      h('div', { class: 'xylo-bar-face' }),
    ),
  );
  bars.append(...barEls);
  const finger = h('span', { class: 'xylo-finger' }, '👆');
  root.append(strip, bars);
  ctx.stage.append(root);

  /** Bar index under each active pointer; -1 when the finger is down but off the bars. */
  const active = new Map<number, number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  function faceOf(i: number): Element | null {
    return barEls[i]?.firstElementChild ?? null;
  }

  function indexOf(target: EventTarget | null): number {
    if (!(target instanceof Element)) return -1;
    const bar = target.closest<HTMLElement>('.xylo-bar');
    if (!bar || !bars.contains(bar)) return -1;
    const i = Number(bar.dataset.index);
    return Number.isInteger(i) ? i : -1;
  }

  function indexAtPoint(x: number, y: number): number {
    if (typeof document.elementFromPoint !== 'function') return -1;
    return indexOf(document.elementFromPoint(x, y));
  }

  function spawnNote(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const rect = root.getBoundingClientRect();
    const glyph = NOTE_GLYPHS[Math.random() < 0.5 ? 0 : 1];
    const note = h('span', { class: 'xylo-note', style: `left:${x - rect.left}px;top:${y - rect.top}px` }, glyph);
    root.append(note);
    later(() => note.remove(), NOTE_MS);
  }

  // ---- song mode ----

  /** Glow + finger on the bar the song wants next; nothing when not in song mode. */
  function showExpected(): void {
    const exp = song ? expectedBar(song, index) : null;
    barEls.forEach((el, i) => el.classList.toggle('xylo-glow', exp?.bar === i));
    const target = exp ? barEls[exp.bar] : undefined;
    if (target) target.append(finger);
    else finger.remove();
  }

  function leaveSongMode(): void {
    song = null;
    index = 0;
    for (const el of songEls) el.classList.remove('active');
    ctx.hint.clear();
    showExpected();
  }

  function selectSong(s: Song): void {
    stop();
    song = s;
    index = 0;
    songEls.forEach((el, i) => el.classList.toggle('active', SONGBOOK[i] === s));
    ctx.speak(s.title);
    showExpected();
    ctx.hint.arm(() => {
      if (!song) return;
      const exp = expectedBar(song, index);
      const face = exp ? faceOf(exp.bar) : null;
      if (face) replay(face, 'anim-wiggle');
    });
  }

  function finishSong(): void {
    leaveSongMode();
    void ctx.celebrate().then(() => {
      if (!alive) return;
      ctx.addStar();
    });
  }

  // ---- striking bars ----

  function strike(i: number, x: number, y: number): void {
    const note = BARS[i];
    const face = faceOf(i);
    if (!note || !face) return;
    ctx.audio.note(noteFreq(note), TAP_DUR, 'xylo');
    face.classList.remove('anim-wiggle');
    replay(face, 'anim-bounce');
    navigator.vibrate?.(8);
    spawnNote(x, y);
    if (rec && rec.events.length < REC_MAX_EVENTS) {
      rec.events.push({ bar: i, t: Math.max(0, Math.round(performance.now() - rec.t0)) });
    }
    if (!song) return;
    const r = advance(song, index, i);
    if (!r.correct) return;
    index = r.index;
    if (r.done) finishSong();
    else showExpected();
  }

  function onDown(e: PointerEvent): void {
    const i = indexOf(e.target);
    if (i < 0) return;
    e.preventDefault();
    // Touch pointers are implicitly captured by the bar; release so the pointer
    // can be tracked across bars (and so mouse hover works the same way).
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* not captured: nothing to release */
    }
    active.set(e.pointerId, i);
    strike(i, e.clientX, e.clientY);
  }

  function onMove(e: PointerEvent): void {
    const prev = active.get(e.pointerId);
    if (prev === undefined) return;
    const next = indexAtPoint(e.clientX, e.clientY);
    if (next === prev) return;
    active.set(e.pointerId, next);
    if (next >= 0) strike(next, e.clientX, e.clientY);
  }

  function onUp(e: PointerEvent): void {
    active.delete(e.pointerId);
  }

  function releaseAll(): void {
    active.clear();
  }

  // ---- playback ----

  function flash(i: number): void {
    const el = barEls[i];
    if (!el) return;
    el.classList.add('xylo-lit');
    later(() => el.classList.remove('xylo-lit'), LIT_MS);
  }

  function setPlaying(on: boolean): void {
    playBtn.textContent = on ? '⏸' : '▶';
    playBtn.classList.toggle('xylo-playing', on);
    playBtn.setAttribute('aria-label', on ? 'Dừng' : 'Phát bài hát');
  }

  function stop(): void {
    stopPlayback?.();
    stopPlayback = null;
    setPlaying(false);
  }

  function play(): void {
    const s = song ?? SONGBOOK[0];
    if (!s) return;
    stop();
    stopReplay();
    setPlaying(true);
    stopPlayback = schedule(
      s.notes,
      s.bpm,
      (_i, n, ms) => {
        if (n.n === 'R') return;
        const bar = scaleIndex(n.n);
        if (bar < 0) return;
        ctx.audio.note(noteFreq(n.n), (ms / 1000) * 0.9, 'xylo');
        flash(bar);
      },
      () => {
        stopPlayback = null;
        setPlaying(false);
      },
    );
  }

  function togglePlay(): void {
    if (stopPlayback) stop();
    else play();
  }

  // ---- record & replay ----

  function setRecording(on: boolean): void {
    recBtn.classList.toggle('xylo-recording', on);
    recBtn.setAttribute('aria-label', on ? 'Dừng ghi' : 'Ghi âm');
  }

  function startRec(): void {
    stopReplay();
    const r = { t0: performance.now(), events: [] as RecEvent[] };
    rec = r;
    setRecording(true);
    ctx.speak('Bé chơi đi, đàn đang ghi');
    later(() => {
      if (rec === r) stopRec();
    }, REC_MAX_MS);
  }

  /** End the recording; keep it (and persist it) only when the child actually struck something. */
  function stopRec(): void {
    if (!rec) return;
    const events = rec.events;
    rec = null;
    setRecording(false);
    if (events.length === 0) return;
    saved = events;
    saveRec(saved);
    replayBtn.hidden = false;
    if (alive) ctx.speak('Ghi xong rồi, bé nghe lại nhé');
  }

  function toggleRec(): void {
    if (rec) stopRec();
    else startRec();
  }

  function setReplaying(on: boolean): void {
    replayBtn.textContent = on ? '⏹' : '🔁';
    replayBtn.classList.toggle('xylo-replaying', on);
    replayBtn.setAttribute('aria-label', on ? 'Dừng' : 'Nghe lại');
  }

  function stopReplay(): void {
    cancelReplay?.();
    cancelReplay = null;
    setReplaying(false);
  }

  /** Light a bar and play its note without recording it or advancing the song. */
  function sound(i: number): void {
    const note = BARS[i];
    const face = faceOf(i);
    if (!note || !face) return;
    ctx.audio.note(noteFreq(note), TAP_DUR, 'xylo');
    replay(face, 'anim-bounce');
    flash(i);
  }

  function startReplay(): void {
    const events = saved;
    if (events.length === 0) return;
    stop();
    stopReplay();
    setReplaying(true);
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const step = (): void => {
      if (cancelled) return;
      const ev = events[i];
      if (!ev) {
        cancelReplay = null;
        setReplaying(false);
        return;
      }
      sound(ev.bar);
      i++;
      const next = events[i];
      timer = setTimeout(step, next ? Math.max(0, next.t - ev.t) : REPLAY_TAIL_MS);
    };
    timer = setTimeout(step, events[0]?.t ?? 0);
    cancelReplay = () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }

  function toggleReplay(): void {
    if (cancelReplay) stopReplay();
    else startReplay();
  }

  bars.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', releaseAll);

  ctx.onCleanup(() => {
    alive = false;
    stop();
    stopReplay();
    stopRec();
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
