/**
 * Vẽ theo mẫu: a big faint picture on the paper. The child draws over it with their own
 * lines in any colour; wherever a line runs close to the template, that part of the
 * template lights up in its real colour, and once a few strokes are lit the picture
 * colours itself in. Lines anywhere else just stay on the paper — there is no wrong.
 */
import { h, replay } from '../../../core/dom';
import { PICTURES } from '../../trace/pictures';
import type { Picture } from '../../trace/shapes';
import { drawPicture, picturePaths } from '../art';
import type { ModeController, ModeEnv } from '../env';
import { pickNextPicture, pictureCount, named, slow } from '../progress';
import { createSurface, type Surface } from '../surface';
import {
  brightness,
  completeAll,
  makeTemplate,
  nextToDraw,
  progressOf,
  templateDone,
  touchTemplate,
  type TemplateState,
} from '../template';
import { createScope, makeButton } from '../ui';
import { paintTools } from './paintTools';

/** How near a line has to run to a template stroke to light it, as a share of the paper. */
const TOLERANCE = 0.075;
/** Faintest a template stroke ever is. */
const DIM = 0.2;
const REDRAW_MS = 70;
const HINT_MS = 2400;

export function startCopy(env: ModeEnv): ModeController {
  const scope = createScope();
  const { ctx } = env;
  const seen = new Set<string>();
  let pic: Picture = PICTURES[0]!;
  let tpl: TemplateState = makeTemplate(pic);
  let finishing = false;
  let hintIdx = -1;
  let lastDraw = 0;

  const pen = h('div', { class: 'dr-copy-pen', 'aria-hidden': 'true' }, '🖍️');
  const surface: Surface = createSurface({
    ctx,
    host: env.field,
    aspect: 1,
    onInk: (a, b, w, hh) => {
      if (finishing || surface.tool.tool === 'eraser') return;
      ctx.hint.touch();
      const from = a ? { x: a.x / w, y: a.y / hh } : null;
      const r = touchTemplate(tpl, from, { x: b.x / w, y: b.y / hh }, TOLERANCE);
      if (r.finished.length) {
        ctx.audio.note(660 + 80 * Math.min(5, tpl.strokes.filter((s) => s.done).length), 0.14);
        navigator.vibrate?.(12);
        redraw();
      } else if (r.lit > 0) {
        const now = performance.now();
        if (now - lastDraw >= REDRAW_MS) redraw();
      }
    },
    onStroke: () => {
      redraw();
      if (!finishing && templateDone(tpl)) finish();
    },
  });
  surface.paper.append(pen);
  const tools = paintTools(env, surface, scope, { stamps: false, bucket: false });

  function redraw(): void {
    lastDraw = performance.now();
    const help = progressOf(tpl);
    surface.setOverlay((c, w, hh) =>
      drawPicture(c, pic, w, hh, {
        fills: { alpha: templateDone(tpl) ? 1 : help >= 0.4 ? help * help : 0 },
        lines: {
          width: w * 0.03,
          alpha: (i) => DIM + (1 - DIM) * brightness(tpl.strokes[i]!) + (i === hintIdx ? 0.35 : 0),
          widthOf: (i) => w * (i === hintIdx ? 0.045 : 0.03),
        },
      }),
    );
  }

  function show(next: Picture, announce: boolean): void {
    pic = next;
    seen.add(next.id);
    tpl = makeTemplate(next);
    finishing = false;
    hintIdx = -1;
    pen.style.opacity = '0';
    surface.reset(1);
    redraw();
    if (announce) env.say(named('Vẽ theo', next.name));
    ctx.hint.arm(showHint, 9000);
  }

  function showHint(): void {
    const i = nextToDraw(tpl);
    if (i < 0 || finishing) return;
    hintIdx = i;
    const at = picturePaths(pic)[i]?.[0];
    if (at) {
      pen.style.left = `${at.x * 100}%`;
      pen.style.top = `${at.y * 100}%`;
      pen.style.opacity = '1';
      replay(pen, 'anim-wiggle');
    }
    redraw();
    scope.timeout(() => {
      hintIdx = -1;
      pen.style.opacity = '0';
      if (!finishing) redraw();
    }, HINT_MS);
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

  function finish(): void {
    finishing = true;
    ctx.hint.clear();
    completeAll(tpl);
    hintIdx = -1;
    pen.style.opacity = '0';
    redraw();
    ctx.audio.ding();
    env.say(`${slow(pic.name)} ${slow('Bé vẽ giống quá')}`);
    const shot = surface.snapshot();
    const done = pic;
    void env.commit(shot ? { mode: 'copy', thumb: shot.url, w: shot.w, h: shot.h, title: done.name } : null).then(() => {
      if (env.alive()) show(nextPicture(), true);
    });
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
              if (!finishing) show(p, true);
            },
          };
        }),
        { wide: true },
      );
    },
  });

  env.setHud([env.hubButton(), pictures, env.notebookButton()]);
  env.setTools(tools.buttons);
  show(nextPicture(), true);

  return {
    // The template is the point; a half-lit one is not kept. Only a finished picture goes in the book.
    flush() {},
    destroy() {
      ctx.hint.clear();
      surface.destroy();
      scope.dispose();
    },
  };
}
