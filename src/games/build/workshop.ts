import { h } from '../../core/dom';
import { onPerfChange, perf } from '../../core/frame';
import { showPhotoPicker, type PickerChoice } from '../../core/photoPicker';
import type { Photo } from '../../core/photos';
import type { GameContext } from '../../core/types';
import { openCabinet } from './gallery';
import { createHud } from './hud';
import { MODE_IDS, MODE_INFO, nextUnlock, totalStars, unlockedAt, type ModeId, type Progress } from './levels';
import { createBuildMode } from './buildMode';
import { createPuzzleMode } from './puzzleMode';
import { createShadowMode } from './shadowMode';
import { addWork, loadGallery, loadProgress, removeWork, saveGallery, saveProgress, type Work } from './store';
import type { ModeCtl, PhotoChoice, Workshop } from './types';

const FACTORIES: Record<ModeId, (w: Workshop) => ModeCtl> = {
  puzzle: createPuzzleMode,
  shadow: createShadowMode,
  build: createBuildMode,
};

/**
 * The bench the three modes sit on: the HUD that is the same in all of them, the switching between
 * them without leaving the game, the stars and what they unlock, the family photos and the cabinet
 * of works. A mode is built the first time it is opened and kept, so going back to a half-finished
 * puzzle finds it as it was.
 */
export function startWorkshop(ctx: GameContext): void {
  let alive = true;
  const progress: Progress = loadProgress();
  let works: Work[] = loadGallery();
  let photos: Photo[] = [];
  let choice: PhotoChoice = { kind: 'auto' };
  let closePicker: (() => void) | null = null;
  let closeCabinet: (() => void) | null = null;
  let lite = perf.low;
  const photoListeners = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const body = h('div', { class: 'bw-body' });
  const root = h('div', { class: 'bw' }, body);
  const hud = createHud(ctx, (m) => setMode(m), () => openShelf());
  root.prepend(hud.el);
  ctx.stage.append(root);
  root.classList.toggle('bw-lite', lite);

  const modes = new Map<ModeId, ModeCtl>();
  let current: ModeId | null = null;

  const w: Workshop = {
    ctx,
    progress: () => progress,
    stars: (mode) => progress.counts[mode],
    award(mode) {
      progress.counts[mode]++;
      saveProgress(progress);
      ctx.addStar();
      syncHud();
      const names = unlockedAt(mode, progress.counts[mode]);
      if (names.length) hud.flashUnlock();
      return names;
    },
    arm(fn) {
      ctx.hint.arm(() => {
        if (!w.covered()) fn();
      });
    },
    photos: () => photos,
    photoFor(round) {
      if (!photos.length || choice.kind === 'art') return undefined;
      if (choice.kind === 'photo') {
        const id = choice.id;
        return photos.find((p) => p.id === id) ?? photos[0];
      }
      // Auto: every other picture is one of the family, taking turns.
      return round % 2 === 1 ? photos[Math.floor(round / 2) % photos.length] : undefined;
    },
    choosePhoto: openPicker,
    onPhotosChange(fn) {
      photoListeners.add(fn);
      return () => photoListeners.delete(fn);
    },
    works: () => works,
    addWork(work) {
      works = addWork(works, work);
      saveGallery(works);
      hud.setWorks(works.length);
    },
    later(fn, ms) {
      const t = setTimeout(() => {
        timers.delete(t);
        if (alive) fn();
      }, ms);
      timers.add(t);
    },
    lite: () => lite,
    covered: () => closePicker !== null || closeCabinet !== null,
  };

  function syncHud(): void {
    const mode = current ?? progress.mode;
    hud.setStars(totalStars(progress), nextUnlock(mode, progress.counts[mode]).fraction);
    hud.setWorks(works.length);
  }

  function setMode(next: ModeId, first = false): void {
    if (!alive || (next === current && !first)) return;
    closePicker?.();
    if (current) modes.get(current)?.leave();
    current = next;
    progress.mode = next;
    saveProgress(progress);
    let ctl = modes.get(next);
    if (!ctl) {
      ctl = FACTORIES[next](w);
      modes.set(next, ctl);
      body.append(ctl.el);
    }
    for (const [id, m] of modes) m.el.hidden = id !== next;
    hud.setMode(next);
    root.dataset.mode = next;
    syncHud();
    if (!first) {
      ctx.audio.pop();
      ctx.speak(`${MODE_INFO[next].label}. ${MODE_INFO[next].prompt}`);
    }
    ctl.enter();
    ctl.relayout();
  }

  function openPicker(): void {
    if (!photos.length || closePicker) return;
    const choices: PickerChoice[] = [
      { id: 'auto', emoji: '🎲', label: 'Tự chọn' },
      ...photos.map((p, i) => ({ id: p.id, url: p.url, label: `Ảnh ${i + 1}` })),
      { id: 'art', emoji: '🐣', label: 'Tranh có sẵn' },
    ];
    closePicker = showPhotoPicker(ctx.stage, choices, (picked) => {
      closePicker = null;
      if (!picked || !alive) return;
      choice = picked.id === 'auto' ? { kind: 'auto' } : picked.id === 'art' ? { kind: 'art' } : { kind: 'photo', id: picked.id };
      ctx.audio.pop();
      for (const fn of [...photoListeners]) fn();
    });
  }

  function openShelf(): void {
    if (closeCabinet || !alive) return;
    closePicker?.();
    ctx.audio.pop();
    closeCabinet = openCabinet({
      ctx,
      host: root,
      list: () => works,
      remove(id) {
        works = removeWork(works, id);
        saveGallery(works);
        hud.setWorks(works.length);
      },
      onClose() {
        closeCabinet = null;
        if (alive && current) modes.get(current)?.enter();
      },
    });
  }

  const onResize = (): void => {
    if (current) modes.get(current)?.relayout();
  };
  window.addEventListener('resize', onResize);
  const raf = requestAnimationFrame(onResize);
  const offPerf = onPerfChange((low) => {
    lite = low;
    root.classList.toggle('bw-lite', low);
  });
  const offPhotos = ctx.photos.onChange((list) => {
    if (!alive) return;
    photos = list;
    if (choice.kind === 'photo' && !list.some((p) => p.id === (choice as { id: string }).id)) choice = { kind: 'auto' };
    for (const fn of [...photoListeners]) fn();
  });
  void ctx.photos.list().then((list) => {
    if (!alive) return;
    photos = list;
    for (const fn of [...photoListeners]) fn();
  });

  ctx.onCleanup(() => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    offPerf();
    offPhotos();
    closePicker?.();
    closeCabinet?.();
    for (const m of modes.values()) m.destroy();
    modes.clear();
    photoListeners.clear();
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });

  setMode(MODE_IDS.includes(progress.mode) ? progress.mode : 'puzzle', true);
}
