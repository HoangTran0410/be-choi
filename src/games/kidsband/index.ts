import { h, replay, svgEl } from '../../core/dom';
import type { SampleKey } from '../../core/audio';
import { sayText } from '../../core/say';
import type { GameContext, GameModule } from '../../core/types';
import { BEAR_LOOKS, bearInner, instrumentSvg, VIEW } from '../show/art';
import { INSTRUMENTS, instOf, type InstId } from '../show/logic';
import {
  BAND_INSTS,
  BAND_SONGS,
  bandInst,
  buildPart,
  dueSteps,
  emptySlots,
  loopSteps,
  placeAt,
  SLOTS,
  songOf,
  stepMs,
  toggleOnStage,
  type StepEvent,
} from './logic';
import { meta } from './meta';
import './style.css';

const LOOKAHEAD_MS = 160;
const TICK_MS = 40;
const SLOP = 10;
const STARS_FROM = 3;
let uid = 0;

const SONG_ICONS: Record<string, string> = { butterfly: '🦋', backimthang: '🪜', twinkle: '⭐' };

/**
 * The child's band. Up to four instruments go on the stage (tap one on the shelf, or drag it onto a
 * place); each one is a bear that loops its own part of a tune: the melody, chords, a bass, a
 * drum beat. Tap a bear to put it to sleep or wake it, so the child mixes the band by ear.
 * Tunes are traditional Vietnamese songs and public-domain nursery melodies, harmonised from the melody.
 */
