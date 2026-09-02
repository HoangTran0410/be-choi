import { h, replay } from '../../core/dom';
import { noteFreq } from '../../core/music';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import { checkStep, extend, GAP_MS, makeSequence, MAX_LEN, PADS, PLAY_MS, STAR_AT, START_LEN } from './logic';
import './style.css';

/** Pause before the first melody so the intro speech can start. */
const INTRO_MS = 600;
/** Pause after a correct repeat before the longer melody plays. */
const NEXT_MS = 800;
/** Pause after a wrong tap before the same melody plays again. */
const RETRY_MS = 900;

const LISTEN = '👂';
const YOUR_TURN = '👆';
const CHEER = '🎉';

/**
 * Simon: four animal pads play a short melody; the child taps it back.
 * The melody grows by one note after each repeat, earns a star at STAR_AT
 * and MAX_LEN notes, then starts over. A wrong tap just replays the melody.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let seq: number[] = [];
  /** Position in `seq` the child has to tap next. */
  let step = 0;
  /** True only while it is the child's turn; taps are ignored otherwise. */
  let listening = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  /** Pending "unlight" timer per pad, so a quick second tap keeps it lit. */
  const lit = new Map<number, ReturnType<typeof setTimeout>>();

  const root = h('div', { class: 'simon' });
  const status = h('div', { class: 'simon-status' }, LISTEN);
  const grid = h('div', { class: 'simon-pads' });
  const padEls = PADS.map((pad, i) => {
    const el = h(
      'button',
      {
        class: 'simon-pad',
        type: 'button',
        'data-index': i,
        'aria-label': pad.name,
        style: `--simon-color:${pad.color}`,
      },
      h('span', { class: 'simon-animal' }, pad.emoji),
    );
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tap(i);
    });
    return el;
  });
  grid.append(...padEls);
  root.append(status, grid);
  ctx.stage.append(root);

  ctx.onCleanup(() => {
    alive = false;
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    lit.clear();
  });

  function later(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const t = setTimeout(() => {
      timers.delete(t);
      if (alive) fn();
    }, ms);
    timers.add(t);
    return t;
  }

  function setStatus(emoji: string): void {
    if (status.textContent === emoji) return;
    status.textContent = emoji;
    replay(status, 'anim-bounce');
  }

  function setSeq(next: number[]): void {
    seq = next;
    root.dataset.seq = seq.join(',');
  }

  /** Light a pad and sound its note for PLAY_MS. */
  function light(index: number): void {
    const pad = PADS[index];
    const el = padEls[index];
    if (!pad || !el) return;
    const pending = lit.get(index);
    if (pending !== undefined) {
      clearTimeout(pending);
      timers.delete(pending);
    }
    el.classList.add('simon-lit');
    ctx.audio.note(noteFreq(pad.note), PLAY_MS / 1000, 'bell');
    lit.set(
      index,
      later(() => {
        lit.delete(index);
        el.classList.remove('simon-lit');
      }, PLAY_MS),
    );
  }

  /** Play the whole melody, then hand over to the child. */
  function playSequence(say?: string): void {
    listening = false;
    step = 0;
    ctx.hint.clear();
    setStatus(LISTEN);
    if (say) ctx.speak(say);
    let i = 0;
    const next = () => {
      const index = seq[i];
      if (index === undefined) {
        yourTurn();
        return;
      }
      i++;
      light(index);
      later(next, PLAY_MS + GAP_MS);
    };
    next();
  }

  function yourTurn(): void {
    step = 0;
    listening = true;
    setStatus(YOUR_TURN);
    ctx.speak('Đến lượt bé');
    ctx.hint.arm(() => playSequence('Nghe nhé'));
  }

  /** The child repeated the whole melody: grow it, or celebrate and start over. */
  function finishRound(): void {
    const len = seq.length;
    const advance = () => {
      setSeq(len < MAX_LEN ? extend(seq) : makeSequence(START_LEN));
      later(() => playSequence('Nghe nhé'), NEXT_MS);
    };
    if (len === STAR_AT || len >= MAX_LEN) {
      void ctx.celebrate().then(() => {
        if (!alive) return;
        ctx.addStar();
        advance();
      });
      return;
    }
    advance();
  }

  function tap(index: number): void {
    if (!listening) return;
    navigator.vibrate?.(8);
    light(index);
    const result = checkStep(seq, step, index);
    if (result === 'ok') {
      step++;
      return;
    }
    listening = false;
    ctx.hint.clear();
    if (result === 'wrong') {
      ctx.audio.boing();
      const el = padEls[index];
      if (el) replay(el, 'anim-shake');
      setStatus(LISTEN);
      ctx.speak('Nghe lại nhé');
      later(() => playSequence(), RETRY_MS);
      return;
    }
    ctx.audio.ding();
    setStatus(CHEER);
    ctx.speak('Đúng rồi!');
    finishRound();
  }

  setSeq(makeSequence(START_LEN));
  later(() => playSequence('Nghe nhé'), INTRO_MS);
}

const game: GameModule = { ...meta, start };
export default game;
