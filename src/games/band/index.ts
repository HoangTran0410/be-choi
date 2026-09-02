import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { INSTRUMENTS, QUIZ_ROUNDS, makeQuizRound, playPhrase, type Instrument, type QuizRound } from './logic';
import './style.css';

const NEXT_MS = 900;
/** Let the spoken question finish before the first mystery phrase plays. */
const PROMPT_MS = 1500;

/**
 * Band: seven instrument tiles. Tapping one names it and plays its signature
 * phrase (free mode). The 🎧 button starts a listening quiz: a hidden
 * instrument plays, three tiles stay lit, the child taps the one it heard.
 * Five right answers earn confetti and a star, then back to free mode.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let cancelPhrase: (() => void) | null = null;
  let playingTile: HTMLElement | null = null;
  let quiz: QuizRound | null = null;
  let solved = 0;
  let lastAnswer: string | undefined;
  /** A correct tile was just tapped: ignore taps until the next round starts. */
  let busy = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const root = h('div', { class: 'band' });
  const grid = h('div', { class: 'band-grid' });
  const tiles = new Map<string, HTMLElement>();
  for (const inst of INSTRUMENTS) {
    const tile = h(
      'button',
      {
        class: 'band-inst',
        type: 'button',
        'data-id': inst.id,
        'aria-label': inst.name,
        style: `--band-color:${inst.color}`,
      },
      h('span', { class: 'band-emoji' }, inst.emoji),
    );
    tile.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tap(inst, tile);
    });
    tiles.set(inst.id, tile);
    grid.append(tile);
  }
  const replayBtn = h(
    'button',
    { class: 'btn-round band-replay', type: 'button', 'aria-label': 'Nghe lại', hidden: true },
    '🔁',
  );
  const quizBtn = h('button', { class: 'btn-round band-quiz', type: 'button', 'aria-label': 'Đố nghe' }, '🎧');
  replayBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!quiz) return;
    ctx.hint.touch();
    play(quiz.answer, false);
  });
  quizBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (quiz) exitQuiz();
    else enterQuiz();
  });
  root.append(grid, replayBtn, quizBtn);
  ctx.stage.append(root);

  function later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  }

  function clearTimers(): void {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  }

  function stopPhrase(): void {
    cancelPhrase?.();
    cancelPhrase = null;
    playingTile?.classList.remove('band-playing');
    playingTile = null;
  }

  /** Play `inst`'s phrase; `highlight` lights the tile and bounces its emoji per note (free mode only). */
  function play(inst: Instrument, highlight: boolean): void {
    stopPhrase();
    const tile = highlight ? (tiles.get(inst.id) ?? null) : null;
    const emoji = tile?.firstElementChild ?? null;
    tile?.classList.add('band-playing');
    playingTile = tile;
    cancelPhrase = playPhrase(
      ctx.audio,
      inst,
      () => {
        if (emoji) replay(emoji, 'anim-bounce');
      },
      () => {
        cancelPhrase = null;
        if (playingTile === tile) {
          tile?.classList.remove('band-playing');
          playingTile = null;
        }
      },
    );
  }

  function setDim(options: readonly Instrument[] | null): void {
    for (const [id, tile] of tiles) {
      tile.classList.toggle('band-dim', options !== null && !options.some((o) => o.id === id));
    }
  }

  function nextRound(delay: number): void {
    const round = makeQuizRound(Math.random, lastAnswer);
    quiz = round;
    lastAnswer = round.answer.id;
    root.dataset.answer = round.answer.id;
    setDim(round.options);
    busy = false;
    const mystery = () => play(round.answer, false);
    if (delay > 0) later(mystery, delay);
    else mystery();
    ctx.hint.arm(mystery);
  }

  function enterQuiz(): void {
    stopPhrase();
    solved = 0;
    quizBtn.classList.add('band-on');
    replayBtn.hidden = false;
    ctx.speak('Nghe xem đây là nhạc cụ gì nhé');
    nextRound(PROMPT_MS);
  }

  function exitQuiz(): void {
    quiz = null;
    busy = false;
    solved = 0;
    delete root.dataset.answer;
    clearTimers();
    stopPhrase();
    ctx.hint.clear();
    setDim(null);
    quizBtn.classList.remove('band-on');
    replayBtn.hidden = true;
  }

  function tap(inst: Instrument, tile: HTMLElement): void {
    ctx.hint.touch();
    navigator.vibrate?.(8);
    if (!quiz) {
      ctx.speak(inst.name);
      play(inst, true);
      return;
    }
    if (busy || !quiz.options.some((o) => o.id === inst.id)) return;
    if (inst.id !== quiz.answer.id) {
      ctx.audio.boing();
      replay(tile, 'anim-shake');
      play(quiz.answer, false);
      return;
    }
    busy = true;
    stopPhrase();
    ctx.audio.ding();
    ctx.speak(inst.name);
    replay(tile, 'anim-bounce');
    solved++;
    if (solved < QUIZ_ROUNDS) {
      later(() => nextRound(0), NEXT_MS);
      return;
    }
    ctx.hint.clear();
    later(() => {
      void ctx.celebrate().then(() => {
        if (!alive) return;
        ctx.addStar();
        exitQuiz();
      });
    }, NEXT_MS);
  }

  ctx.hint.clear();
  ctx.onCleanup(() => {
    alive = false;
    stopPhrase();
    clearTimers();
  });
}

const game: GameModule = { ...meta, start };
export default game;