function start(ctx: GameContext): void {
  // Load every band instrument's recordings up front: a note played before they are decoded
  // falls back to the synth and sounds like another instrument in the middle of the tune.
  ctx.audio.preloadInstruments?.([
    ...BAND_INSTS.flatMap((b): SampleKey[] => {
      const snd = instOf(b.id).sound;
      return snd.t === 'note' ? [`note:${snd.timbre}`] : snd.t === 'inst' ? [`inst:${snd.id}`] : [];
    }),
    ...(['kick', 'snare', 'hat', 'tom', 'clap', 'crash', 'ride', 'shaker'] as const).map((d): SampleKey => `drum:${d}`),
  ]);
  const root = h('div', { class: 'band' });
  const songBar = h('div', { class: 'band-songs' });
  const songBtns = new Map<string, HTMLButtonElement>();
  for (const id of BAND_SONGS) {
    const s = songOf(id);
    const b = h('button', { class: 'band-song', type: 'button', 'data-song': id, 'aria-label': s.title }, SONG_ICONS[id] ?? s.icon);
    songBtns.set(id, b);
    songBar.append(b);
  }
  const stage = h('div', { class: 'band-stage' });
  const slotEls: HTMLElement[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const el = h('div', { class: 'band-slot', 'data-slot': i });
    slotEls.push(el);
    stage.append(el);
  }
  const tray = h('div', { class: 'band-tray' });
  const trayBtns = new Map<InstId, HTMLButtonElement>();
  for (const def of INSTRUMENTS) {
    const b = h(
      'button',
      { class: 'band-pick', type: 'button', 'data-inst': def.id, 'aria-label': def.name },
      svgEl(instrumentSvg(def.id, `t${++uid}`, 'band-pick-art')) as unknown as Node,
    );
    trayBtns.set(def.id, b);
    tray.append(b);
  }
  root.append(songBar, stage, tray);
  ctx.stage.append(root);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, fn: () => void): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  let slots = emptySlots();
  const asleep = new Set<InstId>();
  let songId = BAND_SONGS[0] as string;
  let song = songOf(songId);
  let seqTimer: ReturnType<typeof setInterval> | null = null;
  let startedAt = 0;
  let nextStep = 0;
  let loops = 0;
  const parts = new Map<string, StepEvent[][]>();

  function partOf(id: InstId): StepEvent[][] {
    const key = `${songId}:${id}`;
    let p = parts.get(key);
    if (!p) {
      p = buildPart(song, bandInst(id));
      parts.set(key, p);
    }
    return p;
  }

  function awake(): InstId[] {
    return slots.filter((s): s is InstId => s !== null && !asleep.has(s));
  }

  function playerEl(id: InstId): HTMLElement | null {
    return stage.querySelector<HTMLElement>(`.band-player[data-inst="${id}"]`);
  }

  // ---- stage drawing ----
  function renderSlots(): void {
    slotEls.forEach((el, i) => {
      const id = slots[i] ?? null;
      el.replaceChildren();
      el.classList.toggle('is-empty', id === null);
      if (id === null) {
        el.append(h('div', { class: 'band-spot', 'aria-hidden': 'true' }, '＋'));
        return;
      }
      const off = asleep.has(id);
      const look = BEAR_LOOKS[i % BEAR_LOOKS.length]!;
      const bear = svgEl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" class="band-bear" aria-hidden="true">${bearInner(look, off)}</svg>`);
      const art = svgEl(instrumentSvg(id, `b${++uid}`, 'band-inst'));
      const zzz = off ? h('span', { class: 'band-zzz', 'aria-hidden': 'true' }, 'z z') : null;
      const player = h('button', { class: `band-player${off ? ' is-off' : ''}`, type: 'button', 'data-inst': id, 'aria-label': instOf(id).name }, bear as unknown as Node, art as unknown as Node, zzz);
      el.append(player);
    });
    for (const [id, b] of trayBtns) b.classList.toggle('is-on', slots.includes(id));
    sync();
  }

  // ---- the music ----
  function stopSeq(): void {
    if (seqTimer !== null) clearInterval(seqTimer);
    seqTimer = null;
  }

  function startSeq(): void {
    if (seqTimer !== null) return;
    startedAt = Date.now() + 120;
    nextStep = 0;
    loops = 0;
    seqTimer = setInterval(tick, TICK_MS);
    tick();
  }

  /** Start or stop the loop depending on whether anybody is awake. */
  function sync(): void {
    if (awake().length > 0) startSeq();
    else stopSeq();
  }

  function playEvent(id: InstId, e: StepEvent, delay: number, durMs: number): void {
    const def = instOf(id);
    const vel = 0.5 + 0.4 * bandInst(id).gain;
    if (e.kind === 'drum') {
      ctx.audio.drum(e.drum, delay, vel);
      return;
    }
    const dur = Math.max(0.2, (e.steps * durMs) / 1000);
    if (def.sound.t === 'note') ctx.audio.note(e.freq, dur, def.sound.timbre, delay, vel);
    else if (def.sound.t === 'inst') ctx.audio.inst(def.sound.id, e.freq, vel, dur, delay, true);
  }

  function tick(): void {
    const len = loopSteps(song);
    const ms = stepMs(song);
    const now = Date.now();
    for (const { step, atMs } of dueSteps(startedAt, now, LOOKAHEAD_MS, ms, nextStep)) {
      nextStep = step + 1;
      const s = step % len;
      if (s === 0 && step > 0 && awake().length >= STARS_FROM) {
        loops++;
        ctx.addStar();
      }
      const delay = Math.max(0, (atMs - now) / 1000);
      const hit: InstId[] = [];
      for (const id of awake()) {
        const evs = partOf(id)[s] ?? [];
        for (const e of evs) playEvent(id, e, delay, ms);
        if (evs.length) hit.push(id);
      }
      if (hit.length) {
        after(Math.max(0, atMs - now), () => {
          for (const id of hit) {
            const el = playerEl(id);
            if (el) replay(el, 'is-hit');
          }
        });
      }
    }
  }

  function setSong(id: string): void {
    songId = id;
    song = songOf(id);
    for (const [k, b] of songBtns) b.classList.toggle('is-on', k === id);
    stopSeq();
    sync();
  }

  // ---- touching: tap, or drag onto a place ----
  interface Press {
    pointerId: number;
    id: InstId;
    from: 'tray' | 'player';
    x: number;
    y: number;
    ghost: HTMLElement | null;
  }
  let press: Press | null = null;

  function slotAt(x: number, y: number): number {
    for (let i = 0; i < slotEls.length; i++) {
      const r = slotEls[i]!.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return -1;
  }

  function overStage(x: number, y: number): boolean {
    const r = stage.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function markDrop(i: number): void {
    slotEls.forEach((el, k) => el.classList.toggle('is-drop', k === i));
  }

  function onDown(e: PointerEvent): void {
    const t = e.target as Element;
    const pick = t.closest<HTMLElement>('.band-pick');
    const pl = t.closest<HTMLElement>('.band-player');
    const el = pick ?? pl;
    if (!el) return;
    e.preventDefault();
    ctx.hint.touch();
    press = { pointerId: e.pointerId, id: el.dataset.inst as InstId, from: pick ? 'tray' : 'player', x: e.clientX, y: e.clientY, ghost: null };
  }

  function onMove(e: PointerEvent): void {
    const p = press;
    if (!p || e.pointerId !== p.pointerId) return;
    if (!p.ghost) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < SLOP) return;
      p.ghost = h('div', { class: 'band-ghost' }, svgEl(instrumentSvg(p.id, `d${++uid}`, 'band-ghost-art')) as unknown as Node);
      root.append(p.ghost);
    }
    p.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -60%)`;
    markDrop(slotAt(e.clientX, e.clientY));
  }

  function onUp(e: PointerEvent): void {
    const p = press;
    if (!p || e.pointerId !== p.pointerId) return;
    press = null;
    p.ghost?.remove();
    markDrop(-1);
    if (p.ghost) {
      const i = slotAt(e.clientX, e.clientY);
      if (i >= 0) {
        slots = placeAt(slots, p.id, i);
        ctx.audio.pop(1.2);
        renderSlots();
      } else if (p.from === 'player' && !overStage(e.clientX, e.clientY)) {
        slots = slots.map((s) => (s === p.id ? null : s));
        asleep.delete(p.id);
        renderSlots();
      }
      return;
    }
    if (p.from === 'tray') {
      const r = toggleOnStage(slots, p.id);
      if (r.result === 'full') {
        const b = trayBtns.get(p.id);
        if (b) replay(b, 'anim-wiggle');
        ctx.audio.boing();
        return;
      }
      slots = r.slots;
      asleep.delete(p.id);
      ctx.audio.pop(r.result === 'added' ? 1.3 : 0.8);
      renderSlots();
    } else {
      if (asleep.has(p.id)) asleep.delete(p.id);
      else asleep.add(p.id);
      ctx.audio.pop(asleep.has(p.id) ? 0.7 : 1.4);
      renderSlots();
    }
  }

  function onCancel(): void {
    press?.ghost?.remove();
    press = null;
    markDrop(-1);
  }

  root.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  songBar.addEventListener('pointerdown', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('.band-song');
    if (!el) return;
    e.preventDefault();
    ctx.hint.touch();
    ctx.audio.tick();
    setSong(el.dataset.song ?? songId);
  });

  for (const [k, b] of songBtns) b.classList.toggle('is-on', k === songId);
  renderSlots();

  let nudged = -1;
  ctx.hint.arm(() => {
    if (slots.every((s) => s === null)) {
      const b = [...trayBtns.values()][Math.floor(Math.random() * trayBtns.size)];
      if (b) replay(b, 'anim-wiggle');
      if (nudged !== (ctx.hint.epoch ?? 0)) {
        nudged = ctx.hint.epoch ?? 0;
        void sayText(ctx, 'Chạm vào nhạc cụ nào!');
      }
      return;
    }
    const sleepy = stage.querySelector<HTMLElement>('.band-player.is-off');
    if (sleepy) replay(sleepy, 'anim-wiggle');
  });

  ctx.onCleanup(() => {
    stopSeq();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    root.querySelector('.band-ghost')?.remove();
  });
}

const game: GameModule = { ...meta, start };
export default game;
