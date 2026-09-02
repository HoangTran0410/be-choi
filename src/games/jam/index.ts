import type { Timbre } from '../../core/audio';
import { h, randInt, replay } from '../../core/dom';
import { onHold } from '../../core/hold';
import { noteFreq } from '../../core/music';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  BASS_HOLD,
  BEATS,
  COUNT_IN_BEATS,
  KITS,
  MAX_LAYERS,
  STEPS,
  TEMPO_EMOJIS,
  TEMPO_FACTORS,
  VOICE_EMOJI,
  eventsAt,
  playPad,
  quantize,
  stepMs,
  type Beat,
  type Kit,
  type Layer,
  type LoopEvent,
} from './logic';
import './style.css';

/** A tapped pad squashes for this long. */
const HIT_MS = 120;
/** A pad replayed from a loop glows for this long. */
const ECHO_MS = 100;
const STAR_MS = 900;
/** After the first loop, every this many pad hits earns a star. */
const HITS_PER_STAR = 100;
/** Long-press on ✖ to wipe every loop. */
const CLEAR_HOLD_MS = 700;
/** Tempo index of 🙂 (factor 1). */
const TEMPO_NORMAL = 1;

type Rec =
  | { phase: 'count'; left: number }
  | { phase: 'rec'; startStep: number; barStart: number; ticks: number; events: LoopEvent[] };

/**
 * Music stage: four kits of twelve multi-touch pads (drums, pentatonic notes
 * with six voices, animal voices, silly effects), three backing beats with a
 * soft bass line, a tempo button, and a one-bar looper. Tap ⏺, count 1·2·3·4
 * with the wood block, play for one bar, and the loop starts stacking under
 * whatever the child plays next — up to four layers, each mutable, all wiped
 * by holding ✖. First loop earns a star, then every hundred hits.
 */
