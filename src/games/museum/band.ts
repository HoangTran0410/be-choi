import { h } from '../../core/dom';
import { sayLines, sayText } from '../../core/say';
import { bandVoices, ENTRIES, findEntry, nameParts, thumbSvg, type Entry } from './catalog';
import { createInstrument } from './instruments';
import type { InstrumentHandle } from './instruments/types';
import { sound } from './instruments/voices';
import {
  autoDegree,
  BAND_SLOTS,
  collected,
  CONCERT_MS,
  hasStamp,
  setSlot,
  stepMs,
  stepEvents,
  trackById,
  trackOpen,
  TRACKS,
} from './logic';
import { button, dragScroll, timers, tile, type Deps, type View } from './ui';

const BACK_VEL = 0.5;
const CONCERT_TOUCHES = 20;

/**
 * "Dàn nhạc của bé": a backing band plays by itself (drums, bass and chords in C),
 * and up to four collected instruments join in. The instrument the child holds is
 * shown big, set to C pentatonic so any touch fits; the others play a gentle part
 * of their own, so the sound builds up layer by layer. Touch another card to take
 * that instrument in hand.
 */
export function mountBand(host: HTMLElement, deps: Deps): View {
  const { ctx, album, save, go } = deps;
  const t = timers();
  let alive = true;
  let playing = true;
  let focus = -1;
  let inst: InstrumentHandle | null = null;
  let offNote: (() => void) | null = null;
  let touches = 0;
  let starred = false;
  let bar = 0;
  let step = 0;
  let next = performance.now();
  let tick: ReturnType<typeof setTimeout> | null = null;
  let pickerSlot = -1;

  // first visit: seat the first two instruments the child collected
  if (album.band.every((x) => x === null)) {
    collected(album)
      .slice(0, 2)
      .forEach((id, i) => setSlot(album, i, id));
    save();
  }

  const back = button('mu-back', 'Về phòng bảo tàng', '←', () => go.room());
  const playBtn = button('mu-play', 'Bật tắt nhạc nền', '⏸', () => togglePlay());
  const trackBtn = button('mu-track', 'Đổi bài nhạc nền', trackById(album.track).emoji, () => nextTrack());
  const rail = h('div', { class: 'mu-band-rail' }, back, playBtn, trackBtn);
  const slotEls = Array.from({ length: BAND_SLOTS }, (_, i) => button('mu-slot', `Chỗ ${i + 1}`, '', () => onSlot(i)));
  const slots = h('div', { class: 'mu-slots' }, ...slotEls);
  const field = h('div', { class: 'mu-field mu-band-field' });
  const picker = h('div', { class: 'mu-picker', hidden: true });
  const root = h('div', { class: 'mu-band' }, rail, slots, field, picker);
  host.append(root);

  const entryAt = (i: number): Entry | undefined => {
    const id = album.band[i];
    return id ? findEntry(id) : undefined;
  };

  function paintSlots(): void {
    slotEls.forEach((el, i) => {
      const en = entryAt(i);
      el.className = `mu-slot${en ? ' full' : ' empty'}${i === focus ? ' focus' : ''}`;
      el.innerHTML = en
        ? `<span class="mu-thumb">${thumbSvg(en.kind)}</span><i class="mu-auto" aria-hidden="true"></i>`
        : '<span class="mu-plus" aria-hidden="true">➕</span>';
      el.setAttribute('aria-label', en ? en.name : `Chỗ trống ${i + 1}`);
    });
  }

  function holdInstrument(i: number): void {
    offNote?.();
    inst?.destroy();
    inst = null;
    offNote = null;
    focus = i;
    const en = entryAt(i);
    if (en) {
      inst = createInstrument(en.kind, field, ctx, { harmony: 'pentatonic' });
      offNote = inst.onNote(() => {
        touches++;
      });
      void ctx.speakSeq(nameParts(en));
    } else field.replaceChildren();
    paintSlots();
  }

  function onSlot(i: number): void {
    const en = entryAt(i);
    if (!en) return openPicker(i);
    if (i !== focus) return holdInstrument(i);
    openPicker(i);
  }

  // ---- picker ----
  function openPicker(slot: number): void {
    pickerSlot = slot;
    picker.hidden = false;
    picker.replaceChildren();
    const grid = h('div', { class: 'mu-picker-grid' });
    const close = button('mu-back mu-picker-close', 'Đóng', '✕', () => closePicker());
    grid.append(close);
    if (album.band[slot])
      grid.append(
        button('mu-tile mu-clear', 'Bỏ nhạc cụ này', h('span', { class: 'mu-plus', 'aria-hidden': 'true' }, '🚫'), () => choose(null)),
      );
    for (const en of ENTRIES) {
      const has = hasStamp(album, en.id);
      const el = tile(en, false, () => (has ? choose(en.id) : lockedTip()), has ? '' : 'locked');
      if (!has) el.append(h('span', { class: 'mu-lock', 'aria-hidden': 'true' }, '🔒'));
      grid.append(el);
    }
    picker.append(grid);
    dragScroll(picker);
  }
  function closePicker(): void {
    picker.hidden = true;
    picker.replaceChildren();
    pickerSlot = -1;
  }
  function lockedTip(): void {
    ctx.audio.boing();
    void sayText(ctx, 'Bé sưu tầm tem nhạc cụ này trước nhé.');
  }
  function choose(id: string | null): void {
    const slot = pickerSlot;
    closePicker();
    if (slot < 0) return;
    setSlot(album, slot, id);
    save();
    holdInstrument(id ? slot : album.band.findIndex((x) => x !== null));
  }

  // ---- backing + the others' parts ----
  function playStep(): void {
    const tr = trackById(album.track);
    const ev = stepEvents(tr, bar, step);
    for (const d of ev.drums) ctx.audio.drum(d);
    for (const n of ev.notes) ctx.audio.note(440 * Math.pow(2, (n.midi - 69) / 12), n.dur, n.timbre);
    album.band.forEach((id, slot) => {
      if (!id || slot === focus) return;
      const en = findEntry(id);
      const deg = autoDegree(slot, step);
      const v = en && deg !== null ? bandVoices(en.kind)[deg] : undefined;
      if (v) {
        sound(ctx.audio, v, BACK_VEL);
        const dot = slotEls[slot]?.querySelector('.mu-auto');
        if (dot) {
          dot.classList.remove('beat');
          void (dot as HTMLElement).offsetWidth;
          dot.classList.add('beat');
        }
      }
    });
    if (step % 4 === 0) {
      root.classList.remove('beat');
      void root.offsetWidth;
      root.classList.add('beat');
    }
    step++;
    if (step === 16) {
      step = 0;
      bar++;
    }
  }

  function schedule(): void {
    if (!alive || !playing) return;
    const tr = trackById(album.track);
    const now = performance.now();
    if (next < now - 250) next = now;
    playStep();
    next += stepMs(tr);
    tick = setTimeout(schedule, Math.max(0, next - performance.now()));
  }

  function startBacking(): void {
    if (tick) clearTimeout(tick);
    next = performance.now();
    step = 0;
    bar = 0;
    playing = true;
    playBtn.textContent = '⏸';
    schedule();
  }
  function stopBacking(): void {
    playing = false;
    if (tick) clearTimeout(tick);
    tick = null;
    playBtn.textContent = '▶';
  }
  function togglePlay(): void {
    if (playing) stopBacking();
    else startBacking();
  }
  function nextTrack(): void {
    const open = TRACKS.filter((x) => trackOpen(x, album.stamps.length));
    if (open.length <= 1) {
      void sayLines(ctx, ['Sưu tầm thêm tem', 'bé sẽ có bài nhạc mới nhé']);
      return;
    }
    const i = open.findIndex((x) => x.id === album.track);
    album.track = open[(i + 1) % open.length]!.id;
    trackBtn.textContent = trackById(album.track).emoji;
    save();
    startBacking();
  }

  // ---- a concert is worth a star ----
  function checkConcert(): void {
    if (!alive || starred) return;
    if (touches >= CONCERT_TOUCHES) {
      starred = true;
      album.stars++;
      save();
      ctx.addStar();
      void ctx.celebrate();
      void sayText(ctx, 'Dàn nhạc của bé hay quá!');
    } else t.later(checkConcert, 15000);
  }
  t.later(checkConcert, CONCERT_MS);

  paintSlots();
  holdInstrument(album.band.findIndex((x) => x !== null));
  startBacking();

  ctx.hint.arm(() => {
    const target = slotEls.find((_, i) => !entryAt(i)) ?? slotEls[0];
    if (target) {
      target.classList.remove('anim-wiggle');
      void target.offsetWidth;
      target.classList.add('anim-wiggle');
    }
  }, 10000);

  return {
    destroy() {
      alive = false;
      stopBacking();
      ctx.hint.clear();
      offNote?.();
      inst?.destroy();
      t.clear();
      root.remove();
    },
  };
}
