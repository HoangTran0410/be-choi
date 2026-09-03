import { createChecklist } from '../../core/chores';
import { h, replay } from '../../core/dom';
import { noteFreq, schedule, SONGS } from '../../core/music';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { allClean, CHEERS, JOBS, JOB_ICON, makeMouth, NUDGES, scrub, SCRUBS_TO_CLEAN, type Job, type Mouth, type Tooth } from './logic';
import './style.css';

/** Minimum gap between two brush ticks. */
const TICK_MS = 120;
/** Minimum gap between two foam bubbles. */
const FOAM_MS = 80;
const FOAM_LIFE_MS = 700;
const SPARKLE_MS = 900;
const SPLASH_COUNT = 6;
const SPLASH_MS = 800;
const SPLASH_STAGGER_MS = 40;
/** The 🥤 gives a puff of water, then the paste pops away. */
const POP_AFTER_PUFF_MS = 260;
const NEXT_ROUND_MS = 1200;
/** Breath between two loops of the brushing song. */
const LOOP_GAP_MS = 500;
/** The finger must travel this fraction of a tooth's width before the next stroke counts (real rubbing, not a swipe). */
const STROKE_FRACTION = 0.25;
const STROKE_MIN_PX = 6;
/** Hit-test slack around each tooth, as a fraction of its width. */
const TOOTH_SLACK = 0.15;
/** "Con cừu nhỏ": the brushing song that keeps the child scrubbing. */
const BRUSH_SONG = SONGS[2];

interface ToothRect {
  id: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
}

