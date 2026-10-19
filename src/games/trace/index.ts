import { h, replay, shuffle, wait } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { toleranceFor, type Pt } from './logic';
import { MODES, fitBox, toPixels, toUnit, type Box, type Mode } from './modes';
import { PICTURES } from './pictures';
import { createScene, type Scene, type Step } from './scene';
import './style.css';

/** Remembered for the whole visit, so a child who likes dot-to-dot keeps getting dot-to-dot. */
let lastMode: Mode = 'follow';

const ICONS: Record<Mode, string> = {
  follow:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 36C12 8 28 46 40 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="0.1 9"/><path d="M34 8l8 6-3 8z" fill="currentColor"/></svg>',
  dots: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 36L21 13L36 29L40 9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/><g fill="currentColor"><circle cx="11" cy="36" r="5.5"/><circle cx="21" cy="13" r="5.5"/><circle cx="36" cy="29" r="5.5"/><circle cx="40" cy="9" r="5.5"/></g></svg>',
  color:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5C24 5 10 21 10 31a14 14 0 0028 0C38 21 24 5 24 5z" fill="currentColor"/><path d="M17 31a7 7 0 007 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/></svg>',
};
const LABELS: Record<Mode, string> = { follow: 'Theo nét', dots: 'Nối chấm', color: 'Tô màu' };

/**
 * Tập vẽ: the child draws familiar pictures one of three ways — follow the dotted lines, join
 * the dots, or rub colour in. No order, no wrong: a touch that is nowhere useful does nothing.
 * The drawing rules live in modes.ts (pure) and scene.ts (one picture, one way).
 */
function start(ctx: GameContext): void {
  const order = shuffle(PICTURES.map((_, i) => i));
  let round = 0;
  let mode: Mode = lastMode;
  let alive = true;
  let finishing = false;
  let pressed = false;
  let scene: Scene | null = null;
  let box: Box = { x: 0, y: 0, size: 300 };

  const paper = h('div', { class: 'tp-paper' });
  const pen = h('div', { class: 'tp-pen' }, '🖍️');
  const field = h('div', { class: 'tp' }, paper, pen);
  const bar = h('div', { class: 'tp-bar' });
  ctx.stage.append(field, bar);

  const buttons = new Map<Mode, HTMLElement>();
  for (const m of MODES) {
    const b = h('button', { class: 'tp-mode', type: 'button', 'aria-label': LABELS[m] });
    b.innerHTML = ICONS[m];
    makeTappable(b, () => setMode(m), { ctx, cooldownMs: 250 });
    buttons.set(m, b);
    bar.append(b);
  }

  const size = () => ({ w: field.clientWidth || 400, h: field.clientHeight || 600 });
  const picture = () => PICTURES[order[round % order.length]!]!;
  const tol = () => {
    const { w, h: ht } = size();
    return toleranceFor(w, ht) / box.size;
  };

  function syncButtons(): void {
    for (const [m, b] of buttons) b.setAttribute('aria-pressed', String(m === mode));
  }

  function placePen(at: Pt | null): void {
    if (!at || mode === 'color') {
      pen.style.opacity = '0';
      return;
    }
    const px = toPixels(box, at);
    pen.style.opacity = '1';
    pen.style.transform = `translate(${px.x}px, ${px.y}px)`;
  }

  /** Fit the square paper in the stage (on load and on resize; progress lives in unit coordinates, so it just scales). */
  function layout(): void {
    const { w, h: ht } = size();
    box = fitBox(w, ht);
    bar.classList.toggle('is-side', w > ht);
    paper.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.size}px;height:${box.size}px`;
    scene?.el.setAttribute('width', String(box.size));
    scene?.el.setAttribute('height', String(box.size));
    placePen(scene?.pen() ?? null);
  }

  function load(announce: boolean): void {
    scene?.destroy();
    const pic = picture();
    field.style.background = pic.bg;
    scene = createScene(pic, mode);
    paper.replaceChildren(scene.el);
    finishing = false;
    pressed = false;
    layout();
    placePen(null);
    if (announce) ctx.speak(`Mình vẽ ${pic.name} nhé!`);
    ctx.hint.arm(() => {
      const at = scene?.hint();
      if (at) {
        placePen(at);
        replay(pen, 'anim-wiggle');
      }
    });
  }

  function setMode(m: Mode): void {
    if (finishing || m === mode) return;
    mode = m;
    lastMode = m;
    syncButtons();
    ctx.audio.pop();
    load(false);
  }

  function finish(): void {
    finishing = true;
    const pic = picture();
    scene?.reveal();
    placePen(null);
    ctx.hint.clear();
    ctx.audio.ding();
    ctx.speak(`Bé vẽ xong ${pic.name} rồi!`);
    void ctx
      .celebrate()
      .then(() => {
        if (!alive) return;
        ctx.addStar();
        return wait(700);
      })
      .then(() => {
        if (!alive) return;
        round++;
        load(true);
      });
  }

  function handle(step: Step): void {
    if (!step.moved) return;
    ctx.hint.touch();
    placePen(scene?.pen() ?? null);
    if (step.partDone) {
      ctx.audio.note(660, 0.12);
      navigator.vibrate?.(12);
    } else {
      navigator.vibrate?.(4);
    }
    if (step.complete) finish();
  }

  function unit(e: PointerEvent | MouseEvent): Pt {
    const r = field.getBoundingClientRect();
    return toUnit(box, { x: e.clientX - r.left, y: e.clientY - r.top });
  }

  field.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (finishing || !scene) return;
    pressed = true;
    try {
      field.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (synthetic event): fine */
    }
    handle(scene.press(unit(e), tol()));
  });
  field.addEventListener('pointermove', (e) => {
    if (!pressed || finishing || !scene) return;
    handle(scene.drag(unit(e), tol()));
  });
  const up = () => {
    pressed = false;
    scene?.release();
  };
  field.addEventListener('pointerup', up);
  field.addEventListener('pointercancel', up);

  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => {
    alive = false;
    window.removeEventListener('resize', onResize);
    scene?.destroy();
  });

  syncButtons();
  load(true);
}

const game: GameModule = { ...meta, start };
export default game;
