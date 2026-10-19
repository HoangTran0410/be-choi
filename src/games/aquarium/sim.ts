import { perf } from '../../core/frame';
import { decorRate } from '../../core/quality';
import type { GameContext } from '../../core/types';
import { SHAKE_SECONDS, makeBubble, plantAt, settleScenery } from './logic';
import { maxBubbles, type State } from './state';

/** Advance the tank by `dt` seconds. */
export function step(ctx: GameContext, s: State, dt: number): void {
  const { tank, bubbles } = s;
  s.clock += dt;
  // A tank does not go dark in one frame; give the eye a couple of seconds.
  s.dusk += ((s.night ? 1 : 0) - s.dusk) * Math.min(1, dt * 1.2);
  settleScenery(s.plants, s.decor, dt);
  if (s.interest) {
    s.interest.life -= dt;
    if (s.interest.life <= 0) s.interest = null;
  }
  const world = {
    foods: s.foods,
    nudge: s.nudge,
    shelters: s.shelters,
    interest: s.interest,
    neighbours: s.creatures,
    night: s.dusk > 0.5,
  };
  for (const cr of s.creatures) {
    if (cr.update(dt, tank, world)) {
      ctx.audio.pop(1.4);
      for (let i = 0; i < 2; i++) bubbles.push(makeBubble(cr.x, cr.y, tank));
    }
    // A fish brushing past a weed sets it waving, which is what makes the
    // planting feel like part of the water rather than wallpaper.
    if (cr.y > tank.floor - tank.unit * 2.2) {
      const brushed = plantAt(s.plants, cr.x, cr.y, tank);
      if (brushed) brushed.shake = Math.max(brushed.shake, SHAKE_SECONDS * 0.45);
    }
    // A hungry fish lets out a small bubble now and then: the tank asking to be fed.
    if (cr.mood === 'hungry' && Math.random() < dt * 0.5 && bubbles.length < maxBubbles()) {
      bubbles.push(makeBubble(cr.x, cr.y - cr.length * 0.2, tank));
    }
  }
  for (const food of s.foods) {
    if (food.eaten) continue;
    food.y += food.fall * dt;
    food.wobble += dt * 2;
    food.x += Math.sin(food.wobble) * tank.unit * 0.12 * dt;
    if (food.y > tank.floor) food.eaten = true;
  }
  // Eaten flakes leave the list rather than lying in it: the button no longer
  // waits for the water to clear, so nothing else would ever shorten it.
  if (s.foods.some((f) => f.eaten)) s.foods = s.foods.filter((f) => !f.eaten);
  // The star is for a tank that has been fed until nothing is left, however
  // many handfuls that took — so pressing more cannot earn it any faster.
  if (s.feeding && s.foods.length === 0) {
    s.feeding = false;
    // A quiet bell rather than ctx.celebrate(): 🍤 gets pressed again and
    // again, and confetti over the water every time turns a tank to watch
    // into something that keeps interrupting itself.
    ctx.audio.ding();
    ctx.addStar();
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]!;
    b.y -= b.rise * dt;
    b.wobble += dt * 3;
    b.x += Math.sin(b.wobble) * tank.unit * 0.5 * dt;
    if (b.y + b.r < 0) bubbles.splice(i, 1);
  }
  // A slow stream from one corner, so the tank is never quite still.
  if (Math.random() < decorRate(dt * 2.5, perf.low) && bubbles.length < maxBubbles()) {
    bubbles.push(makeBubble(tank.w * 0.9 + Math.random() * tank.unit * 0.3, tank.floor, tank));
  }
}
