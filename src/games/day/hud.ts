import { h } from '../../core/dom';
import { PERIODS } from './day';

/**
 * The frame every job shares: the little friend in the corner, the sun's road across the
 * four parts of the day, the day number and how many jobs are done. In a job the corner
 * button turns into "back".
 */
export interface Hud {
  el: HTMLElement;
  avatar: HTMLElement;
  home: HTMLElement;
  /** Move the sun to part `i` of the day. */
  setPeriod(i: number): void;
  setDots(done: number, total: number): void;
  setDay(n: number): void;
  /** In a job: show the back button instead of the avatar. */
  inJob(on: boolean): void;
}

export function createHud(): Hud {
  const avatar = h('button', { class: 'hud-avatar', type: 'button', 'aria-label': 'Bạn nhỏ' });
  const home = h('button', { class: 'hud-home', type: 'button', 'aria-label': 'Quay lại', hidden: true }, '⬅️');
  const stops = PERIODS.map((p, i) => h('span', { class: 'sky-stop', 'data-i': i }, p.icon));
  const sun = h('span', { class: 'sky-sun' }, '☀️');
  const track = h('div', { class: 'sky-track', role: 'img', 'aria-label': 'Đường mặt trời' }, h('span', { class: 'sky-line' }), ...stops, sun);
  const day = h('span', { class: 'hud-day' });
  const dots = h('div', { class: 'hud-dots', 'aria-hidden': 'true' });
  const el = h('div', { class: 'day-hud' }, h('div', { class: 'hud-left' }, avatar, home), track, h('div', { class: 'hud-right' }, day, dots));

  return {
    el,
    avatar,
    home,
    setPeriod(i) {
      const last = i >= PERIODS.length - 1;
      sun.textContent = last ? '🌙' : '☀️';
      el.style.setProperty('--pos', String((i + 0.5) * (100 / PERIODS.length)));
      el.dataset.period = String(i);
      stops.forEach((s, k) => s.classList.toggle('now', k === i));
    },
    setDots(done, total) {
      dots.replaceChildren(...Array.from({ length: total }, (_, i) => h('i', { class: i < done ? 'on' : '' })));
    },
    setDay(n) {
      day.textContent = `Ngày ${n}`;
    },
    inJob(on) {
      avatar.hidden = on;
      home.hidden = !on;
    },
  };
}
