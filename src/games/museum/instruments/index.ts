/**
 * Playable instrument simulations, reusable by any game:
 *
 *   const inst = createInstrument('marimba', hostEl, ctx, { harmony: 'pentatonic' });
 *   inst.onNote((e) => …);   // every note, whoever played it
 *   inst.destroy();          // (also runs by itself when the child leaves the game)
 *
 * `kind` is any Timbre, DrumKind or InstrumentId in the repo. The board — which
 * zone sounds which note — is built by `layoutFor` (pure, tested); this file only
 * draws it, listens to fingers and plays the sounds.
 */
import type { InstVoice } from '../../../core/audio';
import './style.css';
import { onFrame } from '../../../core/frame';
import type { GameContext } from '../../../core/types';
import { createFx, hasTrail, holdsPress } from './fx';
import { clamp, thin, zonesAlong, type Crossing } from './fxmath';
import { layoutFor } from './layout';
import { inShape, shapeCenter } from './svg';
import { crossed, nearestLine, velocityFromGap } from './touch';
import { sound } from './voices';
import type { Board, InstrumentHandle, InstrumentKind, InstrumentOptions, NoteEvent, Voice, Zone } from './types';

export { ALL_KINDS, familyOf, layoutFor } from './layout';
export type * from './types';

const FALLBACK = { w: 360, h: 560 };
/** Families whose notes are struck with a stick: a mallet swings in. */
const MALLET = new Set(['bars', 'chimes', 'pan', 'kit', 'rack', 'gong', 'djembe']);
const MUTE_AFTER_MS = 380;
const STRUM_WAIT_MS = 90;
const STRUM_STAGGER_MS = 24;
/** Strings crossed by one swipe sound this far apart, so a fast swipe is a ripple of notes, not a burst. */
const SWIPE_GAP_MS = 16;
/** A slide plays at most this many zones per move, and a zone is not retriggered within the cooldown. */
const MAX_PER_MOVE = 9;
/** ...and the line of notes waiting to sound never grows past this. */
const MAX_QUEUE = 14;
const ZONE_COOLDOWN_MS = 55;
const BOW_RENEW_MS = 420;
const SHAKE_PX = 52;

interface Pointer {
  id: number;
  zone: Zone | null;
  x: number;
  y: number;
  /** When the finger was last seen moving, and how fast (px per ms, smoothed). */
  t: number;
  speed: number;
  startX: number;
  startY: number;
  moved: boolean;
  strumIdx: number;
  strumTimer: ReturnType<typeof setTimeout> | null;
  muteTimer: ReturnType<typeof setTimeout> | null;
  blowTimer: ReturnType<typeof setInterval> | null;
  lastBow: number;
  shakeAcc: number;
  shakeFlip: number;
  /** The zone this finger is holding down (a key, a hole, a place on the bowed string). */
  held: string | null;
}

