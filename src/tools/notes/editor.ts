/**
 * The editor screen: a grid of the melody with the lyric lines laid over it, so a
 * wrong note and a line that has drifted off the beat are both visible at a glance.
 * Every edit is heard as it is made. Nothing here writes to `music.ts` — the 📋 button
 * puts the `seq(…)` source on the clipboard and the change is pasted in by hand.
 */
import type { AudioEngine, Timbre } from '../../core/audio';
import { h } from '../../core/dom';
import { noteFreq, schedule, SONGS, type Song, type SongNote } from '../../core/music';
import {
  beatCheck,
  clipboardSource,
  createHistory,
  draftFromSong,
  draftKey,
  DURATIONS,
  noteStarts,
  overflowingPhrases,
  parseDraft,
  parsePitch,
  phraseNoteRange,
  phraseSpans,
  pitchRows,
  REST,
  serializeDraft,
  setAcc,
  snapDuration,
  stepDuration,
  stepPitch,
  totalNoteBeats,
  withInsertedNote,
  withNote,
  withoutNote,
  withPhraseBeats,
  type Draft,
  type Pitch,
  type Quote,
} from './logic';

const PX_PER_BEAT = 46;
const ROW_H = 24;
const BAND_H = 34;
/** Blank rows above and below the melody, so a note has somewhere to be dragged to. */
const PAD_ROWS = 1;
/** A note tapped on its own rings this long at most, however long it is written. */
const TAP_MAX_S = 0.9;
const TIMBRES: readonly Timbre[] = ['piano', 'xylo', 'bell', 'flute'];

type Drag =
  | { kind: 'pitch'; index: number; y0: number; base: Draft }
  | { kind: 'length'; index: number; x0: number; base: Draft }
  | { kind: 'phrase'; index: number; x0: number; base: Draft };

function beatsOf(draft: Draft): number {
  return Math.max(totalNoteBeats(draft.notes), draft.phrases.reduce((sum, p) => sum + p.beats, 0));
}

function loadDraft(song: Song): Draft {
  try {
    const raw = localStorage.getItem(draftKey(song.id));
    if (raw) return parseDraft(raw, song) ?? draftFromSong(song);
  } catch {
    /* private browsing: the draft just does not survive the reload */
  }
  return draftFromSong(song);
}

function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(draftKey(draft.id), serializeDraft(draft));
  } catch {
    /* nothing to do: the draft still lives for this session */
  }
}

