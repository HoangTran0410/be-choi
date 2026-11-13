import { h, replay, svgEl } from '../../core/dom';
import { sayText } from '../../core/say';
import type { GameContext, GameModule } from '../../core/types';
import { instrumentSvg } from '../show/art';
import { instOf, playPad, sampleKeysOf, timeline, type InstDef, type InstId } from '../show/logic';
import { CLUE_NOTES, choiceCount, nextStreak, pickChoices, pickTarget } from './logic';
import { meta } from './meta';
import './style.css';

const NEXT_MS = 2600;
let uid = 0;

/**
 * Guess the instrument. The ear button plays a few notes of a real instrument and the child picks it
 * from big pictures: two at first, three then four as they get it right. Nothing is ever lost: a wrong
 * tap just plays the instrument that was tapped (a way of getting to know it), then the mystery sound
 * is played again.
 */
function start(ctx: GameContext): void {
  const root = h('div', { class: 'guess' });
  const ear = h('button', { class: 'guess-ear', type: 'button', 'aria-label': 'Nghe lại' }, '🔊');
  const cards = h('div', { class: 'guess-cards' });
  root.append(ear, cards);
  ctx.stage.append(root);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number, fn: () => void): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  let target: InstId | null = null;
  let streak = 0;
  let mistakes = 0;
  let locked = true;
  let rounds = 0;
  let dead = false;
  /** Bumped on every new sound or round so older note timers stop. */
  let epoch = 0;
  let clueTimer: ReturnType<typeof setTimeout> | null = null;

  function clearClueTimer(): void {
    if (clueTimer !== null) {
      clearTimeout(clueTimer);
      timers.delete(clueTimer);
      clueTimer = null;
    }
  }

  /** Play the first `notes` notes of an instrument's tune; calls `done` when they have sounded. Returns ms. */
  function playClue(def: InstDef, notes: number, onNote?: () => void, done?: () => void): number {
    const my = ++epoch;
    const line = timeline(def.phrase.slice(0, notes), def.bpm);
    for (const t of line) {
      playPad(ctx.audio, def, t.p, { delay: t.atMs / 1000, dur: Math.max(0.3, (t.durMs / 1000) * 1.15), vel: 0.85 });
      if (onNote) after(t.atMs, () => epoch === my && onNote());
    }
    const last = line.at(-1);
    const total = last ? last.atMs + last.durMs : 0;
    if (done) after(total + 150, () => epoch === my && done());
    return total;
  }

  function hearTarget(): void {
    if (!target) return;
    const def = instOf(target);
    ear.classList.add('is-playing');
    playClue(def, CLUE_NOTES, undefined, () => ear.classList.remove('is-playing'));
  }

  function render(ids: readonly InstId[]): void {
    cards.replaceChildren();
    cards.dataset.n = String(ids.length);
    cards.style.setProperty('--n', String(ids.length));
    for (const id of ids) {
      const def = instOf(id);
      const card = h(
        'button',
        { class: 'guess-card', type: 'button', 'data-inst': id, 'aria-label': def.name },
        svgEl(instrumentSvg(id, `g${++uid}`, 'guess-art')) as unknown as Node,
      );
      cards.append(card);
    }
  }

  function newRound(): void {
    clearClueTimer();
    ctx.stopSpeech();
    mistakes = 0;
    locked = false;
    target = pickTarget(target);
    const n = choiceCount(streak);
    const choices = pickChoices(target, n, streak >= 5);
    ctx.audio.preloadInstruments?.(choices.flatMap((id) => sampleKeysOf(instOf(id))));
    render(choices);
    ctx.hint.touch();
    const first = rounds++ === 0;
    if (first) {
      void sayText(ctx, 'Nghe thật kỹ nhé! Đây là nhạc cụ nào?').then((done) => {
        if (done && !locked && !dead) hearTarget();
      });
    } else {
      clueTimer = setTimeout(() => {
        timers.delete(clueTimer as ReturnType<typeof setTimeout>);
        clueTimer = null;
        hearTarget();
      }, 450);
      timers.add(clueTimer);
    }
  }

  function onCard(card: HTMLElement): void {
    if (locked || !target) return;
    const id = card.dataset.inst as InstId;
    const def = instOf(id);
    clearClueTimer();
    ear.classList.remove('is-playing');
    if (id === target) {
      locked = true;
      epoch++;
      ctx.stopSpeech();
      card.classList.add('is-right');
      for (const c of cards.children) if (c !== card) c.classList.add('is-off');
      ctx.audio.ding();
      streak = nextStreak(streak, mistakes);
      ctx.addStar();
      after(350, () => void sayText(ctx, `Đúng rồi! ${def.name[0]!.toUpperCase()}${def.name.slice(1)}!`));
      after(NEXT_MS, newRound);
      return;
    }
    // Not this one: it plays so the child gets to know it, then the mystery sound comes again.
    mistakes++;
    replay(card, 'is-wrong');
    replay(card, 'is-sound');
    const len = playClue(def, 3);
    if (mistakes >= 2) {
      const right = cards.querySelector<HTMLElement>(`[data-inst="${target}"]`);
      if (right) after(len + 900, () => replay(right, 'is-sound'));
    }
    clueTimer = setTimeout(() => {
      timers.delete(clueTimer as ReturnType<typeof setTimeout>);
      clueTimer = null;
      if (!locked) hearTarget();
    }, len + 1100);
    timers.add(clueTimer);
  }

  cards.addEventListener('pointerdown', (e) => {
    const card = (e.target as Element).closest<HTMLElement>('.guess-card');
    if (!card) return;
    e.preventDefault();
    ctx.hint.touch();
    onCard(card);
  });
  ear.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    if (locked) return;
    clearClueTimer();
    ctx.stopSpeech();
    hearTarget();
  });

  ctx.hint.arm(() => {
    if (locked) return;
    replay(ear, 'anim-wiggle');
    hearTarget();
  });

  ctx.onCleanup(() => {
    dead = true;
    epoch++;
    for (const t of timers) clearTimeout(t);
    timers.clear();
  });

  newRound();
}

const game: GameModule = { ...meta, start };
export default game;
