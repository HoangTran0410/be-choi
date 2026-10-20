import { h, replay } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import type { App } from './app';
import { TOPICS, familyReady } from './curriculum';
import { isWorn, nextReward, toggleWear, totalRuns, unlocked } from './progress';
import type { Scope } from './scope';
import type { TopicId } from './types';

/** Stars shown on a station: one per few visits, up to three. */
export function starsFor(runs: number): number {
  return runs >= 6 ? 3 : runs >= 3 ? 2 : runs >= 1 ? 1 : 0;
}

/** The station to point at: the one visited least (family only when it can be played). */
export function suggestedStation(runs: Partial<Record<TopicId, number>>, familyOk: boolean): TopicId {
  const open = TOPICS.filter((t) => t.id !== 'family' || familyOk);
  let best = open[0]!;
  for (const t of open) if ((runs[t.id] ?? 0) < (runs[best.id] ?? 0)) best = t;
  return best.id;
}

/**
 * The journey map: ten stations on a winding path. Any station can be played at any time,
 * in any order; the teacher only points at the one visited least.
 */
export function showMap(app: App, root: HTMLElement, scope: Scope): void {
  const { state, ctx } = app;
  const familyOk = familyReady(app.env);
  const suggest = suggestedStation(state.runs, familyOk);
  const stage = ctx.stage;

  const greeting = h('p', { class: 'lm-say' }, 'Chọn một trạm nhé!');
  const wardrobe = h('div', { class: 'lm-wardrobe' });
  const exploreBtn = h('button', { class: 'lm-explore', type: 'button' }, h('span', { class: 'lm-explore-ico' }, '🔍'), h('span', null, 'Khám phá'));
  const head = h('div', { class: 'lm-head' }, app.teacher.el, h('div', { class: 'lm-bubble' }, greeting), exploreBtn);
  const path = h('div', { class: 'lm-path' });
  const lines = h('div', { class: 'lm-lines' });
  const screen = h('div', { class: `lm${app.low() ? ' low' : ''}` }, head, h('div', { class: 'lm-body' }, lines, path), wardrobe);
  root.replaceChildren(screen);

  scope.onDispose(makeTappable(exploreBtn, () => app.goExplore(), { cooldownMs: 300 }));

  // ---- the teacher: tap to hear her ----
  scope.onDispose(
    makeTappable(
      app.teacher.el,
      () => {
        app.teacher.cheer();
        app.sayer.say(['Chào bé!', 'Mình cùng học nhé']);
      },
      { cooldownMs: 400, feedback: false },
    ),
  );

  // ---- stations, laid out as a snake so the path never has to jump ----
  const stations = new Map<TopicId, HTMLElement>();
  function build(): void {
    const landscape = stage.clientWidth > stage.clientHeight * 1.05;
    const cols = landscape ? 5 : 2;
    const rows: HTMLElement[] = [];
    TOPICS.forEach((t, i) => {
      const r = Math.floor(i / cols);
      if (!rows[r]) rows[r] = h('div', { class: `lm-row${r % 2 ? ' rev' : ''}` });
      const runs = state.runs[t.id] ?? 0;
      const locked = t.id === 'family' && !familyOk;
      const stars = starsFor(runs);
      const el =
        stations.get(t.id) ??
        h(
          'button',
          { class: 'lm-st', type: 'button', 'data-topic': t.id, 'aria-label': t.title },
          h('span', { class: 'lm-st-disc' }, h('span', { class: 'lm-st-ico' }, t.icon)),
          h('span', { class: 'lm-st-name' }, t.title),
          h('span', { class: 'lm-st-stars' }),
        );
      el.classList.toggle('done', runs > 0);
      el.classList.toggle('suggest', t.id === suggest && !locked);
      el.classList.toggle('locked', locked);
      el.style.setProperty('--hue', String(Math.round((i * 36 + 190) % 360)));
      (el.querySelector('.lm-st-stars') as HTMLElement).textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
      if (!stations.has(t.id)) {
        stations.set(t.id, el);
        scope.onDispose(
          makeTappable(
            el,
            () => {
              if (el.classList.contains('locked')) {
                replay(el, 'anim-wiggle');
                app.teacher.think();
                greeting.textContent = 'Ba mẹ thêm ảnh cả nhà ở Góc phụ huynh nhé!';
                app.sayer.say(['Nhờ ba mẹ', 'thêm ảnh cả nhà', 'nhé']);
                return;
              }
              app.goQuiz(t.id);
            },
            { cooldownMs: 300 },
          ),
        );
      }
      rows[r]!.append(el);
    });
    path.replaceChildren(...rows);
    path.className = `lm-path${landscape ? ' land' : ''}`;
  }
  build();

  // ---- the dotted road between the stations ----
  function drawRoad(): void {
    const box = path.getBoundingClientRect();
    if (box.width === 0) return;
    const pts = TOPICS.map((t) => {
      const disc = stations.get(t.id)!.querySelector('.lm-st-disc')!.getBoundingClientRect();
      return { x: disc.left + disc.width / 2 - box.left, y: disc.top + disc.height / 2 - box.top };
    });
    // Straight along a row; at the end of a row the next station is directly below.
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    lines.style.cssText = `left:${path.offsetLeft}px;top:${path.offsetTop}px;width:${box.width}px;height:${box.height}px`;
    lines.innerHTML = `<svg viewBox="0 0 ${box.width} ${box.height}" width="${box.width}" height="${box.height}" aria-hidden="true"><path d="${d}" fill="none" stroke="rgba(99,102,241,.35)" stroke-width="10" stroke-linecap="round" stroke-dasharray="1 18"/></svg>`;
  }

  // ---- the wardrobe: what the teacher has earned ----
  function renderWardrobe(): void {
    const got = unlocked(state);
    const upcoming = nextReward(state);
    wardrobe.replaceChildren(
      ...got.map((r) => {
        const chip = h(
          'button',
          { class: `lm-wear${isWorn(state.wear, r) ? ' on' : ''}`, type: 'button', 'aria-label': r.name },
          r.emoji,
        );
        scope.onDispose(
          makeTappable(
            chip,
            () => {
              state.wear = toggleWear(state.wear, r);
              app.teacher.setWear(state.wear);
              app.teacher.cheer();
              app.save();
              ctx.audio.pop(1.2);
              renderWardrobe();
            },
            { cooldownMs: 200, feedback: false },
          ),
        );
        return chip;
      }),
      ...(upcoming ? [h('span', { class: 'lm-wear lm-next', 'aria-label': 'Quà sắp có' }, '🎁')] : []),
    );
    wardrobe.hidden = got.length === 0 && !upcoming;
  }
  renderWardrobe();

  // Greet once per visit, after the screen has settled.
  const finished = totalRuns(state);
  // The first time, the game's own intro ("Chào bé! Mình cùng học nhé!") is still being spoken.
  const wait = app.firstVisit ? 3600 : 500;
  app.firstVisit = false;
  scope.later(() => {
    app.teacher.cheer();
    app.sayer.say(finished === 0 ? ['Chọn một trạm nhé'] : ['Bé muốn học gì nào?']);
  }, wait);

  const relayout = (): void => {
    stations.forEach((el) => el.remove());
    build();
    drawRoad();
  };
  let lastW = stage.clientWidth;
  let lastH = stage.clientHeight;
  const onResize = (): void => {
    const w = stage.clientWidth;
    const hh = stage.clientHeight;
    if (w === lastW && hh === lastH) return;
    const turned = w > hh !== lastW > lastH;
    lastW = w;
    lastH = hh;
    if (turned) relayout();
    else drawRoad();
  };
  window.addEventListener('resize', onResize);
  scope.onDispose(() => window.removeEventListener('resize', onResize));
  scope.later(drawRoad, 60);
  scope.later(drawRoad, 400);
}