/** Mounts the editor into `root`. Returns a teardown function. */
export function mountEditor(root: HTMLElement, audio: AudioEngine): () => void {
  let song = SONGS[0] as Song;
  let draft = loadDraft(song);
  let history = createHistory(draft);
  let selected = 0;
  let quote: Quote = '"';
  let timbre: Timbre = 'piano';
  let drag: Drag | null = null;
  let stopPlayback: (() => void) | null = null;
  /** The note the playhead is on while a melody is playing, or -1. */
  let playing = -1;
  /** The lyric line being looped, or null. */
  let looping: number | null = null;

  // ---- Chrome that is built once and only has its text updated ----
  const songStrip = h('div', { class: 'ne-songs' });
  const title = h('span', { class: 'ne-title' });
  const check = h('span', { class: 'ne-check' });
  const copyBtn = h('button', { class: 'ne-btn', type: 'button', onclick: copy }, '📋 Chép');
  const quoteBtn = h('button', { class: 'ne-btn ne-quote', type: 'button', title: 'Kiểu nháy khi chép', onclick: toggleQuote }, '" "');
  const resetBtn = h('button', { class: 'ne-btn', type: 'button', title: 'Bỏ nháp, quay về bản trong file', onclick: reset }, '↺');
  const undoBtn = h('button', { class: 'ne-btn', type: 'button', onclick: () => step(history.undo()) }, '↶');
  const redoBtn = h('button', { class: 'ne-btn', type: 'button', onclick: () => step(history.redo()) }, '↷');
  const bands = h('div', { class: 'ne-bands' });
  const rows = h('div', { class: 'ne-rows' });
  const playhead = h('div', { class: 'ne-playhead' });
  const canvas = h('div', { class: 'ne-canvas' }, bands, rows, playhead);
  const scroll = h('div', { class: 'ne-scroll' }, canvas);
  const keys = h('div', { class: 'ne-keys' });
  const inspect = h('div', { class: 'ne-inspect' });
  const playBtn = h('button', { class: 'ne-btn ne-play', type: 'button', title: 'Phát từ nốt đang chọn', onclick: togglePlay }, '▶');
  const loopBtn = h('button', { class: 'ne-btn', type: 'button', title: 'Lặp câu đang chọn', onclick: toggleLoop }, '🔁 câu');
  const timbreSel = h('select', { class: 'ne-sel', onchange: onTimbre }, ...TIMBRES.map((t) => h('option', { value: t }, t)));

  const app = h(
    'div',
    { class: 'ne' },
    h(
      'header',
      { class: 'ne-top' },
      songStrip,
      h('div', { class: 'ne-status' }, title, check),
      h('div', { class: 'ne-actions' }, undoBtn, redoBtn, resetBtn, quoteBtn, copyBtn),
    ),
    h('div', { class: 'ne-board' }, keys, scroll),
    inspect,
    h(
      'footer',
      { class: 'ne-transport' },
      playBtn,
      h('button', { class: 'ne-btn', type: 'button', title: 'Về đầu bài', onclick: () => selectNote(0) }, '⏮'),
      h('button', { class: 'ne-btn', type: 'button', onclick: () => selectNote(selected - 1) }, '◀ nốt'),
      h('button', { class: 'ne-btn', type: 'button', onclick: () => selectNote(selected + 1) }, 'nốt ▶'),
      loopBtn,
      timbreSel,
      h(
        'span',
        { class: 'ne-help' },
        '←→ chọn nốt · ↑↓ cao độ · [ ] dài ngắn · space phát · enter nghe nốt · a chèn · ⌫ xoá · ⌘Z hoàn tác',
      ),
    ),
  );
  root.replaceChildren(app);

  for (const s of SONGS) {
    songStrip.append(
      h(
        'button',
        { class: 'ne-song', type: 'button', 'data-id': s.id, title: s.title, onclick: () => openSong(s) },
        s.icon,
      ),
    );
  }

  rows.addEventListener('pointerdown', onGridDown);
  bands.addEventListener('pointerdown', onBandDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  render();

  // ---- Editing ----

  /** Take an edit: it becomes the draft, goes on the undo stack, and is saved. */
  function commit(next: Draft): void {
    if (next === draft) return;
    draft = next;
    history.push(draft);
    saveDraft(draft);
    render();
  }

  /** Move to a state the undo stack handed back. */
  function step(next: Draft | null): void {
    if (!next) return;
    draft = next;
    selected = Math.min(selected, draft.notes.length - 1);
    saveDraft(draft);
    render();
  }

  function openSong(next: Song): void {
    stop();
    song = next;
    draft = loadDraft(next);
    history = createHistory(draft);
    selected = 0;
    looping = null;
    render();
    scroll.scrollLeft = 0;
  }

  function reset(): void {
    stop();
    try {
      localStorage.removeItem(draftKey(song.id));
    } catch {
      /* nothing saved to remove */
    }
    draft = draftFromSong(song);
    history = createHistory(draft);
    selected = Math.min(selected, draft.notes.length - 1);
    render();
  }

  function selectNote(index: number): void {
    const at = Math.min(draft.notes.length - 1, Math.max(0, index));
    selected = at;
    ring(at);
    render();
    scrollTo(at);
  }

  function editSelected(patch: Partial<SongNote>): void {
    commit(withNote(draft, selected, patch));
    ring(selected);
  }

  // ---- Sound ----

  /** Play one note on its own, so an edit is heard the moment it is made. */
  function ring(index: number): void {
    const note = draft.notes[index];
    if (!note || note.n === REST) return;
    audio.note(noteFreq(note.n), Math.min(TAP_MAX_S, (note.d * 60) / draft.bpm), timbre);
  }

  function stop(): void {
    stopPlayback?.();
    stopPlayback = null;
    playing = -1;
    looping = null;
    renderNow();
    renderPlayhead();
    playBtn.textContent = '▶';
    loopBtn.classList.remove('on');
  }

  function run(from: number, to: number, loop: boolean): void {
    stopPlayback?.();
    const slice = draft.notes.slice(from, to + 1);
    if (slice.length === 0) return;
    stopPlayback = schedule(
      slice,
      draft.bpm,
      (i, note, ms) => {
        playing = from + i;
        if (note.n !== REST) audio.note(noteFreq(note.n), ms / 1000, timbre);
        renderNow();
        renderPlayhead();
        scrollTo(playing);
      },
      () => {
        if (loop) run(from, to, true);
        else stop();
      },
    );
    playBtn.textContent = '⏸';
  }

  /** Play from the selected note, so listening to a fix does not mean sitting through the intro. */
  function togglePlay(): void {
    if (stopPlayback) {
      stop();
      return;
    }
    run(selected, draft.notes.length - 1, false);
  }

  /** Loop the lyric line the selected note belongs to: the working loop for fixing a line. */
  function toggleLoop(): void {
    if (looping !== null) {
      stop();
      return;
    }
    const index = phraseOf(selected);
    const range = index === null ? null : phraseNoteRange(draft.notes, draft.phrases, index);
    if (!range) return;
    stop();
    looping = index;
    loopBtn.classList.add('on');
    run(range.start, range.end, true);
  }

  function phraseOf(noteIndex: number): number | null {
    const start = noteStarts(draft.notes)[noteIndex] ?? 0;
    const at = phraseSpans(draft.phrases).findIndex((s) => start >= s.start && start < s.end);
    return at < 0 ? null : at;
  }

  function onTimbre(e: Event): void {
    timbre = ((e.target as HTMLSelectElement).value || 'piano') as Timbre;
    ring(selected);
  }

  // ---- Pointer ----

  function onGridDown(e: Event): void {
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('.ne-note');
    if (!el) return;
    const index = Number(el.dataset.i);
    selected = index;
    const pe = e as PointerEvent;
    drag = target.classList.contains('ne-grip')
      ? { kind: 'length', index, x0: pe.clientX, base: draft }
      : { kind: 'pitch', index, y0: pe.clientY, base: draft };
    ring(index);
    render();
  }

  function onBandDown(e: Event): void {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('ne-band-grip')) return;
    const index = Number((target.closest<HTMLElement>('.ne-band'))?.dataset.i);
    if (!Number.isFinite(index)) return;
    drag = { kind: 'phrase', index, x0: (e as PointerEvent).clientX, base: draft };
  }

  function onMove(e: PointerEvent): void {
    if (!drag) return;
    e.preventDefault();
    if (drag.kind === 'pitch') {
      const note = drag.base.notes[drag.index];
      if (!note || note.n === REST) return;
      const steps = Math.round((drag.y0 - e.clientY) / ROW_H);
      const name = stepPitch(note.n, steps);
      if (name === draft.notes[drag.index]?.n) return;
      draft = withNote(drag.base, drag.index, { n: name });
      ring(drag.index);
    } else if (drag.kind === 'length') {
      const base = drag.base.notes[drag.index]?.d ?? 1;
      const d = snapDuration(base + (e.clientX - drag.x0) / PX_PER_BEAT);
      if (d === draft.notes[drag.index]?.d) return;
      draft = withNote(drag.base, drag.index, { d });
    } else {
      const base = drag.base.phrases[drag.index]?.beats ?? 1;
      const beats = base + (e.clientX - drag.x0) / PX_PER_BEAT;
      const next = withPhraseBeats(drag.base, drag.index, beats);
      if (next.phrases[drag.index]?.beats === draft.phrases[drag.index]?.beats) return;
      draft = next;
    }
    render();
  }

  function onUp(): void {
    if (!drag) return;
    const { base, kind } = drag;
    const settled = draft;
    drag = null;
    if (settled === base) return;
    // Put the pre-drag state back so the whole drag lands on the undo stack as one edit.
    draft = base;
    commit(settled);
    if (kind === 'length') ring(selected);
  }

  // ---- Keyboard ----

  function onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const note = draft.notes[selected];
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && key === 'z') {
      step(e.shiftKey ? history.redo() : history.undo());
    } else if (e.key === 'ArrowLeft') {
      selectNote(selected - 1);
    } else if (e.key === 'ArrowRight') {
      selectNote(selected + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (note && note.n !== REST) editSelected({ n: stepPitch(note.n, e.key === 'ArrowUp' ? 1 : -1) });
    } else if (e.key === '[' || e.key === ']') {
      if (note) editSelected({ d: stepDuration(note.d, e.key === ']' ? 1 : -1) });
    } else if (e.key === ' ') {
      togglePlay();
    } else if (e.key === 'Enter') {
      ring(selected);
    } else if (key === 'a') {
      commit(withInsertedNote(draft, selected));
      selectNote(selected + 1);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      commit(withoutNote(draft, selected));
      selected = Math.min(selected, draft.notes.length - 1);
      render();
    } else if (key === 'r') {
      if (note) editSelected({ n: note.n === REST ? 'C4' : REST });
    } else {
      return;
    }
    e.preventDefault();
  }

  // ---- Drawing ----

  function render(): void {
    const grid = pitchRows(draft.notes, PAD_ROWS);
    const starts = noteStarts(draft.notes);
    const width = beatsOf(draft) * PX_PER_BEAT + PX_PER_BEAT * 2;
    canvas.style.width = `${width}px`;

    for (const el of songStrip.children) {
      el.classList.toggle('on', (el as HTMLElement).dataset.id === song.id);
    }
    title.textContent = `${song.icon} ${song.title} · ${draft.bpm} bpm`;
    const beats = beatCheck(draft);
    check.textContent = draft.phrases.length
      ? `notes ${beats.notes} nhịp · lời ${beats.lyrics} nhịp · ${beats.diff === 0 ? 'khớp ✓' : `lệch ${beats.diff > 0 ? '+' : ''}${beats.diff}`}`
      : `notes ${beats.notes} nhịp · bài không lời`;
    check.classList.toggle('warn', draft.phrases.length > 0 && beats.diff !== 0);
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
    quoteBtn.textContent = quote === '"' ? '" "' : "' '";

    renderBands();
    renderKeys(grid);
    renderRows(grid, starts);
    renderPlayhead();
    renderInspect();
  }

  function renderBands(): void {
    bands.style.height = `${BAND_H}px`;
    const over = overflowingPhrases(draft.notes, draft.phrases);
    bands.replaceChildren(
      ...draft.phrases.map((phrase, i) =>
        h(
          'div',
          {
            class: `ne-band${over.has(i) ? ' bad' : ''}${looping === i ? ' on' : ''}`,
            'data-i': i,
            style: `width:${phrase.beats * PX_PER_BEAT}px`,
            title: phrase.text,
          },
          h('span', { class: 'ne-band-text' }, `${phrase.emoji} ${phrase.text}`),
          h('span', { class: 'ne-band-beats' }, over.has(i) ? `⚠ ${phrase.beats}` : String(phrase.beats)),
          h('span', { class: 'ne-band-grip', title: 'Kéo để đổi số nhịp của câu' }),
        ),
      ),
    );
  }

  function renderKeys(grid: readonly string[]): void {
    keys.replaceChildren(
      h('div', { class: 'ne-key-pad', style: `height:${BAND_H}px` }),
      ...grid.map((name) => h('div', { class: `ne-key${name.startsWith('C') ? ' c' : ''}`, style: `height:${ROW_H}px` }, name)),
      h('div', { class: 'ne-key rest', style: `height:${ROW_H}px`, title: 'Nốt lặng' }, 'R'),
    );
  }

  function renderRows(grid: readonly string[], starts: readonly number[]): void {
    const byRow = new Map<string, HTMLElement>();
    const rowEls = grid.map((name) => {
      const el = h('div', { class: `ne-row${name.startsWith('C') ? ' c' : ''}`, style: `height:${ROW_H}px` });
      byRow.set(name, el);
      return el;
    });
    const restRow = h('div', { class: 'ne-row rest', style: `height:${ROW_H}px` });
    rows.replaceChildren(...rowEls, restRow);

    draft.notes.forEach((note, i) => {
      const pitch: Pitch | null = parsePitch(note.n);
      const host = note.n === REST ? restRow : byRow.get(pitch ? `${pitch.letter}${pitch.octave}` : '');
      if (!host) return;
      const classes = ['ne-note'];
      if (i === selected) classes.push('sel');
      if (i === playing) classes.push('now');
      if (note.n === REST) classes.push('is-rest');
      host.append(
        h(
          'div',
          {
            class: classes.join(' '),
            'data-i': i,
            style: `left:${(starts[i] ?? 0) * PX_PER_BEAT}px;width:${Math.max(10, note.d * PX_PER_BEAT - 2)}px`,
          },
          h('span', { class: 'ne-note-name' }, note.n === REST ? '𝄽' : note.n),
          h('span', { class: 'ne-grip', title: 'Kéo để đổi độ dài' }),
        ),
      );
    });
  }

  /** Light up the note being heard. Its own pass, so playing does not rebuild the grid. */
  function renderNow(): void {
    for (const el of rows.querySelectorAll('.ne-note')) {
      el.classList.toggle('now', Number((el as HTMLElement).dataset.i) === playing);
    }
  }

  function renderPlayhead(): void {
    const at = playing >= 0 ? playing : selected;
    const start = noteStarts(draft.notes)[at] ?? 0;
    playhead.style.left = `${start * PX_PER_BEAT}px`;
    playhead.classList.toggle('on', playing >= 0);
  }

  function renderInspect(): void {
    const note = draft.notes[selected];
    if (!note) {
      inspect.replaceChildren();
      return;
    }
    const acc = parsePitch(note.n)?.acc ?? '';
    const accBtn = (label: string, value: Pitch['acc']) =>
      h(
        'button',
        {
          class: `ne-btn${acc === value ? ' on' : ''}`,
          type: 'button',
          disabled: note.n === REST,
          onclick: () => editSelected({ n: setAcc(note.n, value) }),
        },
        label,
      );
    inspect.replaceChildren(
      h('span', { class: 'ne-pill' }, `nốt ${selected + 1}/${draft.notes.length}`),
      h('span', { class: 'ne-pill big' }, note.n === REST ? 'lặng' : note.n),
      h('button', { class: 'ne-btn', type: 'button', onclick: () => editSelected({ n: stepPitch(note.n, 1) }) }, '▲'),
      h('button', { class: 'ne-btn', type: 'button', onclick: () => editSelected({ n: stepPitch(note.n, -1) }) }, '▼'),
      accBtn('♮', ''),
      accBtn('♯', '#'),
      accBtn('♭', 'b'),
      h('span', { class: 'ne-sep' }, 'dài'),
      ...DURATIONS.map((d) =>
        h(
          'button',
          { class: `ne-btn${note.d === d ? ' on' : ''}`, type: 'button', onclick: () => editSelected({ d }) },
          String(d),
        ),
      ),
      h('span', { class: 'ne-sep' }),
      h('button', { class: 'ne-btn', type: 'button', onclick: () => { commit(withInsertedNote(draft, selected)); selectNote(selected + 1); } }, '＋'),
      h('button', { class: 'ne-btn', type: 'button', onclick: () => { commit(withoutNote(draft, selected)); selectNote(selected); } }, '🗑'),
      h(
        'button',
        { class: `ne-btn${note.n === REST ? ' on' : ''}`, type: 'button', onclick: () => editSelected({ n: note.n === REST ? 'C4' : REST }) },
        'lặng',
      ),
    );
  }

  function scrollTo(index: number): void {
    const start = (noteStarts(draft.notes)[index] ?? 0) * PX_PER_BEAT;
    const left = scroll.scrollLeft;
    const width = scroll.clientWidth;
    if (start < left + PX_PER_BEAT) scroll.scrollLeft = Math.max(0, start - PX_PER_BEAT * 2);
    else if (start > left + width - PX_PER_BEAT * 2) scroll.scrollLeft = start - width + PX_PER_BEAT * 4;
  }

  // ---- Getting the result out ----

  function toggleQuote(): void {
    quote = quote === '"' ? "'" : '"';
    quoteBtn.textContent = quote === '"' ? '" "' : "' '";
  }

  function copy(): void {
    const text = clipboardSource(draft, song, quote);
    const done = () => {
      copyBtn.textContent = '✓ Đã chép';
      setTimeout(() => {
        copyBtn.textContent = '📋 Chép';
      }, 1200);
    };
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard?.writeText) void clipboard.writeText(text).then(done, () => console.log(text));
    else console.log(text);
  }

  return () => {
    stop();
    rows.removeEventListener('pointerdown', onGridDown);
    bands.removeEventListener('pointerdown', onBandDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    root.replaceChildren();
  };
}
