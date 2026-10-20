import { h, replay } from '../../core/dom';
import { onFrame, onPerfChange, perf } from '../../core/frame';
import { findSong, type Song } from '../../core/music';
import { showPhotoPicker, type PickerChoice } from '../../core/photoPicker';
import type { Photo } from '../../core/photos';
import { sayText } from '../../core/say';
import { makeTappable } from '../../core/tap';
import type { GameContext, GameModule } from '../../core/types';
import { catSvg } from './cats';
import {
  BEATS_PER_BAR,
  CAT_COUNT,
  MEMORY_ROUNDS,
  NEW_DESIGNS,
  NUMBER_WORDS,
  SONG_UNLOCKS,
  STYLES,
  barEvents,
  buildFinale,
  catHz,
  catScale,
  chorusBar,
  createGuide,
  designsFor,
  harmonyBar,
  joinChorus,
  makeMemory,
  memoryCheck,
  memoryStart,
  loadCatSave,
  newCatsFor,
  songSteps,
  songUnlocked,
  storeCatSave,
  styleById,
  type BandEvent,
  type Guide,
  type SongStep,
  type StyleId,
} from './logic';
import { createSequencer } from './sequencer';
import { meta } from './meta';
import './style.css';

/** A singing cat keeps its mouth open this long. */
const SING_MS = 460;
/** Nothing touched for this long and the cats start singing along. */
const IDLE_MS = 6000;
/** Bars the cats keep singing along after the last touch. */
const HARMONY_BARS = 12;
/** The same words are not repeated more often than this. */
/** One step of the count-up scale. */
const SCALE_STEP_MS = 720;
/** A cat lit again after its own note, so a repeated note is a new light. */
const RELIGHT_MS = 170;
const NOTE_COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
const GLYPHS = ['♪', '♫', '♬'];

type Mode = 'free' | 'song' | 'scale';

