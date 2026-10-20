import { h, replay } from '../../core/dom';
import type { Wear } from './progress';

export interface Teacher {
  el: HTMLElement;
  setWear(w: Wear): void;
  /** A happy hop. */
  cheer(): void;
  /** A little head tilt: "hmm, let's look again". */
  think(): void;
}

/** The teacher: a character emoji dressed with accessory emoji (hat, glasses, scarf) laid over it. */
export function createTeacher(wear: Wear): Teacher {
  const body = h('span', { class: 'lt-body', 'aria-hidden': 'true' });
  const head = h('span', { class: 'lt-acc lt-head', 'aria-hidden': 'true' });
  const face = h('span', { class: 'lt-acc lt-face', 'aria-hidden': 'true' });
  const neck = h('span', { class: 'lt-acc lt-neck', 'aria-hidden': 'true' });
  const el = h('div', { class: 'lt', role: 'img', 'aria-label': 'Cô giáo' }, body, face, neck, head);

  function setWear(w: Wear): void {
    body.textContent = w.who;
    head.textContent = w.head ?? '';
    face.textContent = w.face ?? '';
    neck.textContent = w.neck ?? '';
    el.dataset.who = w.who;
  }
  setWear(wear);

  return {
    el,
    setWear,
    cheer: () => replay(el, 'lt-cheer'),
    think: () => replay(el, 'lt-think'),
  };
}