/**
 * Brush an animal's teeth: squeeze toothpaste on the brush, scrub every stained
 * tooth while a melody loops, rinse with the cup, sparkle, star.
 *
 * None of that waits its turn. The brush works with or without paste on it, the
 * cup splashes whenever it is pressed, and the animal only beams once all three
 * ticks along the top are green — in whatever order the child got round to them.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let round = 0;
  const chores = createChecklist(JOBS);
  /** True from the moment the animal beams until the next one arrives. */
  let finished = false;
  let mouth: Mouth | null = null;
  let teeth: Tooth[] = [];
  /** Tooth elements indexed by tooth id. */
  let toothEls: HTMLElement[] = [];
  /** Tooth boxes, cached on pointerdown (client coords, with slack). */
  let rects: ToothRect[] = [];
  /** Jobs already asked for out loud this round, so the hint does not repeat itself. */
  const nudged = new Set<Job>();
  let activePointer: number | null = null;
  let lastStroke: { x: number; y: number } | null = null;
  let lastTick = 0;
  let lastFoam = 0;
  let cancelMelody: (() => void) | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const face = h('div', { class: 'teeth-face' });
  const rowTop = h('div', { class: 'teeth-row teeth-row-top' });
  const rowBottom = h('div', { class: 'teeth-row teeth-row-bottom' });
  const mouthEl = h('div', { class: 'teeth-mouth' }, h('div', { class: 'teeth-tongue' }), rowTop, rowBottom);
  const scene = h('div', { class: 'teeth-scene' }, mouthEl);
  const tube = h('button', { class: 'btn-round teeth-tube', type: 'button', 'aria-label': 'Kem đánh răng' }, '🧴');
  const paste = h('span', { class: 'teeth-paste', hidden: true });
  const brush = h('div', { class: 'teeth-brush' }, '🪥', paste);
  const slot = h('div', { class: 'teeth-brush-slot' }, brush);
  const cup = h('button', { class: 'btn-round teeth-cup', type: 'button', 'aria-label': 'Súc miệng' }, '🥤');
  const tray = h('div', { class: 'g-tray teeth-tray' }, tube, slot, cup);
  /** One tick per job, so the child can see what is left without being told. */
  const ticks = new Map<Job, HTMLElement>();
  for (const job of JOBS) {
    ticks.set(job, h('div', { class: 'teeth-tick', 'data-job': job }, JOB_ICON[job]));
  }
  const todo = h('div', { class: 'teeth-todo' }, ...ticks.values());
  const wrap = h('div', { class: 'teeth' }, todo, face, scene, tray);
  ctx.stage.append(wrap);

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
  }

  /** Client coords → coords inside the wrapper. */
  function local(cx: number, cy: number): { x: number; y: number } {
    const r = wrap.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  }

  // ---- brushing song ----

  function stopMelody(): void {
    cancelMelody?.();
    cancelMelody = null;
  }

  function startMelody(): void {
    stopMelody();
    if (!BRUSH_SONG) return;
    cancelMelody = schedule(
      BRUSH_SONG.notes,
      BRUSH_SONG.bpm,
      (_i, n, ms) => {
        if (n.n === 'R') return;
        ctx.audio.note(noteFreq(n.n), (ms / 1000) * 0.8, 'xylo');
      },
      () => {
        cancelMelody = null;
        later(() => {
          if (!finished && !allClean(teeth)) startMelody();
        }, LOOP_GAP_MS);
      },
    );
  }

  // ---- the jobs, none of which waits for another ----

  /** Wiggle something still to do, so a stuck child has somewhere to look. */
  function armHint(): void {
    ctx.hint.arm(() => {
      const waiting = chores.left();
      const job = waiting[Math.floor(Math.random() * waiting.length)];
      if (!job) return;
      const tick = ticks.get(job);
      if (tick) replay(tick, 'anim-wiggle');
      if (job === 'paste') replay(tube, 'anim-wiggle');
      else if (job === 'rinse') replay(cup, 'anim-wiggle');
      else if (activePointer === null) {
        const dirty = toothEls.find((el) => el.classList.contains('teeth-dirty'));
        if (dirty) replay(dirty, 'anim-wiggle');
        replay(brush, 'anim-wiggle');
      }
      // Asking out loud once per job is a reminder; asking every six seconds is nagging.
      if (nudged.has(job)) return;
      nudged.add(job);
      ctx.speak(NUDGES[job]);
    });
  }

  /**
   * Tick a job off. Says so out loud, and sends the animal off beaming when this
   * was the last one outstanding.
   */
  function setJob(job: Job, done: boolean): void {
    if (!chores.set(job, done)) return;
    const tick = ticks.get(job);
    tick?.classList.toggle('done', done);
    if (tick && done) replay(tick, 'anim-bounce');
    if (done) ctx.speak(CHEERS[job]);
    if (done && chores.allDone()) void finish();
    else armHint();
  }

  // ---- teeth ----

  function buildTeeth(): void {
    rowTop.replaceChildren();
    rowBottom.replaceChildren();
    toothEls = [];
    for (const t of teeth) {
      const el = h('div', { class: `teeth-tooth teeth-${t.row}${t.dirty ? ' teeth-dirty' : ''}`, 'data-id': t.id });
      if (t.dirty) el.append(h('span', { class: 'teeth-stain' }, mouth?.stains[t.id] ?? '🍫'));
      (t.row === 'top' ? rowTop : rowBottom).append(el);
      toothEls[t.id] = el;
    }
  }

  function cacheRects(): void {
    rects = [];
    toothEls.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      const slack = r.width * TOOTH_SLACK;
      rects.push({ id, left: r.left - slack, top: r.top - slack, right: r.right + slack, bottom: r.bottom + slack, width: r.width });
    });
  }

  function toothAt(x: number, y: number): ToothRect | null {
    for (const r of rects) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return r;
    }
    return null;
  }

  function foam(cx: number, cy: number): void {
    const p = local(cx, cy);
    const size = (0.22 + Math.random() * 0.18).toFixed(2);
    const drift = Math.round((Math.random() - 0.5) * 36);
    const el = h('div', {
      class: 'teeth-foam',
      style: `left:${p.x}px;top:${p.y}px;--teeth-foam:${size};--teeth-drift:${drift}px`,
    });
    wrap.append(el);
    later(() => el.remove(), FOAM_LIFE_MS);
  }

  function sparkle(el: HTMLElement): void {
    const s = h('span', { class: 'teeth-sparkle' }, '✨');
    el.append(s);
    later(() => s.remove(), SPARKLE_MS);
  }

  function cleaned(id: number): void {
    const el = toothEls[id];
    if (el) {
      el.classList.remove('teeth-dirty');
      el.classList.add('teeth-clean');
      el.querySelector('.teeth-stain')?.remove();
      sparkle(el);
    }
    ctx.audio.ding();
    navigator.vibrate?.(15);
    if (allClean(teeth)) {
      stopMelody();
      setJob('brush', true);
    }
  }

  /** One brush stroke at client (x, y): foam and a tick on any tooth, progress on a dirty one. */
  function stroke(x: number, y: number): void {
    const r = toothAt(x, y);
    if (!r) return;
    const step = Math.max(STROKE_MIN_PX, r.width * STROKE_FRACTION);
    if (lastStroke && Math.hypot(x - lastStroke.x, y - lastStroke.y) < step) return;
    lastStroke = { x, y };
    const now = Date.now();
    if (now - lastFoam >= FOAM_MS) {
      lastFoam = now;
      foam(x, y);
    }
    if (now - lastTick >= TICK_MS) {
      lastTick = now;
      ctx.audio.tick();
    }
    navigator.vibrate?.(5);
    // The song only starts once there is real brushing going on, and stops when it is done.
    if (!cancelMelody && !allClean(teeth)) startMelody();
    const res = scrub(teeth, r.id);
    if (res.teeth === teeth) return;
    teeth = res.teeth;
    const t = teeth.find((tooth) => tooth.id === r.id);
    toothEls[r.id]?.style.setProperty('--teeth-progress', ((t?.scrubs ?? 0) / SCRUBS_TO_CLEAN).toFixed(2));
    if (res.cleaned) cleaned(r.id);
  }

  // ---- brush following the finger ----

  function showBrush(x: number, y: number): void {
    brush.style.left = `${x}px`;
    brush.style.top = `${y}px`;
    brush.classList.add('teeth-brush-active');
  }

  function release(): void {
    activePointer = null;
    brush.classList.remove('teeth-brush-active');
    brush.style.left = '';
    brush.style.top = '';
  }

  function onDown(e: PointerEvent): void {
    if (e.button > 0) return;
    ctx.hint.touch();
    // The brush works from the first second, with or without paste on it.
    if (finished || activePointer !== null) return;
    e.preventDefault();
    activePointer = e.pointerId;
    lastStroke = null;
    cacheRects();
    const p = local(e.clientX, e.clientY);
    showBrush(p.x, p.y);
    stroke(e.clientX, e.clientY);
  }

  function onMove(e: PointerEvent): void {
    if (e.pointerId !== activePointer) return;
    const p = local(e.clientX, e.clientY);
    showBrush(p.x, p.y);
    stroke(e.clientX, e.clientY);
  }

  function onUp(e: PointerEvent): void {
    if (e.pointerId !== activePointer) return;
    release();
  }

  function onBlur(): void {
    if (activePointer !== null) release();
  }

  // ---- tray ----

  tube.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    ctx.hint.touch();
    replay(tube, 'anim-bounce');
    if (finished || chores.done('paste')) return;
    paste.hidden = false;
    ctx.audio.pop();
    replay(brush, 'anim-wiggle');
    setJob('paste', true);
  });

  cup.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    ctx.hint.touch();
    if (finished) return;
    replay(cup, 'anim-bounce');
    rinse();
  });

  function splash(): void {
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const a = (i / SPLASH_COUNT) * Math.PI * 2;
      const dx = Math.round(Math.cos(a) * 18);
      const dy = Math.round(Math.sin(a) * 12 - 10);
      const delay = i * SPLASH_STAGGER_MS;
      const el = h('span', { class: 'teeth-splash', style: `--teeth-dx:${dx}vmin;--teeth-dy:${dy}vmin;animation-delay:${delay}ms` }, '💦');
      mouthEl.append(el);
      later(() => el.remove(), SPLASH_MS + delay);
    }
  }

  /** A mouthful of water, whenever the child fancies one. Always worth a splash. */
  function rinse(): void {
    for (const f of wrap.querySelectorAll('.teeth-foam')) f.remove();
    splash();
    ctx.audio.puff();
    later(() => ctx.audio.pop(), POP_AFTER_PUFF_MS);
    setJob('rinse', true);
  }

  async function finish(): Promise<void> {
    finished = true;
    stopMelody();
    release();
    paste.hidden = true;
    for (const el of toothEls) el.classList.add('teeth-shine');
    replay(face, 'anim-bounce');
    navigator.vibrate?.(20);
    ctx.speak('Răng sạch bong rồi! Giỏi quá!');
    ctx.hint.clear();
    await ctx.celebrate();
    if (!alive) return;
    ctx.addStar();
    later(() => {
      round++;
      play(mouth?.character.emoji);
    }, NEXT_ROUND_MS);
  }

  function play(exclude?: string): void {
    chores.reset();
    nudged.clear();
    finished = false;
    paste.hidden = true;
    lastStroke = null;
    for (const tick of ticks.values()) tick.classList.remove('done');
    mouth = makeMouth(round, Math.random, exclude);
    teeth = mouth.teeth;
    face.textContent = mouth.character.emoji;
    replay(face, 'anim-bounce');
    buildTeeth();
    for (const el of wrap.querySelectorAll('.teeth-foam, .teeth-splash')) el.remove();
    ctx.speak(`Đánh răng cho ${mouth.character.name} nào!`);
    armHint();
  }

  wrap.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', onBlur);

  ctx.onCleanup(() => {
    alive = false;
    stopMelody();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', onBlur);
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });

  play();
}

const game: GameModule = { ...meta, start };
export default game;
