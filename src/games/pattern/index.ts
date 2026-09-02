import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { makePatternRound, roundSpeech, STAR_EVERY } from './logic';
import './style.css';

/** Pause after the missing slot is filled before the next pattern. */
const NEXT_MS = 900;

/**
 * Pattern: a row of repeating items with the last one missing. Tapping the
 * choice that comes next fills the slot; every STAR_EVERY correct answers
 * bring confetti and a star. Wrong taps just shake, the child tries again.
 */
function start(ctx: GameContext): void {
  let round = 0;
  let alive = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const row = h('div', { class: 'pattern-row' });
  const tray = h('div', { class: 'g-tray pattern-choices' });
  const root = h('div', { class: 'pattern' }, h('div', { class: 'pattern-board' }, row), tray);
  ctx.stage.append(root);

  ctx.onCleanup(() => {
    alive = false;
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  });

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
  }

  function play(): void {
    const r = makePatternRound(round);
    let locked = false;
    root.dataset.answer = r.answer.emoji;

    const missing = h('div', { class: 'pattern-slot pattern-missing anim-pulse' }, '?');
    row.replaceChildren(...r.sequence.map((item) => h('div', { class: 'pattern-slot' }, item.emoji)), missing);

    const choices = r.choices.map((item) => {
      const btn = h(
        'button',
        { class: 'pattern-choice', type: 'button', 'data-emoji': item.emoji, 'aria-label': item.name },
        item.emoji,
      );
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (locked) return;
        if (item.emoji !== r.answer.emoji) {
          btn.classList.remove('anim-wiggle');
          replay(btn, 'anim-shake');
          ctx.audio.boing();
          return;
        }
        locked = true;
        solve(btn);
      });
      return btn;
    });
    tray.replaceChildren(...choices);
    ctx.speak(roundSpeech(r));

    ctx.hint.arm(() => {
      if (locked) return;
      const correct = choices.find((c) => c.dataset.emoji === r.answer.emoji);
      if (correct) replay(correct, 'anim-wiggle');
    });

    function solve(picked: HTMLButtonElement): void {
      ctx.hint.clear();
      for (const c of choices) c.disabled = true;
      picked.classList.remove('anim-wiggle');
      picked.classList.add('pattern-picked');

      missing.textContent = r.answer.emoji;
      missing.classList.remove('anim-pulse');
      missing.classList.add('filled');
      replay(missing, 'anim-bounce');
      ctx.audio.ding();
      navigator.vibrate?.(15);
      ctx.speak(r.answer.name);

      round++;
      later(() => {
        if (round % STAR_EVERY !== 0) {
          play();
          return;
        }
        void ctx.celebrate().then(() => {
          if (!alive) return;
          ctx.addStar();
          play();
        });
      }, NEXT_MS);
    }
  }

  play();
}

const game: GameModule = { ...meta, start };
export default game;
