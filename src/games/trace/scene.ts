import { isHome, pointAt, type Pt } from './logic';
import {
  deriveDots,
  dotsDone,
  fillReady,
  followTouch,
  hitDot,
  makeFillGrid,
  nextUnfinished,
  paintGrid,
  strokePath,
  walked,
  type DotStroke,
  type FillGrid,
  type Mode,
} from './modes';
import type { Picture } from './shapes';

const NS = 'http://www.w3.org/2000/svg';
const INK = 0.024;
const DOT_R = 0.042;
const GRAY = '#d6d3d1';

function node(tag: string, attrs: Record<string, string | number> = {}, parent?: Element): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.append(el);
  return el;
}

const d = (pts: readonly Pt[]): string => pts.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(4)} ${q.y.toFixed(4)}`).join(' ');
const polyPoints = (pts: readonly Pt[]): string => pts.map((q) => `${q.x.toFixed(4)},${q.y.toFixed(4)}`).join(' ');

export interface Step {
  /** Something visibly changed. */
  moved: boolean;
  /** A stroke (or a fill) was just finished. */
  partDone: boolean;
  /** The whole picture is finished. */
  complete: boolean;
}
const NOTHING: Step = { moved: false, partDone: false, complete: false };

/**
 * One picture being drawn one way. Everything lives in unit coordinates (0 … 1), so the SVG
 * scales with the stage by itself. Input arrives as unit points with the finger tolerance
 * (also in unit coordinates).
 */
export interface Scene {
  el: SVGSVGElement;
  press(at: Pt, tol: number): Step;
  drag(at: Pt, tol: number): Step;
  release(): void;
  complete(): boolean;
  /** Show the picture as it should look when done: all ink and all colour. */
  reveal(): void;
  /** Make the next thing to do blink; returns where the crayon should go. */
  hint(): Pt | null;
  /** Where the crayon is now (null: nowhere to show it). */
  pen(): Pt | null;
  /** Strokes (or fills) finished so far. */
  doneCount(): number;
  destroy(): void;
}

export function createScene(pic: Picture, mode: Mode): Scene {
  const svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 1 1');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('tp-svg');
  const defs = node('defs', {}, svg);
  const fillLayer = node('g', { class: 'tp-fills' }, svg);
  const inkLayer = node('g', { class: 'tp-ink' }, svg);
  const dotLayer = node('g', { class: 'tp-dots' }, svg);

  let isComplete = false;
  let pen: Pt | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const blink = (el: Element): void => {
    el.classList.remove('tp-hint');
    void (el as unknown as HTMLElement).getBoundingClientRect?.();
    el.classList.add('tp-hint');
    const t = setTimeout(() => {
      timers.delete(t);
      el.classList.remove('tp-hint');
    }, 2400);
    timers.add(t);
  };

  const inkAttrs = (color: string) => ({
    fill: 'none',
    stroke: color,
    'stroke-width': INK,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });

  /* Fills: hidden until the picture is done (follow, dots) or grey until rubbed (colour). */
  const fillEls = pic.fills.map((f) => node('polygon', { points: polyPoints(f.pts), fill: mode === 'color' ? GRAY : f.color }, fillLayer));
  const finishColour = (): void => {
    fillLayer.classList.add('is-on');
    fillEls.forEach((el, i) => el.setAttribute('fill', pic.fills[i]!.color));
  };

  const base: Pick<Scene, 'el' | 'release' | 'complete' | 'destroy'> = {
    el: svg,
    release() {},
    complete: () => isComplete,
    destroy() {
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };

  const finish = (): Step => {
    isComplete = true;
    return { moved: true, partDone: true, complete: true };
  };

  /* ------------------------------------------------------------ follow */
  if (mode === 'follow') {
    const paths = pic.strokes.map(strokePath);
    const progress = paths.map(() => 0);
    let active = -1;
    const guides = pic.strokes.map((s, i) => {
      const g = node('g', { class: 'tp-guide' }, inkLayer);
      const dd = d(paths[i]!.pts);
      node('path', { d: dd, fill: 'none', stroke: s.color, 'stroke-width': 0.055, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.13 }, g);
      node('path', { d: dd, fill: 'none', stroke: s.color, 'stroke-width': 0.012, 'stroke-linecap': 'round', 'stroke-dasharray': '0.001 0.03', opacity: 0.7 }, g);
      return g;
    });
    const inks = pic.strokes.map((s) => node('path', { d: '', ...inkAttrs(s.color) }, inkLayer));
    const homeAll = (): boolean => paths.every((p, i) => isHome(p, progress[i]!));

    const touch = (at: Pt, tol: number, fresh: boolean): Step => {
      if (isComplete) return NOTHING;
      if (fresh) active = -1;
      const r = followTouch(paths, progress, active, at, tol);
      if (!r) return NOTHING;
      active = r.index;
      const path = paths[r.index]!;
      const before = progress[r.index]!;
      progress[r.index] = r.progress;
      let partDone = false;
      if (isHome(path, r.progress)) {
        progress[r.index] = path.total;
        partDone = true;
        guides[r.index]!.setAttribute('display', 'none');
        active = -1;
      }
      inks[r.index]!.setAttribute('d', d(walked(path, progress[r.index]!)));
      pen = pointAt(path, progress[r.index]!);
      if (partDone && homeAll()) return finish();
      return { moved: progress[r.index]! > before || fresh, partDone, complete: false };
    };

    return {
      ...base,
      press: (at, tol) => touch(at, tol, true),
      drag: (at, tol) => touch(at, tol, false),
      release() {
        active = -1;
      },
      reveal() {
        paths.forEach((p, i) => {
          progress[i] = p.total;
          inks[i]!.setAttribute('d', d(p.pts));
          guides[i]!.setAttribute('display', 'none');
        });
        finishColour();
        pen = null;
      },
      hint() {
        const i = nextUnfinished(
          paths.map((p, k) => isHome(p, progress[k]!)),
          active,
        );
        if (i < 0) return null;
        blink(guides[i]!);
        return pointAt(paths[i]!, progress[i]!);
      },
      pen: () => pen,
      doneCount: () => paths.filter((p, i) => isHome(p, progress[i]!)).length,
    };
  }

  /* -------------------------------------------------------------- dots */
  if (mode === 'dots') {
    const ds: DotStroke[] = deriveDots(pic.strokes);
    const connected = ds.map(() => -1);
    let active = -1;
    const inks = pic.strokes.map((s) => node('path', { d: '', ...inkAttrs(s.color) }, inkLayer));
    const groups = ds.map((stroke, i) => {
      const g = node('g', {}, dotLayer);
      const color = pic.strokes[i]!.color;
      const dots = stroke.pts.map((pt, k) => {
        const dg = node('g', { class: 'tp-dot', transform: `translate(${pt.x.toFixed(4)} ${pt.y.toFixed(4)})` }, g);
        node('circle', { r: DOT_R, fill: '#fff', stroke: color, 'stroke-width': 0.012 }, dg);
        const t = node('text', { 'font-size': 0.046, fill: color, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-weight': 800 }, dg);
        t.textContent = String(k + 1);
        return dg;
      });
      return { g, dots };
    });
    const allDone = (): boolean => ds.every((s, i) => dotsDone(s, connected[i]!));
    const drawInk = (i: number): void => {
      const s = ds[i]!;
      const c = connected[i]!;
      const end = dotsDone(s, c) ? s.path.total : s.s[Math.max(0, c)]!;
      inks[i]!.setAttribute('d', c < 0 ? '' : d(walked(s.path, end)));
    };

    const touch = (at: Pt, tol: number, fresh: boolean): Step => {
      if (isComplete) return NOTHING;
      if (fresh) active = -1;
      const hit = hitDot(ds, connected, active, at, Math.max(tol * 0.8, 0.05));
      if (!hit) return NOTHING;
      const { stroke, dot } = hit;
      connected[stroke] = dot;
      active = stroke;
      const grp = groups[stroke]!;
      const color = pic.strokes[stroke]!.color;
      const dg = grp.dots[dot]!;
      dg.querySelector('circle')!.setAttribute('fill', color);
      dg.querySelector('text')!.setAttribute('fill', '#fff');
      drawInk(stroke);
      const partDone = dotsDone(ds[stroke]!, dot);
      pen = partDone ? ds[stroke]!.path.pts[ds[stroke]!.path.pts.length - 1]! : ds[stroke]!.pts[dot]!;
      if (partDone) {
        grp.g.setAttribute('display', 'none');
        active = -1;
        if (allDone()) return finish();
      }
      return { moved: true, partDone, complete: false };
    };

    return {
      ...base,
      press: (at, tol) => touch(at, tol, true),
      drag: (at, tol) => touch(at, tol, false),
      release() {
        active = -1;
      },
      reveal() {
        ds.forEach((s, i) => {
          connected[i] = s.pts.length - 1;
          drawInk(i);
          groups[i]!.g.setAttribute('display', 'none');
        });
        finishColour();
        pen = null;
      },
      hint() {
        const i = nextUnfinished(
          ds.map((s, k) => dotsDone(s, connected[k]!)),
          active,
        );
        if (i < 0) return null;
        const k = connected[i]! + 1;
        blink(groups[i]!.dots[k]!);
        return ds[i]!.pts[k]!;
      },
      pen: () => pen,
      doneCount: () => ds.filter((s, i) => dotsDone(s, connected[i]!)).length,
    };
  }

  /* ------------------------------------------------------------ colour */
  const grids: FillGrid[] = pic.fills.map((f) => makeFillGrid(f));
  fillEls.forEach((el) => {
    el.setAttribute('stroke', '#a8a29e');
    el.setAttribute('stroke-width', '0.006');
    el.setAttribute('stroke-dasharray', '0.012 0.016');
    el.setAttribute('stroke-linejoin', 'round');
  });
  const paints = pic.fills.map((f, i) => {
    const clip = node('clipPath', { id: `tp-clip-${i}` }, defs);
    node('polygon', { points: polyPoints(f.pts) }, clip);
    return node('g', { 'clip-path': `url(#tp-clip-${i})` }, fillLayer);
  });
  fillLayer.classList.add('is-on');
  // Outlines are always drawn in full.
  pic.strokes.forEach((s) => {
    node('path', { d: d(strokePath(s).pts), ...inkAttrs(s.color) }, inkLayer);
  });
  const brush = 0.075;
  let last: Pt | null = null;
  const fillDone = (i: number): void => {
    grids[i]!.done = true;
    fillEls[i]!.setAttribute('fill', pic.fills[i]!.color);
    fillEls[i]!.setAttribute('stroke', 'none');
    fillEls[i]!.classList.add('tp-pop');
    paints[i]!.setAttribute('display', 'none');
  };
  const touch = (at: Pt, tol: number, fresh: boolean): Step => {
    if (isComplete) return NOTHING;
    const from = fresh ? null : last;
    last = at;
    pen = null;
    let moved = false;
    let partDone = false;
    const r = Math.max(brush, tol * 0.5);
    grids.forEach((g, i) => {
      if (g.done) return;
      const fresh2 = paintGrid(g, from, at, r);
      if (fresh2.length === 0) return;
      moved = true;
      for (const c of fresh2) node('circle', { cx: g.cells[c]!.x.toFixed(4), cy: g.cells[c]!.y.toFixed(4), r: (g.cell * 0.8).toFixed(4), fill: pic.fills[i]!.color }, paints[i]);
      if (fillReady(g)) {
        fillDone(i);
        partDone = true;
      }
    });
    if (grids.length === 0 || (partDone && grids.every((g) => g.done))) return finish();
    return { moved, partDone, complete: false };
  };
  return {
    ...base,
    press: (at, tol) => touch(at, tol, true),
    drag: (at, tol) => touch(at, tol, false),
    release() {
      last = null;
    },
    reveal() {
      grids.forEach((g, i) => {
        if (!g.done) fillDone(i);
      });
    },
    hint() {
      const i = grids.findIndex((g) => !g.done);
      if (i < 0) return null;
      blink(fillEls[i]!);
      return null;
    },
    pen: () => null,
    doneCount: () => grids.filter((g) => g.done).length,
  };
}
