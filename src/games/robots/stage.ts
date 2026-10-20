/**
 * The stage: eight places for robots, the lights over them and the equaliser behind them.
 *
 * It only draws. Where the music is (`phase`), which notes just sounded (`events`) and which
 * robots have started playing (`activeIdx`) all come from the groove, so everything moves on the
 * same clock as the sound: robots land on the beat, flash when they play, and the lights breathe
 * with the bar. Nothing here keeps its own timer.
 */
import { h } from '../../core/dom';
import type { Target } from '../../core/drag';
import { pose } from './dance';
import { createRig, setFace, setPose, waveArms, type Rig } from './art';
import type { Level, Phase, PlayedHit, SongId, StepEvent } from './groove';
import { CAPACITY } from './lineup';
import type { RobotDef } from './robots';

const BARS_IN_EQ = 16;
const MAX_NOTES = 28;
const MAX_NOTES_LOW = 10;
const LEAVE_WAVE_MS = 900;
const LEAVE_WALK_MS = 450;
const TAU = Math.PI * 2;

interface Figure {
  slot: number;
  def: RobotDef;
  level: Level;
  rig: Rig;
  el: HTMLElement;
  glow: HTMLElement;
  dots: HTMLElement[];
  pulse: number;
  waiting: boolean;
  lastNote: number;
}

interface Leaving {
  fig: Figure;
  start: number;
}

interface Note {
  el: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  spin: number;
}

export interface FrameInfo {
  now: number;
  dt: number;
  phase: Phase | null;
  events: readonly StepEvent[];
  /** The latest groove step that has sounded, or −1. */
  activeIdx: number;
  /** The groove step at which a seat starts to sound (a robot waits for the next bar), or null. */
  startsAt(slot: number): number | null;
  /** The device is struggling: draw less. */
  low: boolean;
}

export interface Stage {
  readonly el: HTMLElement;
  readonly slotEls: readonly HTMLElement[];
  put(slot: number, def: RobotDef, level: Level): void;
  setLevel(slot: number, level: Level): void;
  /** Swap two seats' figures (either may be empty). */
  swap(a: number, b: number): void;
  /** Take the robot away with a goodbye wave. */
  leave(slot: number, now: number): void;
  /** Remove a robot with no goodbye (the stage is being reset). */
  clearAll(): void;
  /** Make the seats say "put someone here" (a robot on the shelf is picked). */
  canDrop(on: boolean): void;
  setHolding(slot: number, on: boolean): void;
  setSong(id: SongId): void;
  /** A family photo as the robot's face (`null` = the usual face). */
  setFace(slot: number, url: string | null): void;
  /** A family photo glowing behind the stage lights (`null` = none). */
  setBackdrop(url: string | null): void;
  setFinale(on: boolean): void;
  /** Where each seat is on screen, for drop tests. */
  targets(): Target[];
  figureEl(slot: number): HTMLElement | null;
  update(f: FrameInfo): void;
  /** Number of robots standing (not counting those leaving). */
  count(): number;
  dispose(): void;
}

const BEAM_COLORS = ['#fde047', '#f472b6', '#38bdf8', '#a3e635'];

/** Which equaliser bars a sound kicks, low sounds on the left and high on the right. */
export function bandsFor(hit: PlayedHit): number[] {
  const last = BARS_IN_EQ - 1;
  const spread = (c: number, w: number): number[] => {
    const out: number[] = [];
    for (let i = c - w; i <= c + w; i++) if (i >= 0 && i <= last) out.push(i);
    return out;
  };
  if (hit.drum) {
    switch (hit.drum) {
      case 'kick':
        return spread(1, 1);
      case 'tom':
        return spread(4, 1);
      case 'snare':
        return spread(8, 1);
      case 'clap':
      case 'wood':
      case 'cowbell':
        return spread(10, 1);
      case 'hat':
      case 'shaker':
      case 'ride':
      case 'triangle':
      case 'crash':
        return spread(14, 1);
    }
  }
  const m = hit.midi ?? 60;
  const c = Math.round(((Math.min(90, Math.max(38, m)) - 38) / 52) * last);
  return spread(c, 1);
}

