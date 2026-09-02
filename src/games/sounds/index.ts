import { h, replay } from '../../core/dom';
import type { Item } from '../../core/content';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { CORRECT_FOR_STAR, makeRound, voiceFor } from './logic';
import './style.css';

/** The question is asked this long after the cards appear, so the child sees them first. */
const ASK_MS = 600;
/** A tap on the speaker cannot repeat the sound faster than this. */
const REPEAT_MS = 500;
const WRONG_MS = 700;
const NEXT_ROUND_MS = 900;

/**
 * Ai kêu đấy?: a sound plays and the child picks the animal that made it.
 *
 * Two animals to begin with and four once they have the idea, and never two
 * animals with the same voice in the same question — the lion and the tiger both
 * roar, so they never turn up together.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let round = 0;
  let correct = 0;
  let answer: Item | null = null;
  let locked = false;
  let lastPlay = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const speaker = h('button', { class: 'sounds-speaker', type: 'button', 'aria-label': 'nghe lại' }, '🔊');
  const board = h('div', { class: 'g-board sounds-board' });
  const hint = h('p', { class: 'sounds-hint' }, 'Ai kêu đấy?');
  const wrap = h('div', { class: 'sounds' }, h('div', { class: 'sounds-top' }, speaker, hint), board);
  ctx.stage.append(wrap);

  function later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
  }

  /** Play the animal's voice, with the speaker bouncing so the sound has a source. */
  function ask(): void {
    if (!answer) return;
    const now = Date.now();
    if (now - lastPlay < REPEAT_MS) return;
    lastPlay = now;
    replay(speaker, 'sounds-ringing');
    ctx.audio.fx(voiceFor(answer));
  }

  function wrong(card: HTMLElement): void {
    ctx.audio.boing();
    replay(card, 'anim-wiggle');
    card.classList.add('sounds-wrong');
    later(() => card.classList.remove('sounds-wrong'), WRONG_MS);
    ctx.speak('Chưa đúng, nghe lại nhé!');
    later(ask, WRONG_MS * 0.6);
  }

  async function right(card: HTMLElement, item: Item): Promise<void> {
    locked = true;
    ctx.hint.clear();
    card.classList.add('sounds-right');
    replay(card, 'anim-bounce');
    for (const other of board.querySelectorAll('.sounds-card')) {
      if (other !== card) other.classList.add('sounds-faded');
    }
    ctx.audio.ding();
    navigator.vibrate?.(15);
    ctx.speak(item.name);
    correct++;
    if (correct % CORRECT_FOR_STAR === 0) {
      await ctx.celebrate();
      if (!alive) return;
      ctx.addStar();
    }
    later(() => {
      round++;
      play(item.emoji);
    }, NEXT_ROUND_MS);
  }

  function play(exclude?: string): void {
    if (!alive) return;
    locked = false;
    const r = makeRound(round, Math.random, exclude);
    answer = r.answer;
    board.replaceChildren(
      ...r.choices.map((item) => {
        const card = h('button', { class: 'g-item sounds-card', type: 'button', 'data-emoji': item.emoji, 'aria-label': item.name }, item.emoji);
        card.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          ctx.hint.touch();
          if (locked) return;
          if (item.emoji === answer?.emoji) void right(card, item);
          else wrong(card);
        });
        return card;
      }),
    );
    later(ask, ASK_MS);
    ctx.hint.arm(() => {
      ask();
      replay(speaker, 'anim-wiggle');
    });
  }

  speaker.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    ask();
  });

  ctx.onCleanup(() => {
    alive = false;
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });

  play();
}

const game: GameModule = { ...meta, start };
export default game;
