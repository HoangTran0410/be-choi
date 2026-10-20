/**
 * The family's photos in a world, three ways: a picture stuck on the glass that
 * the child can slide about, a photo behind the world, and visitors — the people
 * in a photo come to look in at the animals, one at the side of the glass at a
 * time. All of it is plain page elements over the world, so it works the same on
 * every engine.
 */
import { h } from '../../core/dom';
import type { AudioEngine } from '../../core/audio';
import type { Photo } from '../../core/photos';
import { MAX_FRAMES, MAX_VISITORS, type Frame, type HabitatSave } from './save';
import type { Realm } from './worlds';

export interface PhotoLayerDeps {
  save: HabitatSave;
  audio: AudioEngine;
  persist(): void;
}

export interface PhotoLayer {
  el: HTMLElement;
  setPhotos(list: readonly Photo[]): void;
  /** Show the photos kept for `realm`, or none at all (`null`: the pond). */
  show(realm: Realm | null): void;
  /** Hang a photo. False when the glass is full. */
  addFrame(photoId: string): boolean;
  setBackdrop(photoId: string | null): void;
  addVisitor(photoId: string): boolean;
  /** Take everything off for this world. */
  clear(): void;
  count(): number;
  destroy(): void;
}

/** How far a finger must travel before a press on a picture is a slide, not a tap. */
const SLIDE_SLOP = 6;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function createPhotoLayer(deps: PhotoLayerDeps): PhotoLayer {
  const { save, audio } = deps;
  const el = h('div', { class: 'hb-photos' });
  let photos = new Map<string, string>();
  let realm: Realm | null = null;
  const disposers: Array<() => void> = [];

  function urlOf(id: string): string | null {
    return photos.get(id) ?? null;
  }

  function frameEl(frame: Frame, tilt: number): HTMLElement | null {
    const url = urlOf(frame.photo);
    if (!url) return null;
    const node = h(
      'div',
      { class: 'hb-frame', 'data-photo': frame.photo, style: `left:${frame.x * 100}%;top:${frame.y * 100}%;--tilt:${tilt}deg` },
      h('img', { src: url, alt: '', draggable: false }),
    );
    let from: { x: number; y: number; fx: number; fy: number } | null = null;
    let slid = false;
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return;
      from = { x: e.clientX, y: e.clientY, fx: frame.x, fy: frame.y };
      slid = false;
      try {
        node.setPointerCapture(e.pointerId);
      } catch {
        /* no capture in this browser: the move events still arrive over the picture */
      }
      node.classList.add('hb-held');
    });
    node.addEventListener('pointermove', (e) => {
      if (!from) return;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return;
      if (!slid && Math.hypot(e.clientX - from.x, e.clientY - from.y) < SLIDE_SLOP) return;
      slid = true;
      frame.x = clamp(from.fx + (e.clientX - from.x) / box.width, 0.08, 0.92);
      frame.y = clamp(from.fy + (e.clientY - from.y) / box.height, 0.1, 0.8);
      node.style.left = `${frame.x * 100}%`;
      node.style.top = `${frame.y * 100}%`;
    });
    const release = (): void => {
      if (!from) return;
      from = null;
      node.classList.remove('hb-held');
      if (slid) deps.persist();
      else audio.tick();
    };
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
    return node;
  }

  function render(): void {
    el.replaceChildren();
    if (!realm) return;
    const mine = save.photos[realm];
    const back = mine.backdrop && urlOf(mine.backdrop);
    if (back) el.append(h('div', { class: 'hb-backdrop', style: `background-image:url("${back}")` }));
    mine.frames.forEach((frame, i) => {
      const node = frameEl(frame, i % 2 === 0 ? -3 : 2.5);
      if (node) el.append(node);
    });
    mine.visitors.forEach((id, i) => {
      const url = urlOf(id);
      if (!url) return;
      const side = i % 2 === 0 ? 'left' : 'right';
      el.append(
        h(
          'div',
          { class: `hb-visitor hb-visitor-${side}`, style: `--at:${side === 'left' ? 58 + ((i * 7) % 10) : 22 + ((i * 17) % 30)}%;--wait:${i * 7}s` },
          h('img', { src: url, alt: '', draggable: false }),
          h('span', { class: 'hb-wave', 'aria-hidden': 'true' }, '👋'),
        ),
      );
    });
  }

  return {
    el,
    setPhotos(list) {
      photos = new Map(list.map((p) => [p.id, p.url]));
      render();
    },
    show(next) {
      realm = next;
      render();
    },
    addFrame(photoId) {
      if (!realm) return false;
      const mine = save.photos[realm];
      // The glass is full: the oldest picture makes room, like the tank does for a new fish.
      if (mine.frames.length >= MAX_FRAMES) mine.frames.shift();
      const slot = mine.frames.length;
      mine.frames.push({ photo: photoId, x: [0.22, 0.5, 0.78][slot % 3]!, y: 0.26 + (slot % 2) * 0.12 });
      deps.persist();
      render();
      return true;
    },
    setBackdrop(photoId) {
      if (!realm) return;
      save.photos[realm].backdrop = photoId;
      deps.persist();
      render();
    },
    addVisitor(photoId) {
      if (!realm) return false;
      const mine = save.photos[realm];
      if (mine.visitors.length >= MAX_VISITORS) mine.visitors.shift();
      mine.visitors.push(photoId);
      deps.persist();
      render();
      return true;
    },
    clear() {
      if (!realm) return;
      save.photos[realm] = { frames: [], backdrop: null, visitors: [] };
      deps.persist();
      render();
    },
    count() {
      if (!realm) return 0;
      const mine = save.photos[realm];
      return mine.frames.length + mine.visitors.length + (mine.backdrop ? 1 : 0);
    },
    destroy() {
      for (const fn of disposers) fn();
      el.remove();
    },
  };
}
