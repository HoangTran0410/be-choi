/**
 * Tập vẽ: the trace game's pictures, drawn one of three ways — follow the dotted line,
 * join the dots, or rub the colour in. The drawing rules are the trace game's own
 * (modes.ts for the maths, scene.ts for one picture drawn one way); this file only
 * lays them out inside the workshop and keeps what the child finishes.
 */
import { h, replay } from '../../../core/dom';
import { toleranceFor, type Pt } from '../../trace/logic';
import { MODES as WAYS, toPixels, toUnit, type Box, type Mode as Way } from '../../trace/modes';
import { PICTURES } from '../../trace/pictures';
import { createScene, type Scene, type Step } from '../../trace/scene';
import type { Picture } from '../../trace/shapes';
import '../../trace/style.css';
import { svgToJpeg } from '../art';
import type { ModeController, ModeEnv } from '../env';
import { WAY_ICONS, WAY_NAMES } from '../icons';
import { pickNextPicture, pictureCount, slow } from '../progress';
import { fitPaper } from '../surface';
import { createScope, makeButton } from '../ui';

/** Remembered for the whole visit, so a child who likes dot-to-dot keeps getting dot-to-dot. */
let lastWay: Way = 'follow';

export function startPractice(env: ModeEnv): ModeController {
  const scope = createScope();
  const { ctx } = env;
  const seen = new Set<string>();
  let way: Way = lastWay;
  let pic: Picture = PICTURES[0]!;
  let scene: Scene | null = null;
  let box: Box = { x: 0, y: 0, size: 300 };
  let finishing = false;
  let pressed = false;

  const paper = h('div', { class: 'tp-paper dr-practice-paper' });
  const pen = h('div', { class: 'tp-pen' }, '🖍️');
  const field = h('div', { class: 'tp dr-practice' }, paper, pen);
  env.field.append(field);
  scope.add(() => field.remove());

  const size = (): { w: number; h: number } => ({ w: field.clientWidth || 400, h: field.clientHeight || 600 });
  const tol = (): number => toleranceFor(size().w, size().h) / box.size;

  function placePen(at: Pt | null): void {
    if (!at || way === 'color') {
      pen.style.opacity = '0';
      return;
    }
    const px = toPixels(box, at);
    pen.style.opacity = '1';
    pen.style.transform = `translate(${px.x}px, ${px.y}px)`;
  }

  function layout(): void {
    const { w, h: ht } = size();
    const f = fitPaper(w, ht, 1, 6);
    box = { x: f.x, y: f.y, size: f.w };
    paper.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.size}px;height:${box.size}px`;
    scene?.el.setAttribute('width', String(box.size));
    scene?.el.setAttribute('height', String(box.size));
    placePen(scene?.pen() ?? null);
  }

  function load(next: Picture, announce: boolean): void {
    scene?.destroy();
    pic = next;
    seen.add(next.id);
    field.style.background = next.bg;
    scene = createScene(next, way);
    paper.replaceChildren(scene.el);
    finishing = false;
    pressed = false;
    layout();
    placePen(null);
    if (announce) env.say(slow(`Mình vẽ ${next.name} nhé`));
    ctx.hint.arm(() => {
      const at = scene?.hint();
      if (at) {
        placePen(at);
        replay(pen, 'anim-wiggle');
      }
    });
  }

  const unlocked = (): Picture[] => PICTURES.slice(0, pictureCount(env.made(), PICTURES.length));

  function nextPicture(): Picture {
    const list = unlocked();
    const id = pickNextPicture(
      list.map((p) => p.id),
      seen,
      pic.id,
    );
    return list.find((p) => p.id === id) ?? PICTURES[0]!;
  }

  // ---- toolbar: the three ways, and the picture chooser ----
  const wayButtons = new Map<Way, HTMLElement>();
  for (const w of WAYS) {
    const icon = h('span', { class: 'dr-way-icon' });
    icon.innerHTML = WAY_ICONS[w];
    const b = makeButton(scope, {
      label: WAY_NAMES[w],
      content: icon,
      cls: 'dr-way',
      onTap: () => {
        if (finishing || w === way) return;
        way = w;
        lastWay = w;
        syncWays();
        ctx.audio.pop();
        load(pic, false);
      },
    });
    wayButtons.set(w, b);
  }
  function syncWays(): void {
    for (const [w, b] of wayButtons) {
      b.classList.toggle('selected', w === way);
      b.setAttribute('aria-pressed', String(w === way));
    }
  }

  const pictures = makeButton(scope, {
    label: 'chọn tranh',
    content: '🖼️',
    cls: 'dr-pictures',
    onTap: () => {
      ctx.audio.tick();
      const made = env.made();
      env.openPanel(
        PICTURES.map((p, i) => {
          const locked = i >= pictureCount(made, PICTURES.length);
          return {
            id: p.id,
            label: p.name,
            text: p.icon,
            locked,
            selected: p.id === pic.id,
            onPick: () => {
              if (locked) {
                ctx.audio.boing();
                env.say('Vẽ thêm tranh để mở tranh mới nhé!');
                return false;
              }
              if (!finishing) load(p, true);
            },
          };
        }),
        { wide: true },
      );
    },
  });

  env.setHud([env.hubButton(), pictures, env.notebookButton()]);
  env.setTools([...wayButtons.values()]);
  syncWays();

  // ---- finishing ----
  function finish(): void {
    finishing = true;
    const done = pic;
    scene?.reveal();
    placePen(null);
    ctx.hint.clear();
    ctx.audio.ding();
    env.say(slow(`Bé vẽ xong ${done.name} rồi`));
    const el = scene?.el;
    void (async () => {
      const thumb = el ? await svgToJpeg(el, done.bg) : null;
      await env.commit(thumb ? { mode: 'practice', thumb, w: 480, h: 480, title: done.name } : null);
      if (env.alive()) load(nextPicture(), true);
    })();
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

  const unit = (e: PointerEvent): Pt => {
    const r = field.getBoundingClientRect();
    return toUnit(box, { x: e.clientX - r.left, y: e.clientY - r.top });
  };
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
  const up = (): void => {
    pressed = false;
    scene?.release();
  };
  field.addEventListener('pointerup', up);
  field.addEventListener('pointercancel', up);

  let watch: ResizeObserver | null = null;
  const onResize = (): void => layout();
  if (typeof ResizeObserver === 'function') {
    watch = new ResizeObserver(onResize);
    watch.observe(field);
  } else {
    window.addEventListener('resize', onResize);
  }

  load(nextPicture(), true);

  return {
    // A half-drawn picture is not kept: only finished ones go in the book.
    flush() {},
    destroy() {
      ctx.hint.clear();
      watch?.disconnect();
      window.removeEventListener('resize', onResize);
      scene?.destroy();
      scope.dispose();
    },
  };
}