interface Particle {
  el: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/**
 * Dàn mèo hát: eight cats on a shelf, from a big low voice to a tiny high one. A
 * touch makes that cat sing its own steady note (a synthesized "meo" at the exact
 * pitch, see core/catvoice.ts, so tapping the cats in order plays the tune), over a band of drums, bass and chords that the
 * child picks. Leave them alone a while and the cats join in by themselves, only
 * ever on notes that belong to the chord. In the song mode a tune lights its cats
 * one by one and waits for the child; the whole band sings it when it is done.
 * Nothing is spoken when a cat is touched: the point is to hear the music.
 */
function start(ctx: GameContext): void {
  let alive = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void): void => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  };
  const seq = createSequencer();

  let save = loadCatSave();
  let designs = designsFor(save.stars);
  let mode: Mode = 'free';
  let style = STYLES[0] as (typeof STYLES)[number];
  let playing = false;
  /** The band was switched off on purpose: nothing starts it again except the child. */
  let musicOff = false;
  let bar = 0;
  let nextBarMs = 0;
  let touched = false;
  let harmonyBars = 0;
  let chorus: number[] = [];
  let guide: Guide | null = null;
  let song: Song | null = null;
  let steps: readonly SongStep[] = [];
  let finale = false;
  let photoList: Photo[] = [];
  /** A photo chosen and waiting for the cat that will wear it. */
  let assigning: string | null = null;
  let closePicker: (() => void) | null = null;
  /** "Nhớ giai điệu": the cats sing a phrase, the child sings it back. */
  let mem: { seq: number[]; pos: number; len: number; rounds: number; listening: boolean } | null = null;
  let scaleUp = true;
  let tapCount = 0;
  const taps = new Array<number>(CAT_COUNT).fill(0);

  /* ---------------------------------------------------------------- DOM */

  const root = h('div', { class: 'catband' });
  const styleBar = h('div', { class: 'cb-bar cb-styles' });
  const captionText = h('span', { class: 'cb-caption-text' }, 'Chạm vào mèo nhé!');
  const progressFill = h('span', { class: 'cb-progress-fill' });
  const caption = h('div', { class: 'cb-caption' }, h('span', { class: 'cb-progress' }, progressFill), captionText);
  const shelf = h('div', { class: 'cb-stage' });
  const modeBar = h('div', { class: 'cb-bar cb-modes' });
  const picker = h('div', { class: 'cb-picker', hidden: true });
  const floaty = h('div', { class: 'cb-floaty' });
  root.append(styleBar, caption, shelf, modeBar, picker, floaty);
  ctx.stage.append(root);

  const cells: HTMLElement[] = [];
  const holders: HTMLElement[] = [];
  const singTimers = new Array<ReturnType<typeof setTimeout> | null>(CAT_COUNT).fill(null);

  for (let i = 0; i < CAT_COUNT; i++) {
    const holder = h('div', { class: 'cb-cat' });
    holder.style.setProperty('--s', String(catScale(i)));
    const dot = h('span', { class: 'cb-dot' });
    dot.style.background = NOTE_COLORS[i] ?? '#999';
    const cell = h(
      'button',
      { class: 'cb-cell', type: 'button', 'data-cat': i, 'aria-label': designs[i]?.name ?? 'Mèo' },
      h('span', { class: 'cb-board' }),
      holder,
      dot,
    );
    cell.style.setProperty('--i', String(i));
    cell.style.setProperty('--row', String(i >> 1));
    cell.style.setProperty('--row4', String(i >> 2));
    makeTappable(cell, () => tapCat(i), { ctx, cooldownMs: 70, feedback: false });
    cells.push(cell);
    holders.push(holder);
    shelf.append(cell);
  }

  function drawCats(popSeat = -1): void {
    for (let i = 0; i < CAT_COUNT; i++) {
      const design = designs[i];
      const holder = holders[i];
      const cell = cells[i];
      if (!design || !holder || !cell) continue;
      holder.replaceChildren(catSvg(design.id));
      const photo = photoList.find((p) => p.id === save.faces[String(i)]);
      if (photo) {
        const face = h('span', { class: 'cb-face', 'data-photo': photo.id }, h('span', { class: 'cb-face-mouth' }));
        face.style.backgroundImage = `url("${photo.url}")`;
        holder.append(face);
      }
      cell.setAttribute('aria-label', design.name);
      if (i === popSeat) replay(holder, 'cb-new');
    }
  }
  drawCats();

  const styleButtons = new Map<StyleId, HTMLElement>();
  for (const s of STYLES) {
    const b = h(
      'button',
      { class: 'cb-btn', type: 'button', 'data-style': s.id, 'aria-label': `Nhạc ${s.name}` },
      h('span', { class: 'cb-emoji' }, s.emoji),
      h('span', { class: 'cb-label' }, s.name),
    );
    makeTappable(b, () => pickStyle(s.id), { ctx, cooldownMs: 250 });
    styleButtons.set(s.id, b);
    styleBar.append(b);
  }
  const stopBtn = h(
    'button',
    { class: 'cb-btn cb-stop', type: 'button', 'data-act': 'stop', 'aria-label': 'Tắt nhạc' },
    h('span', { class: 'cb-emoji' }, '⏹️'),
    h('span', { class: 'cb-label' }, 'Tắt nhạc'),
  );
  makeTappable(stopBtn, () => (playing ? stopBacking() : startBacking()), { ctx, cooldownMs: 250 });
  styleBar.append(stopBtn);

  const modeButtons = new Map<Mode, HTMLElement>();
  const MODE_DEFS: { mode: Mode; emoji: string; label: string; aria: string }[] = [
    { mode: 'free', emoji: '🎹', label: 'Chơi tự do', aria: 'Chơi tự do' },
    { mode: 'song', emoji: '🎵', label: 'Hát theo bài', aria: 'Mèo hát theo bài' },
    { mode: 'scale', emoji: '🪜', label: 'Đếm mèo', aria: 'Đếm mèo từ thấp đến cao' },
  ];
  for (const m of MODE_DEFS) {
    const b = h(
      'button',
      { class: 'cb-btn', type: 'button', 'data-mode': m.mode, 'aria-label': m.aria },
      h('span', { class: 'cb-emoji' }, m.emoji),
      h('span', { class: 'cb-label' }, m.label),
    );
    makeTappable(b, () => chooseMode(m.mode), { ctx, cooldownMs: 250 });
    modeButtons.set(m.mode, b);
    modeBar.append(b);
  }

  const photoBtn = h(
    'button',
    { class: 'cb-btn', type: 'button', 'data-act': 'face', 'aria-label': 'Ảnh làm mặt mèo', hidden: true },
    h('span', { class: 'cb-emoji' }, '📷'),
    h('span', { class: 'cb-label' }, 'Mặt mèo'),
  );
  makeTappable(photoBtn, () => openFacePicker(), { ctx, cooldownMs: 300 });
  modeBar.append(photoBtn);

  function syncButtons(): void {
    for (const [id, b] of styleButtons) b.classList.toggle('cb-on', playing && id === style.id);
    stopBtn.classList.toggle('cb-on', playing);
    const label = stopBtn.querySelector('.cb-label');
    const emoji = stopBtn.querySelector('.cb-emoji');
    if (label) label.textContent = playing ? 'Tắt nhạc' : 'Bật nhạc';
    if (emoji) emoji.textContent = playing ? '⏹️' : '▶️';
    stopBtn.setAttribute('aria-label', playing ? 'Tắt nhạc' : 'Bật nhạc');
    for (const [m, b] of modeButtons)
      b.classList.toggle('cb-on', m === mode && (m !== 'song' || !picker.hidden || guide !== null || finale));
    root.classList.toggle('cb-playing', playing);
    root.style.setProperty('--beat', `${Math.round(60000 / style.bpm)}ms`);
  }

  const setCaption = (text: string): void => {
    captionText.textContent = text;
  };
  const setProgress = (p: number): void => {
    progressFill.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
  };

  /**
   * The game is for listening: the voice never talks over the cats or the band. It
   * speaks only at a big moment (the first time in, a new cat or song, a song
   * finished), a few words each, never when a cat is tapped or a mode is chosen.
   */
  function say(text: string): void {
    void sayText(ctx, text);
  }

  /* ------------------------------------------------- family photo faces */

  function applyPhotos(list: Photo[]): void {
    photoList = list;
    photoBtn.hidden = list.length === 0;
    // A photo a parent removed leaves its cat with the cat's own face.
    const faces: Record<string, string> = {};
    for (const [seat, id] of Object.entries(save.faces)) if (list.some((p) => p.id === id)) faces[seat] = id;
    if (Object.keys(faces).length !== Object.keys(save.faces).length) save = { ...save, faces };
    if (alive) drawCats();
  }

  function openFacePicker(): void {
    if (closePicker || photoList.length === 0) return;
    touched = true;
    ctx.hint.touch();
    ctx.audio.tick();
    const choices: PickerChoice[] = photoList.map((p, i) => ({ id: p.id, url: p.url, label: `Ảnh ${i + 1}` }));
    choices.push({ id: 'none', emoji: '🐱', label: 'Mặt mèo như cũ' });
    closePicker = showPhotoPicker(ctx.stage, choices, (choice) => {
      closePicker = null;
      if (!alive || !choice) return;
      if (choice.id === 'none') {
        assigning = null;
        save = { ...save, faces: {} };
        storeCatSave(save);
        drawCats();
        setCaption('Mèo có mặt mèo như cũ');
        return;
      }
      assigning = choice.id;
      setCaption('📷 Chạm vào mèo muốn đeo mặt này');
    });
  }

  void ctx.photos
    .list()
    .then(applyPhotos)
    .catch(() => undefined);
  const offPhotos = ctx.photos.onChange(applyPhotos);

  /* ----------------------------------------------------- floating notes */

  const particles: Particle[] = [];
  let stopFrames: (() => void) | null = null;

  function spawnGlyph(cat: number): void {
    const cell = cells[cat];
    if (!cell) return;
    const max = perf.low ? 3 : 9;
    while (particles.length >= max) particles.shift()?.el.remove();
    const rootBox = root.getBoundingClientRect();
    const box = cell.getBoundingClientRect();
    const el = h('span', { class: 'cb-glyph' }, GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? '♪');
    el.style.color = NOTE_COLORS[cat] ?? '#f59e0b';
    floaty.append(el);
    particles.push({
      el,
      x: box.left - rootBox.left + box.width * (0.35 + Math.random() * 0.3),
      y: box.top - rootBox.top + box.height * 0.35,
      vx: (Math.random() - 0.5) * 36,
      vy: -(70 + Math.random() * 40),
      life: 1,
    });
    if (!stopFrames) {
      stopFrames = onFrame((_now, dt) => {
        const s = dt / 1000;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i] as Particle;
          p.life -= s / 1.1;
          p.x += p.vx * s;
          p.y += p.vy * s;
          if (p.life <= 0) {
            p.el.remove();
            particles.splice(i, 1);
            continue;
          }
          p.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
          p.el.style.opacity = String(Math.min(1, p.life * 1.6));
        }
        if (particles.length === 0) {
          stopFrames = null;
          return false;
        }
        return true;
      });
    }
  }

  /* ----------------------------------------------------------- singing */

  /** Cat `cat` meows its note (a little off for a flat). `soft` is a cat singing along on its own. */
  function sing(cat: number, semis = 0, soft = false): void {
    ctx.audio.pitched('meow', catHz(cat, semis), soft ? { gain: 0.6 } : undefined);
    const cell = cells[cat];
    if (!cell) return;
    cell.classList.add('cb-sing');
    const old = singTimers[cat];
    if (old) clearTimeout(old);
    singTimers[cat] = setTimeout(() => {
      singTimers[cat] = null;
      cell.classList.remove('cb-sing');
    }, SING_MS);
    replay(holders[cat] as HTMLElement, 'cb-hop');
    spawnGlyph(cat);
  }

  /* ----------------------------------------------------------- the band */

  function playBand(ev: BandEvent, beatMs: number): void {
    if (ev.kind === 'drum') {
      ctx.audio.drum(ev.drum);
    } else if (ev.kind === 'bass') {
      ctx.audio.note(ev.hz, Math.max(0.15, (ev.dur * beatMs) / 1000), 'bass');
    } else {
      for (const hz of ev.hz) ctx.audio.note(hz, Math.max(0.2, (ev.dur * beatMs) / 1000), ev.timbre);
    }
  }

  function scheduleBar(): void {
    if (!playing || !alive) return;
    const beatMs = 60000 / style.bpm;
    const start = nextBarMs;
    // A tune still being found gets drums only: no chord, so no clash with its next note.
    const chord = mode === 'song' ? null : (style.progression[bar % style.progression.length] ?? 'C');
    for (const ev of barEvents(style.id, chord, bar)) seq.at(start + ev.t * beatMs, () => playBand(ev, beatMs), 'bk');
    if (chord && harmonyBars > 0) {
      harmonyBars--;
      for (const hit of harmonyBar(chord)) seq.at(start + hit.t * beatMs, () => sing(hit.cat, 0, true), 'bk');
      for (const hit of chorusBar(chorus, chord)) seq.at(start + hit.t * beatMs + 60, () => sing(hit.cat, 0, true), 'bk');
      if (harmonyBars === 0) chorus = [];
    }
    nextBarMs += BEATS_PER_BAR * beatMs;
    bar++;
    seq.at(nextBarMs - beatMs * 0.6, scheduleBar, 'bk');
  }

  function startBacking(): void {
    seq.clear('bk');
    musicOff = false;
    playing = true;
    bar = 0;
    nextBarMs = seq.now() + 80;
    syncButtons();
    scheduleBar();
  }

  function stopBacking(): void {
    seq.clear('bk');
    musicOff = true;
    playing = false;
    harmonyBars = 0;
    chorus = [];
    syncButtons();
  }

  function pickStyle(id: StyleId): void {
    touched = true;
    ctx.hint.touch();
    style = styleById(id);
    ctx.audio.tick();
    if (!finale) startBacking();
    else syncButtons();
    setCaption(`${style.emoji} Nhạc ${style.name.toLowerCase()}`);
  }

  /* -------------------------------------------------------- the cats */

  function unlight(): void {
    for (const cell of cells) cell.classList.remove('cb-lit');
  }

  function light(): void {
    unlight();
    const cat = guide?.lit;
    root.classList.toggle('cb-guiding', cat !== null && cat !== undefined);
    if (cat !== null && cat !== undefined) cells[cat]?.classList.add('cb-lit');
  }

  function tapCat(cat: number): void {
    if (!alive) return;
    touched = true;
    ctx.hint.touch();
    taps[cat] = (taps[cat] ?? 0) + 1;

    if (assigning) {
      save = { ...save, faces: { ...save.faces, [String(cat)]: assigning } };
      assigning = null;
      storeCatSave(save);
      drawCats(cat);
      sing(cat);
      setCaption('🎉 Mèo đeo mặt mới và hát nè!');
      return;
    }

    if (mem && !finale) {
      tapMemory(cat);
      return;
    }

    if (mode === 'song' && guide && !finale) {
      const step = guide.step;
      const result = guide.tap(cat);
      if (result === 'wait') {
        // Not the lit cat: it sings its own note, and the tune waits. Nothing is wrong.
        sing(cat);
        replay(cells[guide.lit ?? 0] as HTMLElement, 'cb-nudge');
        return;
      }
      sing(cat, step?.semis ?? 0);
      setProgress(guide.progress);
      if (result === 'done') {
        unlight();
        playFinale();
        return;
      }
      if (guide.index % 8 === 0) ctx.audio.fx('sparkle');
      unlight();
      later(RELIGHT_MS, light);
      return;
    }

    if (!playing && !musicOff && mode === 'free') startBacking();
    sing(cat);
    if (harmonyBars > 0) {
      harmonyBars = HARMONY_BARS;
      chorus = joinChorus(chorus, cat);
    }
    tapCount++;
    if (mode === 'free' && !finale && (taps[cat] === 1 || tapCount % 5 === 0)) {
      const design = designs[cat];
      if (design) {
        setCaption(`${design.name} · số ${NUMBER_WORDS[cat]}`);
      }
    }
  }

  /* ------------------------------------------------- idle: they sing along */

  function onIdle(): void {
    if (!alive || !touched || finale) return;
    if (mem) {
      if (!mem.listening) playMemory(true);
      return;
    }
    if (mode === 'song' && guide) {
      // Help, never hurry: the lit cat hops, and the voice names the way.
      const lit = guide.lit;
      if (lit !== null) {
        replay(cells[lit] as HTMLElement, 'cb-nudge');
      }
      return;
    }
    if (mode !== 'free') return;
    if (!playing && !musicOff) startBacking();
    if (harmonyBars === 0) setCaption('🎶 Mèo hát bè theo nhạc!');
    harmonyBars = HARMONY_BARS;
  }
  ctx.hint.arm(onIdle, IDLE_MS);

  /* ------------------------------------------------------------ modes */

  function cancelFinale(): void {
    seq.clear('fin');
    finale = false;
  }

  function leaveSongs(): void {
    picker.hidden = true;
    guide = null;
    song = null;
    mem = null;
    seq.clear('mem');
    unlight();
    root.classList.remove('cb-guiding');
    setProgress(0);
  }

  function chooseMode(next: Mode): void {
    touched = true;
    ctx.hint.touch();
    ctx.audio.tick();
    seq.clear('scale');
    if (next === 'free') {
      cancelFinale();
      leaveSongs();
      mode = 'free';
      setCaption('Chạm vào mèo nhé!');
      if (playing) startBacking();
      syncButtons();
    } else if (next === 'song') {
      cancelFinale();
      openPicker();
    } else {
      cancelFinale();
      leaveSongs();
      mode = 'free';
      if (playing) startBacking();
      syncButtons();
      runScale();
    }
  }

  function openPicker(): void {
    leaveSongs();
    mode = 'song';
    renderPicker();
    picker.hidden = false;
    setCaption('Chọn một bài hát nhé!');
    if (playing) startBacking();
    syncButtons();
  }

  function renderPicker(): void {
    const nextNeed = SONG_UNLOCKS.find((s) => s.need > save.stars)?.need;
    const head = h(
      'div',
      { class: 'cb-picker-head' },
      h('span', { class: 'cb-chip' }, `⭐ ${save.stars}`),
      h('span', { class: 'cb-chip' }, `🐱 ${newCatsFor(save.stars)}/${NEW_DESIGNS.length} mèo mới`),
      nextNeed !== undefined ? h('span', { class: 'cb-chip cb-chip-soft' }, `Bài mới ở ⭐ ${nextNeed}`) : null,
    );
    const memBtn = h(
      'button',
      { class: 'cb-song cb-memory', type: 'button', 'data-song': 'memory', 'aria-label': 'Nhớ giai điệu: mèo hát, bé hát lại' },
      h('span', { class: 'cb-song-icon' }, '🧠'),
      h('span', { class: 'cb-song-title' }, 'Nhớ giai điệu: mèo hát, bé hát lại'),
    );
    makeTappable(memBtn, () => startMemory(), { ctx, cooldownMs: 300 });
    const grid = h('div', { class: 'cb-songs' }, memBtn);
    for (const entry of SONG_UNLOCKS) {
      const s = findSong(entry.id);
      if (!s) continue;
      const open = songUnlocked(entry.id, save.stars);
      const b = h(
        'button',
        {
          class: `cb-song${open ? '' : ' cb-locked'}`,
          type: 'button',
          'data-song': entry.id,
          'aria-label': open ? s.title : `${s.title}, cần ${entry.need} sao`,
        },
        h('span', { class: 'cb-song-icon' }, open ? s.icon : '🔒'),
        h('span', { class: 'cb-song-title' }, s.title),
        open ? null : h('span', { class: 'cb-song-need' }, `⭐ ${entry.need}`),
      );
      makeTappable(
        b,
        () => {
          touched = true;
          ctx.hint.touch();
          if (open) {
            startSong(s);
          } else {
            replay(b, 'cb-nudge');
            ctx.audio.pop(0.8);
          }
        },
        { ctx, cooldownMs: 300 },
      );
      grid.append(b);
    }
    picker.replaceChildren(head, grid);
  }

  function startSong(s: Song): void {
    song = s;
    steps = songSteps(s);
    guide = createGuide(steps);
    picker.hidden = true;
    setProgress(0);
    setCaption(`${s.icon} ${s.title}`);
    light();
    if (!musicOff) startBacking();
    syncButtons();
  }

  /** The whole tune, sung by the cats over the whole band. */
  function playFinale(): void {
    if (!song) return;
    finale = true;
    const s = song;
    const { events, totalMs } = buildFinale(s, style.id, steps);
    seq.clear('bk');
    harmonyBars = 0;
    chorus = [];
    setCaption('🎶 Cả dàn mèo hát!');
    syncButtons();
    const beatMs = 60000 / s.bpm;
    const base = seq.now() + 700;
    for (const e of events) {
      if ('cat' in e) seq.at(base + e.ms, () => sing(e.cat, e.semis), 'fin');
      else seq.at(base + e.ms, () => playBand(e.ev, beatMs), 'fin');
    }
    seq.at(base + totalMs + 500, endFinale, 'fin');
  }

  function endFinale(): void {
    finale = false;
    const before = newCatsFor(save.stars);
    const songsBefore = SONG_UNLOCKS.filter((x) => songUnlocked(x.id, save.stars)).length;
    save = { ...save, stars: save.stars + 1 };
    storeCatSave(save);
    ctx.addStar();
    void ctx.celebrate();
    const after = newCatsFor(save.stars);
    designs = designsFor(save.stars);
    const gotCat = after > before;
    if (gotCat) {
      const seat = designs.findIndex((d, i) => d.id !== designsFor(save.stars - 1)[i]?.id);
      drawCats(seat);
      const fresh = designs[seat];
      if (fresh) {
        setCaption(`🎉 Mèo mới! ${fresh.name}`);
        later(1900, () => say(`Mèo mới! ${fresh.say}.`));
      }
    } else if (SONG_UNLOCKS.filter((x) => songUnlocked(x.id, save.stars)).length > songsBefore) {
      setCaption('🎉 Bài hát mới!');
      later(1900, () => say('Có bài hát mới rồi.'));
    } else {
      setCaption('🎉 Giỏi quá!');
      later(1200, () => say('Giỏi quá.'));
    }
    later(gotCat ? 4200 : 3200, () => {
      if (mode === 'song' && !guide && !finale) openPicker();
    });
    guide = null;
    song = null;
    root.classList.remove('cb-guiding');
    setProgress(1);
    syncButtons();
  }

  /* ---------------------------------------------------- nhớ giai điệu */

  function startMemory(): void {
    touched = true;
    ctx.hint.touch();
    picker.hidden = true;
    const len = memoryStart(save.stars);
    mem = { seq: makeMemory(len), pos: 0, len, rounds: 0, listening: true };
    root.classList.add('cb-guiding');
    setProgress(0);
    syncButtons();
    playMemory(false);
  }

  /** The cats sing the phrase one by one; then it is the child's turn. */
  function playMemory(again: boolean): void {
    const m = mem;
    if (!m) return;
    m.pos = 0;
    m.listening = true;
    unlight();
    setCaption(again ? '👂 Nghe lại nhé' : '👂 Nghe mèo hát');
    seq.clear('mem');
    const base = seq.now() + (again ? 400 : 1800);
    m.seq.forEach((cat, k) => {
      seq.at(
        base + k * 760,
        () => {
          unlight();
          cells[cat]?.classList.add('cb-lit');
          sing(cat);
        },
        'mem',
      );
    });
    seq.at(
      base + m.seq.length * 760 + 100,
      () => {
        unlight();
        m.listening = false;
        setCaption(`🐱 Đến lượt bé! ${m.seq.length} nốt`);
          },
      'mem',
    );
  }

  function tapMemory(cat: number): void {
    const m = mem;
    if (!m) return;
    if (m.listening) {
      sing(cat);
      return;
    }
    const r = memoryCheck(m.seq, m.pos, cat);
    sing(cat);
    if (r === 'wrong') {
      // Nothing lost: the cats sing it again.
      seq.clear('mem');
      seq.at(seq.now() + 700, () => playMemory(true), 'mem');
      return;
    }
    m.pos++;
    setProgress((m.rounds + m.pos / m.seq.length) / MEMORY_ROUNDS);
    if (r === 'ok') return;
    m.rounds++;
    ctx.audio.fx('sparkle');
    if (m.rounds >= MEMORY_ROUNDS) {
      m.listening = true;
      save = { ...save, stars: save.stars + 1 };
      storeCatSave(save);
      ctx.addStar();
      void ctx.celebrate();
      setCaption('🎉 Bé nhớ giỏi quá!');
      const before = newCatsFor(save.stars - 1);
      designs = designsFor(save.stars);
      if (newCatsFor(save.stars) > before) drawCats(designs.findIndex((d, i) => d.id !== designsFor(save.stars - 1)[i]?.id));
      mem = null;
      later(3000, () => {
        if (mode === 'song' && !mem && !guide && !finale) openPicker();
      });
      return;
    }
    m.len = Math.min(5, m.len + 1);
    m.seq = makeMemory(m.len);
    m.listening = true;
    setCaption('⭐ Đúng rồi! Nghe tiếp nhé');
    seq.at(seq.now() + 1200, () => playMemory(false), 'mem');
  }

  /** Count the cats up (or down) the scale, one voice each, lowest and biggest to highest and smallest. */
  function runScale(): void {
    const order = Array.from({ length: CAT_COUNT }, (_, i) => (scaleUp ? i : CAT_COUNT - 1 - i));
    const up = scaleUp;
    scaleUp = !scaleUp;
    setCaption(up ? '🪜 Từ mèo to đến mèo nhỏ' : '🪜 Từ mèo nhỏ đến mèo to');
    const base = seq.now() + 250;
    order.forEach((cat, k) => {
      seq.at(
        base + k * SCALE_STEP_MS,
        () => {
          sing(cat);
          unlight();
          cells[cat]?.classList.add('cb-lit');
          setCaption(`${designs[cat]?.name ?? 'Mèo'} · số ${NUMBER_WORDS[cat]}`);
        },
        'scale',
      );
    });
    seq.at(
      base + CAT_COUNT * SCALE_STEP_MS + 200,
      () => {
        unlight();
        setCaption(up ? 'Mèo nhỏ · tiếng cao' : 'Mèo to · tiếng trầm');
      },
      'scale',
    );
  }

  /* ------------------------------------------------------- quality & exit */

  const lowCls = (low: boolean) => root.classList.toggle('cb-low', low);
  lowCls(perf.low);
  const offPerf = onPerfChange(lowCls);

  // The one welcome, for a child who has not finished a song yet.
  if (save.stars === 0) later(700, () => say('Chạm vào mèo nhé.'));
  syncButtons();

  ctx.onCleanup(() => {
    alive = false;
    offPerf();
    offPhotos();
    closePicker?.();
    closePicker = null;
    stopFrames?.();
    stopFrames = null;
    seq.stop();
    ctx.hint.clear();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (let i = 0; i < singTimers.length; i++) {
      const t = singTimers[i];
      if (t) clearTimeout(t);
      singTimers[i] = null;
    }
    for (const p of particles) p.el.remove();
    particles.length = 0;
  });
}

const game: GameModule = { ...meta, start };
export default game;