function start(ctx: GameContext): void {
  const firstKit = KITS[0];
  const firstBeat = BEATS[0];
  if (!firstKit || !firstBeat) throw new Error('jam: KITS or BEATS is empty');

  let alive = true;
  let kit: Kit = firstKit;
  /** Selected voice per kit (only kits with `voices` use it). */
  const voiceIdx = new Map<string, number>();
  let beat: Beat | null = null;
  /** Tempo the clock runs at; stays put when the beat is switched off so loops keep their speed. */
  let bpm = firstBeat.bpm;
  let tempoIdx = TEMPO_NORMAL;
  const layers: Layer[] = [];
  let nextLayerId = 1;
  let clock: ReturnType<typeof setInterval> | null = null;
  let step = -1;
  let onBeat = false;
  let rec: Rec | null = null;
  let hits = 0;
  let starredLayer = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** One pending "remove class" timer per element and class, so rapid hits do not flicker. */
  const flashes = new Map<string, ReturnType<typeof setTimeout>>();
  /** Pad index under each active pointer; -1 when the finger is down but off the pads. */
  const active = new Map<number, number>();

  // ---- DOM ----
  const root = h('div', { class: 'jam' });

  const kitsBar = h('div', { class: 'jam-kits' });
  const kitBtns = new Map<string, HTMLButtonElement>();
  for (const k of KITS) {
    const btn = h(
      'button',
      { class: 'jam-kit', type: 'button', 'data-id': k.id, 'aria-label': k.name, 'aria-pressed': 'false' },
      k.emoji,
    );
    kitBtns.set(k.id, btn);
    kitsBar.append(btn);
  }
  const voiceBtn = h('button', { class: 'jam-voice', type: 'button', 'aria-label': 'Đổi nhạc cụ', hidden: true }, '🎹');
  const dancers = h(
    'div',
    { class: 'jam-dancers', 'aria-hidden': 'true' },
    ...['🐻', '🐰', '🐸'].map((e) => h('span', { class: 'jam-dancer' }, e)),
  );
  kitsBar.append(voiceBtn, dancers);

  const grid = h('div', { class: 'jam-pads' });
  const padEls: HTMLButtonElement[] = [];
  for (let i = 0; i < firstKit.pads.length; i++) {
    const el = h(
      'button',
      { class: 'jam-pad', type: 'button', 'data-index': i },
      h('span', { class: 'jam-pad-emoji' }, ''),
    );
    padEls.push(el);
    grid.append(el);
  }

  const bar = h('div', { class: 'jam-bar' });
  const beatBtns = new Map<string, HTMLButtonElement>();
  const stopBtn = h(
    'button',
    { class: 'jam-beat', type: 'button', 'data-id': 'stop', 'aria-label': 'Tắt nhịp', 'aria-pressed': 'true' },
    '⏹',
  );
  beatBtns.set('stop', stopBtn);
  bar.append(stopBtn);
  for (const b of BEATS) {
    const btn = h(
      'button',
      { class: 'jam-beat', type: 'button', 'data-id': b.id, 'aria-label': `Nhịp ${b.name}`, 'aria-pressed': 'false' },
      b.emoji,
    );
    beatBtns.set(b.id, btn);
    bar.append(btn);
  }
  const tempoBtn = h('button', { class: 'jam-tempo', type: 'button', 'aria-label': 'Nhanh chậm' }, TEMPO_EMOJIS[tempoIdx] ?? '🙂');
  const recBtn = h('button', { class: 'jam-rec', type: 'button', 'aria-label': 'Thu một vòng', 'aria-pressed': 'false' }, '⏺');
  const layersEl = h('div', { class: 'jam-layers jam-empty' });
  const clearBtn = h('button', { class: 'jam-clear', type: 'button', 'aria-label': 'Giữ để xoá hết' }, '✖');
  layersEl.append(clearBtn);
  bar.append(tempoBtn, recBtn, layersEl);

  const countEl = h('div', { class: 'jam-count', 'aria-hidden': 'true', hidden: true });

  root.append(kitsBar, grid, bar, countEl);
  ctx.stage.append(root);

  // ---- timers ----
  function later(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  }

  function clearTimers(): void {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    flashes.clear();
  }

  /** Add `cls` to `el` and remove it `ms` later; a repeat within that window restarts the timer. */
  function flash(el: HTMLElement, key: string, cls: string, ms: number): void {
    const k = `${key}:${cls}`;
    const pending = flashes.get(k);
    if (pending !== undefined) {
      clearTimeout(pending);
      timers.delete(pending);
    }
    el.classList.add(cls);
    const t = setTimeout(() => {
      timers.delete(t);
      flashes.delete(k);
      el.classList.remove(cls);
    }, ms);
    timers.add(t);
    flashes.set(k, t);
  }

  // ---- state helpers ----
  function factor(): number {
    return TEMPO_FACTORS[tempoIdx] ?? 1;
  }

  function curStepMs(): number {
    return stepMs(bpm, factor());
  }

  function voice(): Timbre {
    const voices = kit.voices;
    if (!voices || voices.length === 0) return 'piano';
    return voices[(voiceIdx.get(kit.id) ?? 0) % voices.length] ?? 'piano';
  }

  function renderKit(): void {
    root.dataset.kit = kit.id;
    for (const [id, btn] of kitBtns) {
      const on = id === kit.id;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    padEls.forEach((el, i) => {
      const pad = kit.pads[i];
      if (!pad) return;
      el.setAttribute('aria-label', pad.label);
      el.style.setProperty('--jam-color', pad.color);
      const emoji = el.firstElementChild;
      if (emoji) emoji.textContent = pad.emoji;
    });
    const hasVoices = !!kit.voices && kit.voices.length > 0;
    voiceBtn.hidden = !hasVoices;
    voiceBtn.textContent = VOICE_EMOJI[voice()];
  }

  function renderLayers(): void {
    for (const dot of layersEl.querySelectorAll('.jam-layer')) dot.remove();
    for (const layer of layers) {
      const k = KITS.find((x) => x.id === layer.kit);
      const dot = h(
        'button',
        {
          class: `jam-layer${layer.muted ? ' muted' : ''}`,
          type: 'button',
          'data-id': layer.id,
          'aria-label': layer.muted ? 'Bật vòng' : 'Tắt vòng',
          'aria-pressed': String(!layer.muted),
        },
        k?.emoji ?? '🎵',
      );
      layersEl.insertBefore(dot, clearBtn);
    }
    layersEl.classList.toggle('jam-empty', layers.length === 0);
    const full = layers.length >= MAX_LAYERS;
    recBtn.classList.toggle('jam-full', full);
    recBtn.setAttribute('aria-disabled', String(full));
  }

  function setBeatButtons(): void {
    for (const [id, btn] of beatBtns) {
      const on = beat ? id === beat.id : id === 'stop';
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  function star(): void {
    ctx.addStar();
    ctx.audio.jingle();
    const el = h('span', { class: 'jam-star' }, '⭐');
    root.append(el);
    later(STAR_MS, () => el.remove());
  }

  function showCount(n: number): void {
    countEl.hidden = false;
    countEl.textContent = String(n);
    replay(countEl, 'jam-count-pop');
  }

  function hideCount(): void {
    countEl.hidden = true;
    countEl.textContent = '';
    countEl.classList.remove('jam-count-pop');
  }

  function setRecUi(): void {
    recBtn.classList.toggle('jam-armed', rec?.phase === 'count');
    recBtn.classList.toggle('jam-recording', rec?.phase === 'rec');
    recBtn.setAttribute('aria-pressed', String(rec !== null));
    if (rec?.phase !== 'rec') recBtn.style.setProperty('--jam-progress', '0');
  }

  // ---- clock ----
  function shouldRun(): boolean {
    return beat !== null || layers.length > 0 || rec !== null;
  }

  function startClock(): void {
    if (clock !== null) return;
    step = -1;
    onBeat = false;
    clock = setInterval(tick, curStepMs());
    root.classList.add('jam-playing');
  }

  function stopClock(): void {
    if (clock === null) return;
    clearInterval(clock);
    clock = null;
    step = -1;
    onBeat = false;
    root.classList.remove('jam-playing', 'jam-onbeat');
    for (const el of padEls) el.classList.remove('jam-echo');
  }

  /** Start or stop the clock to match the state; restart the interval when the tempo changed. */
  function syncClock(retime = false): void {
    if (!alive) return;
    if (!shouldRun()) {
      stopClock();
      return;
    }
    if (clock === null) {
      startClock();
    } else if (retime) {
      // Keep the step: only the speed changes.
      clearInterval(clock);
      clock = setInterval(tick, curStepMs());
    }
    root.style.setProperty('--jam-beat', `${curStepMs() * 4}ms`);
  }

  function commitLayer(events: LoopEvent[]): void {
    rec = null;
    setRecUi();
    if (events.length === 0 || layers.length >= MAX_LAYERS) return;
    const first = events[0];
    const owner = first ? KITS.find((k) => k.pads.includes(first.pad)) : undefined;
    layers.push({ id: nextLayerId++, kit: owner?.id ?? kit.id, events, muted: false });
    renderLayers();
    if (!starredLayer) {
      starredLayer = true;
      star();
    }
  }

  function tick(): void {
    if (!alive) return;
    step = (step + 1) % STEPS;

    if (rec?.phase === 'rec') {
      rec.ticks++;
      recBtn.style.setProperty('--jam-progress', (rec.ticks / STEPS).toFixed(3));
      if (rec.ticks >= STEPS) commitLayer(rec.events);
    }
    if (rec?.phase === 'count' && step % 4 === 0) {
      if (rec.left > 0) {
        showCount(COUNT_IN_BEATS - rec.left + 1);
        ctx.audio.drum('wood');
        rec.left--;
      } else {
        rec = { phase: 'rec', startStep: step, barStart: Date.now(), ticks: 0, events: [] };
        hideCount();
        setRecUi();
      }
    }

    if (beat) {
      for (const kind of beat.steps[step] ?? []) ctx.audio.drum(kind);
      const bass = beat.bass[step];
      if (bass) {
        const freq = noteFreq(bass);
        if (freq > 0) ctx.audio.note(freq, (curStepMs() * BASS_HOLD) / 1000, 'bass');
      }
    }

    for (const ev of eventsAt(layers, step)) {
      playPad(ctx.audio, ev.pad, ev.voice ?? voice());
      const i = kit.pads.indexOf(ev.pad);
      const el = i >= 0 ? padEls[i] : undefined;
      if (el) flash(el, `pad${i}`, 'jam-echo', ECHO_MS);
    }

    if (step % 4 === 0) {
      onBeat = !onBeat;
      root.classList.toggle('jam-onbeat', onBeat);
    }

    // A finished or cancelled recording may have been the only reason to run.
    if (!shouldRun()) stopClock();
  }

  // ---- actions ----
  function hit(index: number): void {
    const pad = kit.pads[index];
    const el = padEls[index];
    if (!pad || !el) return;
    const v = voice();
    playPad(ctx.audio, pad, v);
    flash(el, `pad${index}`, 'jam-hit', HIT_MS);
    navigator.vibrate?.(8);
    if (rec?.phase === 'rec') {
      const rel = quantize(Date.now() - rec.barStart, curStepMs());
      const ev: LoopEvent = { step: (rec.startStep + rel) % STEPS, pad };
      if (pad.sound.kind === 'note') ev.voice = v;
      rec.events.push(ev);
    }
    hits++;
    if (hits % HITS_PER_STAR === 0) star();
  }

  function setKit(next: Kit): void {
    kit = next;
    renderKit();
  }

  function cycleVoice(): void {
    const voices = kit.voices;
    if (!voices || voices.length === 0) return;
    voiceIdx.set(kit.id, ((voiceIdx.get(kit.id) ?? 0) + 1) % voices.length);
    renderKit();
    replay(voiceBtn, 'jam-pop');
    // A short demo so the child hears the new voice at once.
    ctx.audio.note(noteFreq('C5'), 0.4, voice());
  }

  function setBeat(next: Beat | null): void {
    beat = next;
    if (next) bpm = next.bpm;
    setBeatButtons();
    syncClock(true);
  }

  function cycleTempo(): void {
    tempoIdx = (tempoIdx + 1) % TEMPO_FACTORS.length;
    tempoBtn.textContent = TEMPO_EMOJIS[tempoIdx] ?? '🙂';
    replay(tempoBtn, 'jam-pop');
    syncClock(true);
  }

  function toggleRec(): void {
    if (rec) {
      // Cancel the count-in or the bar under way.
      rec = null;
      hideCount();
      setRecUi();
      syncClock();
      return;
    }
    if (layers.length >= MAX_LAYERS) {
      ctx.audio.boing();
      replay(recBtn, 'anim-shake');
      return;
    }
    rec = { phase: 'count', left: COUNT_IN_BEATS };
    setRecUi();
    syncClock();
  }

  function toggleMute(id: number): void {
    const layer = layers.find((l) => l.id === id);
    if (!layer) return;
    layer.muted = !layer.muted;
    renderLayers();
  }

  function clearLayers(): void {
    if (layers.length === 0) return;
    layers.length = 0;
    renderLayers();
    ctx.audio.puff();
    syncClock();
  }

  // ---- pointer handling ----
  function padIndexOf(target: EventTarget | null): number {
    if (!(target instanceof Element)) return -1;
    const el = target.closest<HTMLElement>('.jam-pad');
    if (!el || !grid.contains(el)) return -1;
    const index = Number(el.dataset.index);
    return Number.isInteger(index) ? index : -1;
  }

  function padIndexAtPoint(x: number, y: number): number {
    if (typeof document.elementFromPoint !== 'function') return -1;
    return padIndexOf(document.elementFromPoint(x, y));
  }

  function onPadDown(e: PointerEvent): void {
    const index = padIndexOf(e.target);
    if (index < 0) return;
    e.preventDefault();
    // Touch pointers are implicitly captured by the pad; release so a sliding
    // finger can reach the neighbours (multi-touch stays per pointer).
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* not captured: nothing to release */
    }
    active.set(e.pointerId, index);
    hit(index);
  }

  function onMove(e: PointerEvent): void {
    const prev = active.get(e.pointerId);
    if (prev === undefined) return;
    const next = padIndexAtPoint(e.clientX, e.clientY);
    if (next === prev) return;
    active.set(e.pointerId, next);
    if (next >= 0) hit(next);
  }

  function onUp(e: PointerEvent): void {
    active.delete(e.pointerId);
  }

  function releaseAll(): void {
    active.clear();
  }

  function onKitsDown(e: Event): void {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('.jam-voice')) {
      e.preventDefault();
      cycleVoice();
      return;
    }
    const el = e.target.closest<HTMLElement>('.jam-kit');
    if (!el) return;
    e.preventDefault();
    const next = KITS.find((k) => k.id === el.dataset.id);
    if (!next || next === kit) return;
    ctx.audio.tick();
    setKit(next);
  }

  function onBarDown(e: Event): void {
    if (!(e.target instanceof Element)) return;
    const beatEl = e.target.closest<HTMLElement>('.jam-beat');
    if (beatEl) {
      e.preventDefault();
      ctx.audio.tick();
      setBeat(BEATS.find((b) => b.id === beatEl.dataset.id) ?? null);
      return;
    }
    if (e.target.closest('.jam-tempo')) {
      e.preventDefault();
      ctx.audio.tick();
      cycleTempo();
      return;
    }
    if (e.target.closest('.jam-rec')) {
      e.preventDefault();
      ctx.audio.tick();
      toggleRec();
      return;
    }
    const dot = e.target.closest<HTMLElement>('.jam-layer');
    if (dot) {
      e.preventDefault();
      ctx.audio.tick();
      toggleMute(Number(dot.dataset.id));
    }
    // ✖ is handled by the long-press helper.
  }

  grid.addEventListener('pointerdown', onPadDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', releaseAll);
  kitsBar.addEventListener('pointerdown', onKitsDown);
  bar.addEventListener('pointerdown', onBarDown);
  const disposeHold = onHold(clearBtn, CLEAR_HOLD_MS, clearLayers);

  renderKit();
  renderLayers();
  setBeatButtons();
  setRecUi();
  root.style.setProperty('--jam-beat', `${curStepMs() * 4}ms`);

  // Nothing is spoken here: iOS ducks Web Audio while TTS speaks. The nudge is visual.
  ctx.hint.arm(() => {
    if (!alive) return;
    if (layers.length === 0 && rec === null) {
      replay(recBtn, 'jam-nudge');
      return;
    }
    const emoji = padEls[randInt(0, padEls.length - 1)]?.firstElementChild;
    if (emoji) replay(emoji, 'jam-nudge');
  });

  ctx.onCleanup(() => {
    alive = false;
    stopClock();
    clearTimers();
    disposeHold();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', releaseAll);
    active.clear();
  });
}

const game: GameModule = { ...meta, start };
export default game;