export function createStage(): Stage {
  const slotEls: HTMLElement[] = [];
  const figs: Array<Figure | null> = Array.from({ length: CAPACITY }, () => null);
  const leaving: Leaving[] = [];
  const notes: Note[] = [];
  let finale = false;
  let eqTick = 0;

  const grid = h('div', { class: 'rb-grid' });
  for (let i = 0; i < CAPACITY; i++) {
    const slot = h(
      'div',
      { class: 'rb-slot', 'data-slot': i },
      h('div', { class: 'rb-pad' }),
      h('div', { class: 'rb-plus', 'aria-hidden': 'true' }, '+'),
    );
    slotEls.push(slot);
    grid.append(slot);
  }
  const lights = h('div', { class: 'rb-lights' });
  const beams: HTMLElement[] = BEAM_COLORS.slice(0, 3).map((c, i) => {
    const b = h('div', { class: 'rb-beam', style: `--bc:${c};left:${6 + i * 30}%` });
    lights.append(b);
    return b;
  });
  const floor = h('div', { class: 'rb-floor' });
  const eq = h('div', { class: 'rb-eq', 'aria-hidden': 'true' });
  const bars: HTMLElement[] = [];
  const eqLevel: number[] = Array.from({ length: BARS_IN_EQ }, () => 0);
  for (let i = 0; i < BARS_IN_EQ; i++) {
    const b = h('div', { class: 'rb-bar', style: `--i:${i}` });
    bars.push(b);
    eq.append(b);
  }
  const fx = h('div', { class: 'rb-fx', 'aria-hidden': 'true' });
  const away = h('div', { class: 'rb-away', 'aria-hidden': 'true' });
  const backdrop = h('div', { class: 'rb-backdrop', 'aria-hidden': 'true' });
  let hasBackdrop = false;
  const el = h('div', { class: 'rb-stage' }, backdrop, lights, floor, eq, grid, fx, away);

  function makeFigure(slot: number, def: RobotDef, level: Level): Figure {
    const rig = createRig(def.color, def.look);
    const glow = h('div', { class: 'rb-glow' });
    const dots = [1, 2, 3].map((n) => h('span', { class: n <= level ? 'rb-dot on' : 'rb-dot' }));
    const fig = h(
      'div',
      { class: 'rb-bot rb-popin', 'data-robot': def.id, style: `--c:${def.color}` },
      glow,
      rig.svg,
      h('div', { class: 'rb-dots' }, ...dots),
    );
    return { slot, def, level, rig, el: fig, glow, dots, pulse: 0, waiting: true, lastNote: -1e9 };
  }

  function paintSlot(slot: number): void {
    const f = figs[slot];
    const s = slotEls[slot] as HTMLElement;
    s.classList.toggle('has-bot', !!f);
    s.style.setProperty('--c', f ? f.def.color : 'transparent');
    if (f) s.dataset.robot = f.def.id;
    else delete s.dataset.robot;
  }

  function spawnNote(f: Figure, hit: PlayedHit, low: boolean): void {
    const cap = low ? MAX_NOTES_LOW : MAX_NOTES;
    if (notes.length >= cap) return;
    const slotEl = slotEls[f.slot] as HTMLElement;
    const sr = slotEl.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const glyph = hit.drum ? '✦' : Math.random() < 0.5 ? '♪' : '♫';
    const span = h('span', { class: 'rb-note', style: `color:${f.def.color}` }, glyph);
    fx.append(span);
    const x = sr.left - er.left + sr.width * (0.3 + Math.random() * 0.4);
    const y = sr.top - er.top + sr.height * 0.3;
    notes.push({
      el: span,
      x,
      y,
      vx: (Math.random() - 0.5) * 40,
      vy: -(50 + Math.random() * 50),
      life: 0,
      max: 900 + Math.random() * 400,
      spin: (Math.random() - 0.5) * 40,
    });
  }

  function onHit(slot: number, hit: PlayedHit, now: number, low: boolean): void {
    const f = figs[slot];
    if (!f) return;
    f.pulse = 1;
    if (now - f.lastNote > 110) {
      f.lastNote = now;
      spawnNote(f, hit, low);
    }
    const power = hit.drum ? 0.95 : 0.8;
    for (const b of bandsFor(hit)) eqLevel[b] = Math.min(1, Math.max(eqLevel[b] ?? 0, power));
  }

  function updateFigure(f: Figure, f2: FrameInfo, beat: number | null): void {
    f.waiting = (f2.startsAt(f.slot) ?? 0) > f2.activeIdx;
    f.pulse = Math.max(0, f.pulse - f2.dt / 260);
    f.el.classList.toggle('waiting', f.waiting);
    f.glow.style.opacity = f.pulse > 0.02 ? String(Math.round(f.pulse * 100) / 100) : '0';
    let y = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    if (beat === null || f.waiting) {
      // Not playing yet: a small impatient bob in time with the music, or a gentle breath when it is quiet.
      const t = beat !== null ? beat : f2.now / 500;
      const idle = pose('bob', t, 1, 0);
      y = idle.y * 0.5;
      rot = 0;
      sy = 1 + 0.012 * Math.sin(f2.now / 380 + f.slot);
      setPose(f.rig, null);
    } else {
      const p = pose(f.def.dance, beat, f.level, f.pulse);
      y = p.y;
      rot = p.rot;
      sx = p.sx;
      sy = p.sy;
      setPose(f.rig, p);
    }
    f.el.style.transform = `translateY(${(-y * 100).toFixed(1)}%) rotate(${rot.toFixed(1)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
  }

  function updateNotes(dt: number): void {
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i] as Note;
      n.life += dt;
      const k = n.life / n.max;
      if (k >= 1) {
        n.el.remove();
        notes.splice(i, 1);
        continue;
      }
      n.x += (n.vx * dt) / 1000;
      n.y += (n.vy * dt) / 1000;
      n.el.style.transform = `translate(${n.x.toFixed(1)}px,${n.y.toFixed(1)}px) rotate(${(n.spin * k).toFixed(0)}deg) scale(${(0.7 + 0.5 * Math.sin(Math.min(1, k * 3) * 1.57)).toFixed(2)})`;
      n.el.style.opacity = String(Math.round((1 - k * k) * 100) / 100);
    }
  }

  function updateLeaving(now: number): void {
    for (let i = leaving.length - 1; i >= 0; i--) {
      const l = leaving[i] as Leaving;
      const t = now - l.start;
      if (t >= LEAVE_WAVE_MS + LEAVE_WALK_MS) {
        l.fig.el.remove();
        leaving.splice(i, 1);
        continue;
      }
      if (t < LEAVE_WAVE_MS) {
        waveArms(l.fig.rig, t / 1000);
        l.fig.el.style.transform = `translateY(${(-Math.abs(Math.sin(t / 130)) * 4).toFixed(1)}%)`;
        l.fig.el.style.opacity = '1';
      } else {
        const k = (t - LEAVE_WAVE_MS) / LEAVE_WALK_MS;
        setPose(l.fig.rig, null);
        l.fig.el.style.transform = `translateY(${(k * 40).toFixed(1)}%) scale(${(1 - 0.4 * k).toFixed(3)})`;
        l.fig.el.style.opacity = String(Math.round((1 - k) * 100) / 100);
      }
    }
  }

  const stage: Stage = {
    el,
    slotEls,
    put(slot, def, level) {
      const old = figs[slot];
      if (old) old.el.remove();
      const fig = makeFigure(slot, def, level);
      figs[slot] = fig;
      (slotEls[slot] as HTMLElement).append(fig.el);
      paintSlot(slot);
      setPose(fig.rig, null);
    },
    setLevel(slot, level) {
      const f = figs[slot];
      if (!f) return;
      f.level = level;
      f.dots.forEach((d, i) => d.classList.toggle('on', i < level));
      f.el.classList.remove('rb-level');
      void f.el.offsetWidth;
      f.el.classList.add('rb-level');
    },
    swap(a, b) {
      const fa = figs[a] ?? null;
      const fb = figs[b] ?? null;
      figs[a] = fb;
      figs[b] = fa;
      if (fa) {
        fa.slot = b;
        (slotEls[b] as HTMLElement).append(fa.el);
      }
      if (fb) {
        fb.slot = a;
        (slotEls[a] as HTMLElement).append(fb.el);
      }
      paintSlot(a);
      paintSlot(b);
    },
    leave(slot, now) {
      const f = figs[slot];
      if (!f) return;
      figs[slot] = null;
      const er = el.getBoundingClientRect();
      const fr = f.el.getBoundingClientRect();
      f.el.classList.remove('waiting', 'rb-popin');
      f.el.style.cssText = `--c:${f.def.color};position:absolute;left:${(fr.left - er.left).toFixed(1)}px;top:${(fr.top - er.top).toFixed(1)}px;width:${fr.width.toFixed(1)}px;height:${fr.height.toFixed(1)}px`;
      f.glow.style.opacity = '0';
      away.append(f.el);
      leaving.push({ fig: f, start: now });
      paintSlot(slot);
    },
    clearAll() {
      for (let i = 0; i < figs.length; i++) {
        figs[i]?.el.remove();
        figs[i] = null;
        paintSlot(i);
      }
    },
    canDrop(on) {
      el.classList.toggle('can-drop', on);
    },
    setHolding(slot, on) {
      slotEls[slot]?.classList.toggle('holding', on);
    },
    setSong(id) {
      el.dataset.song = id;
    },
    setFace(slot, url) {
      const f = figs[slot];
      if (f) setFace(f.rig, url);
    },
    setBackdrop(url) {
      hasBackdrop = !!url;
      backdrop.style.backgroundImage = url ? `url("${url}")` : '';
      if (!url) backdrop.style.opacity = '0';
    },
    setFinale(on) {
      finale = on;
      el.classList.toggle('finale', on);
    },
    targets() {
      return slotEls.map((s, i) => {
        const r = s.getBoundingClientRect();
        return { id: String(i), rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
      });
    },
    figureEl: (slot) => figs[slot]?.el ?? null,
    count: () => figs.filter(Boolean).length,
    update(f) {
      for (const ev of f.events) {
        for (const hit of ev.hits) onHit(hit.slot, hit, f.now, f.low);
      }
      const n = figs.filter(Boolean).length;
      const playing = figs.filter((x) => x && (f.startsAt(x.slot) ?? 0) <= f.activeIdx).length;
      const beat = f.phase ? f.phase.beat : null;
      const thump = beat === null ? 0 : (1 + Math.cos(TAU * beat)) / 2;
      eqTick++;
      const half = f.low && eqTick % 2 === 0;

      for (const fig of figs) if (fig) updateFigure(fig, f, beat);
      updateLeaving(f.now);
      updateNotes(f.dt);

      if (half) return;
      // Lights: more robots, brighter and wider; the beams sweep slowly over four beats and breathe on each beat.
      const power = Math.min(1, playing / CAPACITY);
      const sweepBase = beat === null ? f.now / 1600 : (beat / 4) * TAU;
      beams.forEach((b, i) => {
        const on = playing > 0 && (i < Math.ceil(playing / 3) || finale);
        const angle = 18 * Math.sin(sweepBase + i * 2.1) * (finale ? 1.6 : 1);
        b.style.transform = `rotate(${angle.toFixed(1)}deg)`;
        b.style.opacity = on ? String(Math.round((0.18 + 0.5 * power + 0.18 * thump) * 100) / 100) : '0';
      });
      if (hasBackdrop) backdrop.style.opacity = String(Math.round((0.1 + 0.3 * power + 0.15 * thump * (playing > 0 ? 1 : 0)) * 100) / 100);
      floor.style.opacity = String(Math.round((0.12 + 0.55 * power + 0.2 * thump * (playing > 0 ? 1 : 0)) * 100) / 100);
      // Equaliser.
      const decay = f.dt / 520;
      for (let i = 0; i < BARS_IN_EQ; i++) {
        const v = Math.max(0, (eqLevel[i] ?? 0) - decay);
        eqLevel[i] = v;
        const idle = n > 0 ? 0.1 + 0.07 * Math.sin(f.now / 260 + i * 0.8) + 0.08 * thump * power : 0.05;
        const show = Math.min(1, Math.max(v, idle));
        (bars[i] as HTMLElement).style.transform = `scaleY(${show.toFixed(2)})`;
      }
    },
    dispose() {
      for (const f of figs) f?.el.remove();
      for (const n of notes) n.el.remove();
      notes.length = 0;
      leaving.length = 0;
      el.remove();
    },
  };
  return stage;
}
