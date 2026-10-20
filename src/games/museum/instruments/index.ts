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
import { onFrame, perf } from '../../../core/frame';
import type { GameContext } from '../../../core/types';
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
const BOW_RENEW_MS = 420;
const SHAKE_PX = 52;

interface Pointer {
  id: number;
  zone: Zone | null;
  x: number;
  y: number;
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
  let lastHit: number | null = null;
  let chord = 'C';
  const covered: boolean[] = [];
  const vibrating = new Map<number, { amp: number; age: number }>();
  let shakeTurn = 0;

  const root = document.createElement('div');
  root.className = `inst inst-${board.family} inst-k-${kind}`;
  root.style.touchAction = 'none';
  host.replaceChildren(root);
  let svgHost = document.createElement('div');
  svgHost.className = 'inst-art';
  root.append(svgHost);
  let fx: SVGGElement | null = null;

  function later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!dead) fn();
    }, ms);
    timers.add(t);
    return t;
  }

  function size(): { w: number; h: number } {
    const r = host.getBoundingClientRect();
    return r.width >= 40 && r.height >= 40
      ? { w: Math.round(r.width), h: Math.round(r.height) }
      : { w: board.w || FALLBACK.w, h: board.h || FALLBACK.h };
  }

  function svgRoot(): SVGSVGElement | null {
    return svgHost.querySelector('svg');
  }

  function draw(): void {
    svgHost.innerHTML = board.svg;
    const svg = svgRoot();
    if (svg) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'fx');
      g.setAttribute('pointer-events', 'none');
      svg.append(g);
      fx = g;
    }
    root.className = `inst inst-${board.family} inst-k-${kind}${enabled ? '' : ' inst-off'}`;
    // restore state that lives in the drawing
    if (board.strum) selectChord(chord);
    board.holes?.forEach((id, i) => zoneEls(id).forEach((el) => el.classList.toggle('on', !!covered[i])));
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

  function zoneEls(id: string): SVGElement[] {
    return Array.from(svgHost.querySelectorAll<SVGElement>('[data-z]')).filter((el) => el.dataset.z === id);
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

  // ---- looks ----

  function flash(zoneId: string): void {
    for (const el of zoneEls(zoneId)) {
      el.classList.remove('hit');
      void el.getBoundingClientRect();
      el.classList.add('hit');
      later(() => el.classList.remove('hit'), 260);
    }
  }

  function sprite(markup: string, x: number, y: number, cls: string, ms: number): void {
    if (!fx || perf.low) return;
    if (fx.childElementCount > 14) fx.firstElementChild?.remove();
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', cls);
    g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    g.innerHTML = markup;
    fx.append(g);
    later(() => g.remove(), ms);
  }

  function touchFx(zone: Zone, x: number, y: number, vel: number): void {
    const r = 14 + vel * 26;
    sprite(`<circle class="ripple" r="${r.toFixed(0)}" fill="none" stroke="#fff" stroke-width="5" opacity=".85"/>`, x, y, 'ripple-g', 560);
    if (MALLET.has(board.family) && zone.role === 'play') {
      sprite(
        '<g class="mallet"><line x1="0" y1="0" x2="46" y2="-70" stroke="#92400e" stroke-width="7" stroke-linecap="round"/><circle cx="0" cy="0" r="12" fill="#f97316" stroke="#7c2d12" stroke-width="3"/></g>',
        x,
        y,
        'mallet-g',
        420,
      );
    }
  }

  function vibrate(j: number, amp: number): void {
    vibrating.set(j, { amp: Math.min(16, 5 + amp * 11), age: 0 });
  }

  const stopFrame = onFrame(
    (_now, dt) => {
      if (vibrating.size === 0 || dead) return;
      const svg = svgRoot();
      if (!svg) return;
      for (const [j, st] of [...vibrating]) {
        st.age += dt;
        const amp = st.amp * Math.exp(-st.age / 280);
        const el = svg.querySelector<SVGPathElement>(`path.str[data-s="${j}"]`);
        if (el) {
          const p = (el.dataset.p ?? '').split(',').map(Number);
          const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = p;
          if (amp < 0.4) el.setAttribute('d', `M${x1} ${y1}L${x2} ${y2}`);
          else {
            const len = Math.hypot(x2 - x1, y2 - y1) || 1;
            const nx = -(y2 - y1) / len;
            const ny = (x2 - x1) / len;
            const off = amp * Math.sin(st.age * 0.11) * 2;
            el.setAttribute('d', `M${x1} ${y1}Q${(x1 + x2) / 2 + nx * off} ${(y1 + y2) / 2 + ny * off} ${x2} ${y2}`);
          }
        }
        if (amp < 0.4) vibrating.delete(j);
      }
    },
    { maxFps: perf.low ? 30 : undefined },
  );

  // ---- striking ----

  function velocity(): number {
    const now = performance.now();
    const v = velocityFromGap(lastHit === null ? null : now - lastHit);
    lastHit = now;
    return v;
  }

  function currentFingering(): Voice | null {
    return board.fingering ? board.fingering(board.holes!.map((_, i) => !!covered[i])) : null;
  }

  function strike(zone: Zone, x: number, y: number, vel: number): void {
    if (zone.role === 'play' || zone.role === 'bow') {
      for (const v of zone.voices) playVoice(zone.id, v, vel);
      flash(zone.id);
      touchFx(zone, x, y, vel);
    } else if (zone.role === 'shake') {
      const v = zone.voices[0];
      if (v) playVoice(zone.id, v, vel);
      flash(zone.id);
      touchFx(zone, x, y, vel);
    } else if (zone.role === 'chord') {
      selectChord(zone.id.slice('chord:'.length));
      strumAll(vel * 0.75);
      flash(zone.id);
    } else if (zone.role === 'hole') {
      const i = board.holes!.indexOf(zone.id);
      covered[i] = !covered[i];
      zoneEls(zone.id).forEach((el) => el.classList.toggle('on', !!covered[i]));
      const v = currentFingering();
      if (v) playVoice(zone.id, v.t === 'note' ? { ...v, dur: 0.5 } : v, vel);
      flash(zone.id);
    } else if (zone.role === 'blow') {
      const v = currentFingering();
      if (v) playVoice(zone.id, v, vel);
      flash(zone.id);
    }
  }

  function selectChord(name: string): void {
    chord = name;
    svgHost.querySelectorAll<SVGElement>('.chord').forEach((el) => el.classList.toggle('sel', el.dataset.z === `chord:${name}`));
  }

  function playString(j: number, vel: number): void {
    const v = board.strum?.chords[chord]?.[j];
    if (!v) return;
    playVoice(`string${j}`, v, vel);
    vibrate(j, vel);
  }

  function strumAll(vel: number, dir = 1): void {
    const n = board.strum?.lines.length ?? 0;
    for (let k = 0; k < n; k++) {
      const j = dir > 0 ? k : n - 1 - k;
      if (k === 0) playString(j, vel);
      else later(() => playString(j, vel), k * STRUM_STAGGER_MS);
    }
    flash('strum');
  }

  // ---- pointers ----

  function local(e: PointerEvent): { x: number; y: number } {
    const svg = svgRoot();
    const r = svg?.getBoundingClientRect();
    if (!r || r.width < 1) return { x: e.clientX, y: e.clientY };
    return { x: ((e.clientX - r.left) * board.w) / r.width, y: ((e.clientY - r.top) * board.h) / r.height };
  }

  function zoneAt(x: number, y: number): Zone | null {
    for (const z of board.zones) if (inShape(z.shape, x, y)) return z;
    return null;
  }

  function stopBlow(p: Pointer): void {
    if (p.blowTimer) clearInterval(p.blowTimer);
    p.blowTimer = null;
    zoneEls('blow').forEach((el) => el.classList.remove('blowing'));
  }

  function startBlow(p: Pointer, zone: Zone, x: number, y: number, vel: number): void {
    strike(zone, x, y, vel);
    zoneEls('blow').forEach((el) => el.classList.add('blowing'));
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
        if (!p.moved && !dead) strumAll(vel, 1);
      }, STRUM_WAIT_MS);
      return;
    }
    const vel = velocity();
    if (zone.role === 'blow') startBlow(p, zone, x, y, vel);
    else strike(zone, x, y, vel);
    if (zone.mute) {
      p.muteTimer = setTimeout(() => {
        p.muteTimer = null;
        if (!p.moved) damp(zone.id);
      }, MUTE_AFTER_MS);
    }
  }

  function onMove(e: PointerEvent): void {
    const p = pointers.get(e.pointerId);
    if (!p || !enabled || dead) return;
    const { x, y } = local(e);
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (!p.moved && Math.hypot(x - p.startX, y - p.startY) > 9) {
      p.moved = true;
      if (p.muteTimer) clearTimeout(p.muteTimer);
      p.muteTimer = null;
    }
    const zone = zoneAt(x, y);
    if (p.zone?.role === 'strum' && board.strum) {
      if (!p.moved) return;
      if (p.strumTimer) clearTimeout(p.strumTimer);
      p.strumTimer = null;
      const idx = nearestLine(board.strum.lines, board.strum.axis === 'x' ? x : y);
      const vel = velocity();
      for (const j of crossed(p.strumIdx, idx)) playString(j, vel);
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
    if (zone?.role === 'bow') {
      const now = performance.now();
      if (zone.id !== p.zone?.id) {
        p.zone = zone;
        p.lastBow = now;
        strike(zone, x, y, velocity());
      } else if (now - p.lastBow > BOW_RENEW_MS) {
        p.lastBow = now;
        strike(zone, x, y, 0.8);
      }
      return;
    }
    if (board.glide && zone && zone.id !== p.zone?.id && zone.role === 'play') {
      p.zone = zone;
      strike(zone, x, y, velocity());
      if (zone.mute) {
        if (p.muteTimer) clearTimeout(p.muteTimer);
        p.muteTimer = null;
      }
    } else if (board.glide && !zone) {
      p.zone = null;
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
      if (!p.moved && !dead && enabled) strumAll(velocityFromGap(null), 1);
    }
    if (p.muteTimer) clearTimeout(p.muteTimer);
    p.muteTimer = null;
    stopBlow(p);
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
      else strike(z, c.x, c.y, vel);
    },
    destroy,
  };
}
