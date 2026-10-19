import { h, replay, shuffle, svgEl } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { TRACKS, advance, isHome, makePath, pointAt, sampleTrack, toBox, toleranceFor, type Path, type Pt } from './logic';
import './style.css';

/**
 * Follow the path: drag a finger along a curve to lead the bee home. The bee only ever moves
 * forward and only when the finger is somewhere near the path ahead of it; anywhere else
 * nothing happens. There is no wrong, only "keep going".
 */
function start(ctx: GameContext): void {
  const order = shuffle(TRACKS.map((_, i) => i));
  let round = 0;
  let alive = true;
  let done = false;
  let progress = 0;
  let path: Path = makePath([]);
  let lastNote = 0;

  const svgHost = h('div', { class: 'trace-svg' });
  const hive = h('div', { class: 'trace-hive' }, '🍯');
  const bee = h('div', { class: 'trace-bee' }, h('span', { class: 'trace-bee-body' }, '🐝'));
  const field = h('div', { class: 'trace' }, svgHost, hive, bee);
  ctx.stage.append(field);

  const size = () => ({ w: field.clientWidth || 400, h: field.clientHeight || 600 });

  function currentTrack(): number {
    return order[round % order.length]!;
  }

  /** Lay the current track out for the current stage size, keeping the bee's progress as a fraction. */
  function layout(keepFraction = 0): void {
    const { w, h: ht } = size();
    const landscape = w > ht;
    const pts = sampleTrack(TRACKS[currentTrack()]!).map((pt) => toBox(pt, w, ht, landscape));
    path = makePath(pts);
    progress = keepFraction * path.total;
    draw();
  }

  function pathData(points: readonly Pt[]): string {
    return points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
  }

  function draw(): void {
    const { w, h: ht } = size();
    const tol = toleranceFor(w, ht);
    const walked: Pt[] = [];
    for (let i = 0; i < path.pts.length && path.cum[i]! <= progress; i++) walked.push(path.pts[i]!);
    walked.push(pointAt(path, progress));
    const svg = svgEl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${ht}" width="${w}" height="${ht}" aria-hidden="true">` +
        `<path d="${pathData(path.pts)}" fill="none" stroke="#fef9c3" stroke-width="${tol * 1.1}" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>` +
        `<path d="${pathData(path.pts)}" fill="none" stroke="#a16207" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 14" opacity="0.7"/>` +
        `<path d="${pathData(walked)}" fill="none" stroke="#f59e0b" stroke-width="${Math.max(10, tol * 0.28)}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `</svg>`,
    );
    svgHost.replaceChildren(svg);
    const end = path.pts[path.pts.length - 1] ?? { x: 0, y: 0 };
    hive.style.transform = `translate(${end.x}px, ${end.y}px) translate(-50%, -50%)`;
    const at = pointAt(path, progress);
    bee.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)`;
  }

  function fingerAt(e: PointerEvent | MouseEvent): Pt {
    const r = field.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function touch(e: PointerEvent | MouseEvent): void {
    if (done) return;
    const { w, h: ht } = size();
    const next = advance(path, progress, fingerAt(e), toleranceFor(w, ht), path.total * 0.25);
    if (next <= progress) return;
    progress = next;
    ctx.hint.touch();
    draw();
    const step = Math.floor((progress / path.total) * 10);
    if (step > lastNote) {
      lastNote = step;
      ctx.audio.note(440 * Math.pow(2, step / 12), 0.12);
      navigator.vibrate?.(5);
    }
    if (isHome(path, progress)) arrive();
  }

  function arrive(): void {
    done = true;
    progress = path.total;
    draw();
    ctx.hint.clear();
    replay(bee, 'anim-bounce');
    replay(hive, 'anim-bounce');
    ctx.audio.ding();
    ctx.speak('Ong về tổ rồi!');
    void ctx.celebrate().then(() => {
      if (!alive) return;
      ctx.addStar();
      round++;
      begin();
    });
  }

  function begin(): void {
    done = false;
    lastNote = 0;
    layout(0);
    ctx.speak('Dẫn ong về tổ nào!');
    ctx.hint.arm(() => {
      replay(bee, 'anim-wiggle');
    });
  }

  field.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    touch(e);
  });
  field.addEventListener('pointermove', (e) => {
    if (e.buttons === 0 && e.pointerType === 'mouse') return;
    touch(e);
  });

  const onResize = () => {
    if (path.total > 0) layout(done ? 1 : progress / path.total);
  };
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    alive = false;
    window.removeEventListener('resize', onResize);
  });

  begin();
}

const game: GameModule = { ...meta, start };
export default game;
