import { h } from '../../core/dom';
import { sayText, sayWord } from '../../core/say';
import { findEntry, groupOf, nameParts, thumbSvg } from './catalog';
import { createInstrument } from './instruments';
import { placeOf, addStamp, createMissions, hasStamp, MISSIONS, type MissionId } from './logic';
import { button, timers, type Deps, type View } from './ui';

const PILL: Record<MissionId, { icon: string; cue: string }> = {
  places: { icon: '📍', cue: 'Bé thử chạm vào chỗ khác nhé.' },
  fast: { icon: '🐇', cue: 'Bé gõ thật nhanh nào.' },
  slow: { icon: '🐢', cue: 'Bé gõ thật chậm thôi nào.' },
  dynamics: { icon: '🔊', cue: 'Bé gõ thật nhẹ, rồi gõ thật mạnh nhé.' },
};
const STAMP_SHOW_MS = 2600;
const HINT_MS = 9000;

/**
 * An instrument's table: the instrument drawn big and playable like the real one,
 * and four quiet missions (try three places, play fast, play slow, play soft and
 * loud). There is no wrong way: the missions tick off by themselves while the child
 * plays, and the fourth earns the stamp.
 */
export function mountTable(host: HTMLElement, entryId: string, deps: Deps): View {
  const { ctx, album, go, save } = deps;
  const en = findEntry(entryId);
  if (!en) {
    go.room();
    return { destroy: () => undefined };
  }
  const t = timers();
  let alive = true;
  const group = groupOf(en.group);

  const back = button('mu-back', 'Về phòng bảo tàng', '←', () => go.room());
  const thumb = h('span', { class: 'mu-name-thumb' });
  thumb.innerHTML = thumbSvg(en.kind);
  const name = h(
    'div',
    { class: 'mu-name', 'aria-label': en.name },
    thumb,
    h('span', { class: 'mu-name-g', 'aria-hidden': 'true' }, group.emoji),
  );
  const speakBtn = button('mu-say', 'Nghe tên nhạc cụ', '🔊', () => say());
  const pills = new Map<MissionId, HTMLElement>();
  const pillBox = h('div', { class: 'mu-missions', 'aria-hidden': 'true' });
  for (const m of MISSIONS) {
    const p = h('span', { class: 'mu-pill', 'data-m': m }, PILL[m].icon);
    pills.set(m, p);
    pillBox.append(p);
  }
  const rail = h('div', { class: 'mu-rail' }, back, name, speakBtn, pillBox);
  const field = h('div', { class: 'mu-field' });
  const overlay = h('div', { class: 'mu-stamp-overlay', hidden: true });
  const root = h('div', { class: 'mu-table', 'data-kind': en.kind }, rail, field, overlay);
  host.append(root);

  const inst = createInstrument(en.kind, field, ctx, { harmony: 'free' });
  const places = new Set(inst.board().zones.map((z) => placeOf(z.id)));
  const tracker = createMissions(places.size);
  const stamped = hasStamp(album, en.id);
  const mark = (m: MissionId, pop: boolean): void => {
    const p = pills.get(m);
    if (!p) return;
    p.classList.add('done');
    if (pop) {
      p.classList.remove('anim-pop');
      void p.offsetWidth;
      p.classList.add('anim-pop');
    }
  };
  if (stamped) {
    tracker.finishAll();
    for (const m of MISSIONS) mark(m, false);
  }

  function say(): void {
    void ctx.speakSeq(nameParts(en!, group));
  }

  function award(): void {
    if (!addStamp(album, en!.id)) return;
    save();
    ctx.addStar();
    overlay.hidden = false;
    overlay.innerHTML = `<div class="mu-stamp"><span class="mu-stamp-art">${thumbSvg(en!.kind)}</span><span class="mu-stamp-star">⭐</span></div>`;
    ctx.audio.jingle();
    void sayWord(ctx, en!.say, ['Giỏi quá!', 'Bé được một tem nhé.']);
    void ctx.celebrate().then(() => undefined);
    t.later(() => {
      overlay.hidden = true;
      overlay.innerHTML = '';
    }, STAMP_SHOW_MS);
  }

  const off = inst.onNote((e) => {
    if (!alive) return;
    const done = tracker.hit(e.zoneId, performance.now(), e.vel);
    for (const m of done) mark(m, true);
    if (done.length) ctx.audio.ding();
    if (done.length && tracker.complete() && !hasStamp(album, en.id)) award();
  });

  ctx.hint.arm(() => {
    const next = MISSIONS.find((m) => !tracker.done().has(m));
    if (!next) return;
    const p = pills.get(next);
    if (p) {
      p.classList.remove('anim-wiggle');
      void p.offsetWidth;
      p.classList.add('anim-wiggle');
    }
    void sayText(ctx, PILL[next].cue);
  }, HINT_MS);

  // Say the name, slowly, once the screen has settled.
  t.later(say, 350);

  return {
    destroy() {
      alive = false;
      ctx.hint.clear();
      off();
      inst.destroy();
      t.clear();
      root.remove();
    },
  };
}
