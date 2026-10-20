import { h, mulberry32, replay } from '../../../core/dom';
import { hitTest } from '../../../core/drag';
import { CHEERS, JOBS, JOB_ICON, NUDGES, SCRUBS_TO_CLEAN, allClean, makeMouth, scrub, type Job } from '../../teeth/logic';
import { createFinisher } from '../done';
import type { Activity } from '../env';

/** Distance the brush must travel for the next stroke to count. */
const STROKE_PX = 14;

/**
 * Đánh răng: squeeze the paste, brush every dirty tooth (a swipe, or taps) and rinse with
 * the cup — in any order. When all three are done a big ✓ shows; brushing and the rest keep
 * working until the child presses it (or stops playing for a while).
 */
export const teeth: Activity = (env) => {
  const { ctx, scope, plan, days } = env;
  const rng = mulberry32(plan.seed + 21);
  const mouth = makeMouth(Math.min(days, 3), rng);
  let list = mouth.teeth;
  const done = new Set<Job>();

  const toothEls = list.map((t) => {
    const stain = h('span', { class: 'teeth-stain' }, t.dirty ? (mouth.stains[t.id] ?? '🍫') : '');
    return h('div', { class: `teeth-tooth${t.dirty ? ' dirty' : ''}`, 'data-id': t.id }, stain);
  });
  const brush = h('div', { class: 'teeth-brush' }, '🪥');
  const jaw = h('div', { class: 'teeth-jaw', 'aria-label': 'Răng' }, ...toothEls, brush);
  const paste = h('button', { class: 'teeth-job', type: 'button', 'aria-label': 'Kem đánh răng', 'data-job': 'paste' }, JOB_ICON.paste);
  const rinse = h('button', { class: 'teeth-job', type: 'button', 'aria-label': 'Súc miệng', 'data-job': 'rinse' }, JOB_ICON.rinse);
  const ticks = new Map<Job, HTMLElement>();
  const row = h(
    'div',
    { class: 'teeth-ticks', 'aria-hidden': 'true' },
    ...JOBS.map((j) => {
      const t = h('span', { class: 'teeth-tick' }, JOB_ICON[j]);
      ticks.set(j, t);
      return t;
    }),
  );
  env.host.append(h('div', { class: 'teeth' }, row, jaw, h('div', { class: 'teeth-tools' }, paste, rinse)));
  const fin = createFinisher(env);

  function setJob(j: Job): void {
    fin.touch();
    if (done.has(j)) return;
    done.add(j);
    ticks.get(j)?.classList.add('done');
    ctx.audio.ding();
    env.say(CHEERS[j]);
    if (done.size === JOBS.length) {
      ctx.hint.clear();
      scope.later(() => env.say('Răng sạch bóng rồi!'), 1200);
      fin.ready();
    }
  }

  const useJob = (j: Job, btn: HTMLElement): void => {
    ctx.hint.touch();
    replay(btn, 'anim-bounce');
    if (j === 'paste') jaw.classList.add('foam');
    setJob(j);
  };
  scope.tap(paste, () => useJob('paste', paste), 0);
  scope.tap(rinse, () => useJob('rinse', rinse), 0);

  /** Boxes read once when a finger lands, never while it moves (a layout read per move stutters on a tablet). */
  let rects: Array<{ id: string; rect: DOMRect }> = [];
  let jawBox = { left: 0, top: 0 };
  function measure(): void {
    rects = toothEls.map((el, i) => ({ id: String(i), rect: el.getBoundingClientRect() }));
    const r = jaw.getBoundingClientRect();
    jawBox = { left: r.left, top: r.top };
  }

  function brushAt(x: number, y: number): void {
    const hit = hitTest({ x, y }, rects);
    if (hit === null) return;
    const i = Number(hit);
    const t = list[i];
    if (!t || !t.dirty) return;
    const res = scrub(list, t.id);
    list = res.teeth;
    const el = toothEls[i];
    const after = list[i];
    if (el && after) {
      const left = 1 - Math.min(1, after.scrubs / SCRUBS_TO_CLEAN);
      el.style.setProperty('--dirt', String(left));
      if (res.cleaned) {
        el.classList.remove('dirty');
        el.classList.add('clean');
        replay(el, 'anim-bounce');
        ctx.audio.pop(1.2);
      }
    }
    if (allClean(list)) setJob('brush');
  }

  let from: { x: number; y: number } | null = null;
  const place = (e: PointerEvent): void => {
    brush.style.transform = `translate3d(${e.clientX - jawBox.left - 36}px, ${e.clientY - jawBox.top - 36}px, 0)`;
    brush.classList.add('on');
  };
  jaw.addEventListener('pointerdown', (e) => {
    ctx.hint.touch();
    fin.touch();
    from = { x: e.clientX, y: e.clientY };
    measure();
    place(e);
    brushAt(e.clientX, e.clientY);
  });
  jaw.addEventListener('pointermove', (e) => {
    if (!from) return;
    place(e);
    if (Math.hypot(e.clientX - from.x, e.clientY - from.y) >= STROKE_PX) {
      from = { x: e.clientX, y: e.clientY };
      brushAt(e.clientX, e.clientY);
    }
  });
  const lift = (): void => {
    from = null;
    brush.classList.remove('on');
  };
  jaw.addEventListener('pointerup', lift);
  jaw.addEventListener('pointercancel', lift);

  env.say(NUDGES.paste);
  ctx.hint.arm(() => {
    env.say('Đánh răng cho sạch nào');
    const next = !done.has('paste') ? paste : !allClean(list) ? jaw : rinse;
    replay(next, 'anim-wiggle');
  });
};
