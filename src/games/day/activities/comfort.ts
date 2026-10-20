import { h, replay } from '../../../core/dom';
import { COMFORTS, MOOD_LINE, REACTIONS, giggleLine, nextMood, soothedLine, type Comfort, type Mood as FeelMood } from '../../feelings/logic';
import type { Activity } from '../env';

/** Moods soothed before the friend is calm enough to sleep. */
const SOOTHES = 2;
const FLOAT_MS = 1400;
const HAPPY_MS = 2200;

/**
 * Dỗ bạn nhỏ: the friend is upset (sad, cross, startled). A hug, a sweet, a lullaby or a
 * tickle — every one of them works, in any order, as often as wanted. After two the friend is
 * calm. A friend already beaming only giggles.
 */
export const comfort: Activity = (env) => {
  const { ctx, scope, kid, plan } = env;
  let soothed = 0;
  let busy = false;
  let mood: FeelMood = plan.upset;

  const me = env.kidView('big');
  const stage = h('div', { class: 'comfort-kid' }, me);
  const hearts = h('div', { class: 'comfort-meter', 'aria-hidden': 'true' }, ...Array.from({ length: SOOTHES }, () => h('span', {}, '🤍')));
  const buttons = new Map<Comfort, HTMLElement>();
  const bar = h('div', { class: 'comfort-bar' });
  for (const c of COMFORTS) {
    const r = REACTIONS[c];
    const b = h('button', { class: 'comfort-btn', type: 'button', 'aria-label': r.label, 'data-comfort': c }, h('span', { class: 'comfort-icon' }, r.icon), h('span', { class: 'comfort-label' }, r.label));
    buttons.set(c, b);
    scope.tap(b, () => give(c), 0);
    bar.append(b);
  }
  env.host.append(h('div', { class: 'comfort' }, hearts, stage, bar));

  function floatUp(items: readonly string[]): void {
    items.forEach((emoji, i) => {
      const el = h('span', { class: 'comfort-float', style: `--dx:${(i - 1) * 9}vmin;--delay:${i * 120}ms` }, emoji);
      stage.append(el);
      scope.later(() => el.remove(), FLOAT_MS + i * 120);
    });
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
        [523.25, 659.25, 783.99].forEach((f, i) => scope.later(() => ctx.audio.note(f, 0.5), i * 260));
        break;
      case 'tickle':
        [0, 90, 180].forEach((ms) => scope.later(() => ctx.audio.tick(), ms));
        break;
    }
  }

  function upset(): void {
    busy = false;
    mood = nextMood(mood === 'happy' ? null : mood);
    kid.set({ mood });
    env.say(MOOD_LINE[mood]);
    arm();
  }

  function give(c: Comfort): void {
    ctx.hint.touch();
    const r = REACTIONS[c];
    replay(buttons.get(c) as HTMLElement, 'anim-pop');
    sound(c);
    floatUp(r.floaters);
    if (mood === 'happy') {
      replay(me, 'anim-wiggle');
      env.say(giggleLine(c));
      return;
    }
    const was = mood;
    mood = 'happy';
    kid.set({ mood: 'happy', giggle: true });
    scope.later(() => kid.set({ giggle: false }), 1000);
    replay(me, 'anim-bounce');
    env.say(soothedLine(was, c));
    ctx.hint.clear();
    const heart = hearts.children[soothed];
    if (heart) heart.textContent = '💖';
    soothed++;
    if (busy) return;
    busy = true;
    if (soothed >= SOOTHES) {
      scope.later(() => env.say('Bạn nhỏ hết buồn rồi!'), 1500);
      scope.later(() => env.finish(), 3400);
    } else scope.later(upset, HAPPY_MS);
  }

  function arm(): void {
    ctx.hint.arm(() => {
      const c = COMFORTS[Math.floor(Math.random() * COMFORTS.length)];
      const b = c && buttons.get(c);
      if (b) replay(b, 'anim-wiggle');
    });
  }

  kid.set({ mood });
  env.say(MOOD_LINE[mood]);
  arm();
};