export function createInstrument(
  kind: InstrumentKind,
  host: HTMLElement,
  ctx: GameContext,
  opts: InstrumentOptions = {},
): InstrumentHandle {
  const harmony = opts.harmony ?? 'free';
  let enabled = opts.enabled ?? true;
  let dead = false;
  let board: Board = layoutFor(kind, FALLBACK.w, FALLBACK.h, harmony);
  const listeners = new Set<(e: NoteEvent) => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const pointers = new Map<number, Pointer>();
  /** Sound handles per zone, so a finger resting on a gong can still it. */
  const live = new Map<string, InstVoice[]>();
  /** When each zone last sounded from a slide (so a finger wobbling on an edge does not stutter). */
  const lastSlide = new Map<string, number>();
  let lastHit: number | null = null;
  let chord = 'C';
  const covered: boolean[] = [];
  let shakeTurn = 0;

  const root = document.createElement('div');
  root.className = `inst inst-${board.family} inst-k-${kind}`;
  root.style.touchAction = 'none';
  host.replaceChildren(root);
  const svgHost = document.createElement('div');
  svgHost.className = 'inst-art';
  root.append(svgHost);
  /** Elements of each zone, found once per drawing. */
  let zoneMap = new Map<string, SVGElement[]>();

  function later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!dead) fn();
    }, ms);
    timers.add(t);
    return t;
  }

  function zoneEls(id: string): SVGElement[] {
    return zoneMap.get(id) ?? [];
  }

  function svgRoot(): SVGSVGElement | null {
    return svgHost.querySelector('svg');
  }

  const fx = createFx({ svg: svgRoot, board: () => board, later, zoneEls });

  function size(): { w: number; h: number } {
    const r = host.getBoundingClientRect();
    return r.width >= 40 && r.height >= 40
      ? { w: Math.round(r.width), h: Math.round(r.height) }
      : { w: board.w || FALLBACK.w, h: board.h || FALLBACK.h };
  }

  function draw(): void {
    svgHost.innerHTML = board.svg;
    zoneMap = new Map();
    svgHost.querySelectorAll<SVGElement>('[data-z]').forEach((el) => {
      const id = el.dataset.z!;
      const list = zoneMap.get(id);
      if (list) list.push(el);
      else zoneMap.set(id, [el]);
    });
    root.className = `inst inst-${board.family} inst-k-${kind}${board.portrait ? ' inst-portrait' : ''}${enabled ? '' : ' inst-off'}`;
    // restore state that lives in the drawing
    if (board.strum) selectChord(chord);
    board.holes?.forEach((id, i) => zoneEls(id).forEach((el) => el.classList.toggle('on', !!covered[i])));
    fx.rebuild();
    // fingers that were down are on a new drawing now: forget what they were holding
    for (const p of pointers.values()) p.held = null;
  }

  function build(): void {
    const s = size();
    if (!dead && (s.w !== board.w || s.h !== board.h || !svgRoot())) {
      board = layoutFor(kind, s.w, s.h, harmony);
      draw();
    }
  }
  draw();
  build();

  let ro: ResizeObserver | null = null;
  let onWinResize: (() => void) | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => build());
    ro.observe(host);
  } else {
    onWinResize = () => build();
    window.addEventListener('resize', onWinResize);
  }

  function emit(zoneId: string, voice: Voice | null, vel: number): void {
    const e: NoteEvent = { kind, zoneId, voice, vel };
    for (const cb of [...listeners]) cb(e);
  }

  // ---- sound ----

  function playVoice(zoneId: string, v: Voice, vel: number): void {
    const h = sound(ctx.audio, v, vel);
    if (h) {
      const list = live.get(zoneId) ?? [];
      list.push(h);
      if (list.length > 6) list.shift();
      live.set(zoneId, list);
    }
    emit(zoneId, v, vel);
  }

  function damp(zoneId: string): void {
    const list = live.get(zoneId);
    if (!list) return;
    for (const h of list) h.stop();
    live.delete(zoneId);
    zoneEls(zoneId).forEach((el) => el.classList.add('muted'));
    later(() => zoneEls(zoneId).forEach((el) => el.classList.remove('muted')), 600);
  }

  // ---- the frame: strings, trails and the bow move here ----

  const stopFrame = onFrame((now, dt) => {
    if (!dead) fx.tick(now, dt);
  });

  // ---- striking ----

  function velocity(): number {
    const now = performance.now();
    const v = velocityFromGap(lastHit === null ? null : now - lastHit);
    lastHit = now;
    return v;
  }

  /** How hard a slide plays: by the speed of the finger, gentler than a tap so a run stays smooth. */
  function swipeVel(p: Pointer): number {
    lastHit = performance.now();
    return Math.round(clamp(0.5 + Math.min(p.speed, 2.5) * 0.18, 0.5, 0.92) * 100) / 100;
  }

  function currentFingering(): Voice | null {
    return board.fingering ? board.fingering(board.holes!.map((_, i) => !!covered[i])) : null;
  }

  function strike(zone: Zone, x: number, y: number, vel: number, swipe = false): void {
    // the look comes first: it must be on screen in the very next frame
    if (zone.role !== 'strum') fx.hit(zone, x, y, vel, { swipe });
    if (zone.role === 'play' || zone.role === 'bow') {
      if (!swipe && zone.role === 'play' && MALLET.has(board.family)) fx.mallet(x, y);
      for (const v of zone.voices) playVoice(zone.id, v, vel);
    } else if (zone.role === 'shake') {
      const v = zone.voices[0];
      if (v) playVoice(zone.id, v, vel);
    } else if (zone.role === 'chord') {
      selectChord(zone.id.slice('chord:'.length));
      strumAll(vel * 0.75);
    } else if (zone.role === 'hole') {
      const i = board.holes!.indexOf(zone.id);
      covered[i] = !covered[i];
      zoneEls(zone.id).forEach((el) => el.classList.toggle('on', !!covered[i]));
      const v = currentFingering();
      if (v) playVoice(zone.id, v.t === 'note' ? { ...v, dur: 0.5 } : v, vel);
    } else if (zone.role === 'blow') {
      const v = currentFingering();
      if (v) playVoice(zone.id, v, vel);
    }
  }

  function selectChord(name: string): void {
    chord = name;
    svgHost.querySelectorAll<SVGElement>('.chord').forEach((el) => el.classList.toggle('sel', el.dataset.z === `chord:${name}`));
  }

  function playString(j: number, vel: number, at?: { x: number; y: number }): void {
    const v = board.strum?.chords[chord]?.[j];
    if (!v) return;
    fx.pluck(j, vel, at);
    playVoice(`string${j}`, v, vel);
  }

  function strumAll(vel: number, dir = 1, at?: { x: number; y: number }): void {
    const n = board.strum?.lines.length ?? 0;
    const first = dir > 0 ? 0 : n - 1;
    const last = dir > 0 ? n - 1 : 0;
    fx.sweep(first, last, STRUM_STAGGER_MS);
    for (let k = 0; k < n; k++) {
      const j = dir > 0 ? k : n - 1 - k;
      if (k === 0) playString(j, vel, at);
      else later(() => playString(j, vel, at), k * STRUM_STAGGER_MS);
    }
  }

  // ---- pointers ----

  function local(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const svg = svgRoot();
    const r = svg?.getBoundingClientRect();
    if (!r || r.width < 1) return { x: e.clientX, y: e.clientY };
    return { x: ((e.clientX - r.left) * board.w) / r.width, y: ((e.clientY - r.top) * board.h) / r.height };
  }

  function zoneAt(x: number, y: number): Zone | null {
    for (const z of board.zones) if (inShape(z.shape, x, y)) return z;
    return null;
  }

  /** Show which zone a finger is holding down, and let go of the one it left. */
  function hold(p: Pointer, zone: Zone | null): void {
    const id = zone && holdsPress(board, zone) ? zone.id : null;
    if (id === p.held) return;
    if (p.held) fx.release(p.held);
    p.held = id;
    if (id) fx.press(id);
  }

  function stopBlow(p: Pointer): void {
    if (!p.blowTimer) return;
    clearInterval(p.blowTimer);
    p.blowTimer = null;
    zoneEls('blow').forEach((el) => el.classList.remove('blowing'));
    fx.breath(false);
  }

  function startBlow(p: Pointer, zone: Zone, x: number, y: number, vel: number): void {
    strike(zone, x, y, vel);
    zoneEls('blow').forEach((el) => el.classList.add('blowing'));
    fx.breath(true);
    // The synth plays a note of fixed length, so keep renewing it while the finger stays.
    p.blowTimer = setInterval(() => {
      if (dead || !enabled) return stopBlow(p);
      const v = currentFingering();
      if (v) playVoice('blow', v, 0.8);
    }, 760);
  }

  function onDown(e: PointerEvent): void {
    if (!enabled || dead) return;
    e.preventDefault();
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom, or already captured */
    }
    requestMotion();
    const { x, y } = local(e);
    const zone = zoneAt(x, y);
    const p: Pointer = {
      id: e.pointerId,
      zone,
      x,
      y,
      t: performance.now(),
      speed: 0,
      startX: x,
      startY: y,
      moved: false,
      strumIdx: -1,
      strumTimer: null,
      muteTimer: null,
      blowTimer: null,
      lastBow: performance.now(),
      shakeAcc: 0,
      shakeFlip: 0,
      held: null,
    };
    pointers.set(e.pointerId, p);
    if (!zone) return;
    ctx.hint.touch();
    if (zone.role === 'strum') {
      const lines = board.strum!.lines;
      p.strumIdx = nearestLine(lines, board.strum!.axis === 'x' ? x : y);
      const vel = velocity();
      p.strumTimer = setTimeout(() => {
        p.strumTimer = null;
        if (!p.moved && !dead) strumAll(vel, 1, { x, y });
      }, STRUM_WAIT_MS);
      return;
    }
    const vel = velocity();
    hold(p, zone);
    if (zone.role === 'bow') fx.bowMove(p.id, x, y);
    if (zone.role === 'blow') startBlow(p, zone, x, y, vel);
    else strike(zone, x, y, vel);
    if (zone.mute) {
      p.muteTimer = setTimeout(() => {
        p.muteTimer = null;
        if (!p.moved) damp(zone.id);
      }, MUTE_AFTER_MS);
    }
  }

  /**
   * Notes of a slide wait in one line and are let out SWIPE_GAP_MS apart, in the order the
   * finger crossed them: a quick swipe is an even run of notes, never a burst, and never
   * more than the sound engine can take.
   */
  const queue: Array<() => void> = [];
  let draining = false;
  function enqueue(fn: () => void): void {
    queue.push(fn);
    if (queue.length > MAX_QUEUE) queue.splice(1, queue.length - MAX_QUEUE);
    if (!draining) drain();
  }
  function drain(): void {
    const fn = queue.shift();
    if (!fn) {
      draining = false;
      return;
    }
    draining = true;
    fn();
    later(drain, SWIPE_GAP_MS);
  }

  /** Sound the zones one stretch of a slide crossed: at most `MAX_PER_MOVE`, one after another. */
  function slideInto(p: Pointer, crossings: Crossing[], only: (z: Zone) => boolean): void {
    const list = thin(
      crossings.filter((c) => only(c.zone)),
      MAX_PER_MOVE,
    );
    list.forEach((c) => {
      const go = (): void => {
        const now = performance.now();
        if (now - (lastSlide.get(c.zone.id) ?? -1e9) < ZONE_COOLDOWN_MS) return;
        lastSlide.set(c.zone.id, now);
        strike(c.zone, c.x, c.y, swipeVel(p), true);
      };
      enqueue(go);
    });
  }

  function onMove(e: PointerEvent): void {
    const p = pointers.get(e.pointerId);
    if (!p || !enabled || dead) return;
    // a fast finger reports many positions between frames: use them all, so nothing is skipped
    const batch = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (batch.length > 1) for (const c of batch) step(p, local(c));
    else step(p, local(e));
  }

  function step(p: Pointer, to: { x: number; y: number }): void {
    const { x, y } = to;
    const ax = p.x;
    const ay = p.y;
    const dist = Math.hypot(x - ax, y - ay);
    if (dist === 0) return;
    const now = performance.now();
    const dt = Math.max(1, now - p.t);
    p.speed += (dist / dt - p.speed) * 0.4;
    p.t = now;
    p.x = x;
    p.y = y;
    const dx = x - ax;
    const dy = y - ay;
    if (!p.moved && Math.hypot(x - p.startX, y - p.startY) > 9) {
      p.moved = true;
      if (p.muteTimer) clearTimeout(p.muteTimer);
      p.muteTimer = null;
    }
    const zone = zoneAt(x, y);
    if (p.moved && hasTrail(board)) {
      // the harmonica's light runs along the row, whatever height the finger is at
      let tx = x;
      let ty = y;
      if (board.family === 'harmonica' && zone) {
        const c = shapeCenter(zone.shape);
        if (board.portrait) tx = c.x;
        else ty = c.y;
      }
      fx.trailMove(p.id, tx, ty);
    }
    if (p.zone?.role === 'strum' && board.strum) {
      if (!p.moved) return;
      if (p.strumTimer) clearTimeout(p.strumTimer);
      p.strumTimer = null;
      const st = board.strum;
      const axisX = st.axis === 'x';
      const idx = nearestLine(st.lines, axisX ? x : y);
      const vel = swipeVel(p);
      crossed(p.strumIdx, idx).forEach((j) => {
        const L = st.lines[j]!;
        const a = axisX ? ax : ay;
        const b = axisX ? x : y;
        const t = b === a ? 0.5 : clamp((L - a) / (b - a), 0, 1);
        const at = { x: ax + dx * t, y: ay + dy * t };
        enqueue(() => playString(j, vel, at));
      });
      p.strumIdx = idx;
      return;
    }
    if (p.zone?.role === 'blow') {
      if (zone?.role !== 'blow') stopBlow(p);
      return;
    }
    if (p.zone?.role === 'shake' && zone?.role === 'shake') {
      p.shakeAcc += Math.hypot(dx, dy);
      if (p.shakeAcc >= SHAKE_PX) {
        p.shakeAcc = 0;
        strike(zone, x, y, velocity());
      }
      return;
    }
    if (p.zone?.role === 'bow' || zone?.role === 'bow') {
      // the bow lies across the strings and rubs wherever the finger goes
      fx.bowMove(p.id, x, y);
      const stamp = performance.now();
      const entered = zonesAlong(board.zones, ax, ay, x, y, p.zone?.id ?? null);
      if (entered.length) {
        slideInto(p, entered, (z) => z.role === 'bow');
        p.lastBow = stamp;
      } else if (zone && stamp - p.lastBow > BOW_RENEW_MS) {
        p.lastBow = stamp;
        strike(zone, x, y, 0.8, true);
      }
      p.zone = zone ?? p.zone;
      hold(p, zone);
      return;
    }
    if (board.glide) {
      const entered = zonesAlong(board.zones, ax, ay, x, y, p.zone?.id ?? null);
      if (entered.length) {
        slideInto(p, entered, (z) => z.role === 'play');
        if (p.muteTimer) {
          clearTimeout(p.muteTimer);
          p.muteTimer = null;
        }
      }
      p.zone = zone && zone.role === 'play' ? zone : null;
      hold(p, p.zone);
    }
  }

  function onUp(e: PointerEvent): void {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (p.strumTimer) {
      // a quick tap lifted before the wait was over: strum now
      clearTimeout(p.strumTimer);
      p.strumTimer = null;
      if (!p.moved && !dead && enabled) strumAll(velocityFromGap(null), 1, { x: p.x, y: p.y });
    }
    if (p.muteTimer) clearTimeout(p.muteTimer);
    p.muteTimer = null;
    stopBlow(p);
    if (p.held) fx.release(p.held);
    p.held = null;
    fx.trailEnd(p.id);
    fx.bowEnd(p.id);
    try {
      root.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
  }

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);

  // ---- shaking the device ----

  let motionOn = false;
  let motionAsked = false;
  let lastShake = 0;
  const onMotion = (e: Event): void => {
    if (dead || !enabled) return;
    const a = (e as DeviceMotionEvent).accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
    const now = performance.now();
    if (Math.abs(mag - 9.8) > 7 && now - lastShake > 140) {
      lastShake = now;
      const z = board.zones[shakeTurn++ % board.zones.length];
      if (z && z.role === 'shake') {
        const c = shapeCenter(z.shape);
        strike(z, c.x, c.y, 0.9);
      }
    }
  };
  function requestMotion(): void {
    if (board.family !== 'shake' || motionAsked || typeof DeviceMotionEvent === 'undefined') return;
    motionAsked = true;
    const start = (): void => {
      if (dead || motionOn) return;
      window.addEventListener('devicemotion', onMotion);
      motionOn = true;
    };
    try {
      const req = (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
      if (typeof req === 'function')
        void req
          .call(DeviceMotionEvent)
          .then((r) => r === 'granted' && start())
          .catch(() => undefined);
      else start();
    } catch {
      /* no motion sensor: tapping and waving a finger still work */
    }
  }

  function destroy(): void {
    if (dead) return;
    dead = true;
    stopFrame();
    fx.destroy();
    ro?.disconnect();
    if (onWinResize) window.removeEventListener('resize', onWinResize);
    if (motionOn) window.removeEventListener('devicemotion', onMotion);
    for (const p of pointers.values()) {
      if (p.strumTimer) clearTimeout(p.strumTimer);
      if (p.muteTimer) clearTimeout(p.muteTimer);
      if (p.blowTimer) clearInterval(p.blowTimer);
    }
    pointers.clear();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const list of live.values()) for (const h of list) h.stop();
    live.clear();
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onUp);
    listeners.clear();
    root.remove();
  }
  ctx.onCleanup(destroy);

  return {
    kind,
    board: () => board,
    onNote(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    setEnabled(on) {
      enabled = on;
      root.classList.toggle('inst-off', !on);
      if (!on) for (const p of pointers.values()) stopBlow(p);
    },
    hit(zoneId, vel = 0.8) {
      const z = board.zones.find((q) => q.id === zoneId);
      if (!z || dead) return;
      const c = shapeCenter(z.shape);
      if (z.role === 'strum') strumAll(vel);
      else {
        strike(z, c.x, c.y, vel);
        if (holdsPress(board, z)) later(() => fx.release(z.id), 120);
      }
    },
    destroy,
  };
}
