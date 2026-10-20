import { replay } from '../../core/dom';
import type { GameContext } from '../../core/types';
import { addFood } from './logic';
import { save } from './persist';
import type { Picker } from './picker';
import type { State } from './state';

/**
 * How soon after a press the button drops another handful. A two-year-old
 * presses a button the way they press a doorbell, and waiting for the last
 * flake to be eaten before the next press does anything reads as broken; this
 * is only long enough to keep one press from counting twice.
 */
const FEED_EVERY = 0.5;

/** The lamp, the fish picker button, the food button and the hint. */
export function bindControls(ctx: GameContext, s: State, picker: Picker): void {
  const { lamp, add, feed } = s.els;

  // Opened on pointerup, not pointerdown: opening on the press means the release
  // of that same tap lands on whichever fish the panel put under the finger.
  lamp.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    s.night = !s.night;
    lamp.textContent = s.night ? '☀️' : '🌙';
    s.els.root.classList.toggle('aquarium-night', s.night);
    replay(lamp, 'anim-bounce');
    ctx.audio.tick();
    ctx.speak(s.night ? 'Tắt đèn, ngủ ngon nhé!' : 'Trời sáng rồi!');
    // Everybody notices the lights going out.
    for (const cr of s.creatures) cr.joy = 1;
    save(s);
  });

  add.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    replay(add, 'anim-bounce');
  });
  add.addEventListener('pointerup', (e) => {
    e.preventDefault();
    ctx.hint.touch();
    picker.open();
  });

  feed.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (s.clock - s.lastFed < FEED_EVERY) return;
    s.lastFed = s.clock;
    // Said over every press it turns into a stutter, because each phrase cuts
    // off the one before it. Once per helping of food is what it is for.
    const first = s.foods.length === 0;
    s.feeding = true;
    s.foods = addFood(s.foods, s.tank);
    ctx.audio.tick();
    replay(feed, 'anim-bounce');
    if (first) ctx.speak('Cho cá ăn nào!');
  });

  ctx.hint.arm(() => {
    // Point at whatever the tank needs: food when they are hungry, a new friend otherwise.
    const starving = s.creatures.filter((cr) => cr.mood === 'hungry').length;
    ctx.speak(starving > s.creatures.length / 3 ? 'Cá đói rồi, cho cá ăn nhé.' : 'Bé chạm vào cá nhé.');
    replay(starving > s.creatures.length / 3 ? feed : add, 'anim-wiggle');
    const cr = s.creatures[Math.floor(Math.random() * s.creatures.length)];
    if (cr) cr.joy = 0.8;
  });
}
