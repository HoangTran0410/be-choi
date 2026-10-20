import { h, mulberry32, replay } from '../../../core/dom';
import { makeFeedRound } from '../../feed/logic';
import { createFinisher } from '../done';
import type { Activity } from '../env';

/** Animals fed in one go. */
const PETS = 3;

/**
 * Cho thú ăn: a hungry animal with three foods to choose from. Drag its food to its mouth, or
 * just tap it. The wrong food makes the animal shake its head and nothing is lost. After the
 * third animal the ✓ shows, and more animals keep coming for as long as the child plays.
 */
export const pet: Activity = (env) => {
  const { ctx, scope, plan } = env;
  const rng = mulberry32(plan.seed + 41);
  const shown: string[] = [];
  let fed = 0;

  const animal = h('div', { class: 'pet-animal' });
  const mouth = h('div', { class: 'pet-mouth' });
  const meter = h('div', { class: 'pet-meter', 'aria-hidden': 'true' }, ...Array.from({ length: PETS }, () => h('span', {}, '🤍')));
  const scene = h('div', { class: 'pet-scene' }, animal, mouth);
  const tray = h('div', { class: 'pet-tray' });
  env.host.append(h('div', { class: 'pet' }, meter, scene, tray));
  const fin = createFinisher(env);

  function round(): void {
    const r = makeFeedRound(rng, shown);
    if (shown.includes(r.animal.emoji)) shown.length = 0;
    shown.push(r.animal.emoji);
    animal.textContent = r.animal.emoji;
    animal.classList.remove('full');
    replay(animal, 'anim-bounce');
    env.say(`${r.animal.name} đói rồi!`);
    let eaten = false;
    const foods = r.foods.map((f) => {
      const b = h('button', { class: 'pet-food', type: 'button', 'aria-label': f.name, 'data-emoji': f.emoji }, f.emoji);
      scope.piece(b, () => mouth, () => {
        ctx.hint.touch();
        fin.touch();
        if (eaten) return;
        if (f.emoji !== r.correct.emoji) {
          replay(animal, 'anim-shake');
          ctx.audio.boing();
          env.say('Không phải món này!');
          return;
        }
        eaten = true;
        b.classList.add('eaten');
        animal.classList.add('full');
        ctx.audio.chomp();
        scope.later(() => ctx.audio.chomp(), 180);
        replay(animal, 'anim-bounce');
        env.say('Ngon quá!');
        const heart = meter.children[fed];
        if (heart) heart.textContent = '❤️';
        fed++;
        if (fed === PETS) {
          ctx.hint.clear();
          scope.later(() => env.say('Các bạn thú no rồi!… Bấm dấu xanh… hoặc cho ăn tiếp!'), 800);
        }
        if (fed >= PETS) fin.ready();
        scope.later(round, 1400);
      });
      return b;
    });
    tray.replaceChildren(...foods);
    ctx.hint.arm(() => {
      env.say('Cho bạn thú ăn nào');
      const right = foods.find((b) => b.dataset.emoji === r.correct.emoji);
      if (right) replay(right, 'anim-wiggle');
      replay(mouth, 'anim-pulse');
    });
  }
  round();
};
