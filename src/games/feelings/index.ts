import { h, replay } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import { meta } from './meta';
import {
  COMFORTS,
  FACE,
  MOOD_LINE,
  REACTIONS,
  SOOTHES_PER_ROUND,
  giggleLine,
  nextMood,
  soothedLine,
  type Comfort,
  type Mood,
} from './logic';
import './style.css';

/** How long the friend beams before the next mood comes along. */
const HAPPY_MS = 2600;
const FLOAT_MS = 1400;

/**
 * Cảm xúc: one big friend whose face changes — sad, cross, startled, sleepy.
 * The child comforts it with a hug, a sweet, a lullaby or a tickle, in any
 * order and as often as they like. Every one of them works; the friend always
 * ends up happy and names the feeling out loud. Five cheered-up moods earn
 * confetti and a star.
 */
function start(ctx: GameContext): void {
  let alive = true;
  let mood: Mood = 'happy';
  let soothed = 0;
  let busy = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const face = h('div', { class: 'feel-face' });
  const friend = h('div', { class: 'feel-friend' }, face);
  const board = h('div', { class: 'g-board feel-board' }, friend);
  const buttons = new Map<Comfort, HTMLElement>();
  for (const c of COMFORTS) {
    const r = REACTIONS[c];
    const btn = h(
      'button',
      { class: 'feel-btn', type: 'button', 'data-comfort': c, 'aria-label': r.label, onclick: () => comfort(c) },
      h('span', { class: 'feel-btn-icon' }, r.icon),
      h('span', { class: 'feel-btn-label' }, r.label),
    );
    buttons.set(c, btn);
  }
  const tray = h('div', { class: 'g-tray feel-tray' }, ...buttons.values());
  ctx.stage.append(board, tray);

  function later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timers.delete(id);
      if (alive) fn();
    }, ms);
    timers.add(id);
  }

  ctx.onCleanup(() => {
    alive = false;
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  });

  function show(m: Mood, emoji = FACE[m]): void {
    mood = m;
    face.textContent = emoji;
    friend.dataset.mood = m;
    replay(friend, 'anim-bounce');
  }

  function float(items: readonly string[]): void {
    items.forEach((emoji, i) => {
      const el = h('span', { class: 'feel-float', style: `--dx:${(i - 1) * 9}vmin;--delay:${i * 120}ms` }, emoji);
      friend.append(el);
      later(() => el.remove(), FLOAT_MS + i * 120);
    });
  }

  function arrive(): void {
    busy = false;
    show(nextMood(mood === 'happy' ? null : mood));
    ctx.speak(MOOD_LINE[mood]);
    armHint();
  }

  function comfort(c: Comfort): void {
    ctx.hint.touch();
    const btn = buttons.get(c);
    if (btn) replay(btn, 'anim-pop');
    const r = REACTIONS[c];
    sound(c);
    navigator.vibrate?.(15);
    float(r.floaters);

    // Already beaming: just a giggle, nothing counts and nothing is wrong.
    if (mood === 'happy') {
      replay(friend, 'anim-wiggle');
      ctx.speak(giggleLine(c));
      return;
    }

    const was = mood;
    show('happy', r.face);
    ctx.speak(soothedLine(was, c));
    ctx.hint.clear();
    soothed++;
    if (busy) return;
    busy = true;
    later(() => {
      if (soothed >= SOOTHES_PER_ROUND) {
        soothed = 0;
        void ctx.celebrate().then(() => {
          if (!alive) return;
          ctx.addStar();
          arrive();
        });
      } else {
        arrive();
      }
    }, HAPPY_MS);
  }

  function sound(c: Comfort): void {
    switch (c) {
      case 'hug':
        ctx.audio.pop(1.2);
        break;
      case 'candy':
        ctx.audio.chomp();
        break;
      case 'lullaby':
        [523.25, 659.25, 783.99].forEach((f, i) => later(() => ctx.audio.note(f, 0.5), i * 260));
        break;
      case 'tickle':
        ctx.audio.tick();
        later(() => ctx.audio.tick(), 90);
        later(() => ctx.audio.tick(), 180);
        break;
    }
  }

  function armHint(): void {
    ctx.hint.arm(() => {
      const c = COMFORTS[Math.floor(Math.random() * COMFORTS.length)];
      const btn = c && buttons.get(c);
      if (btn) replay(btn, 'anim-wiggle');
    });
  }

  arrive();
}

const game: GameModule = { ...meta, start };
export default game;
