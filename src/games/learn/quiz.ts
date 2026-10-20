import { h, replay } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import type { App } from './app';
import { renderChoose, type AnswerView } from './choose';
import { QUESTIONS_PER_STATION, topicOf } from './curriculum';
import { renderDrag } from './drag';
import { recordAnswer, stationRng } from './picker';
import { REWARDS, isWorn, toggleWear, totalRuns } from './progress';
import { buildQuestion, planStation } from './questions';
import type { Scope } from './scope';
import type { ChooseQuestion, DragQuestion, Question, TopicId } from './types';
import { renderVisual } from './visual';

/** The teacher waits this long after a question appears, so the child sees the picture first. */
const ASK_DELAY_MS = 450;
/** After the answer is found and explained, pause before the next question. */
const NEXT_PAUSE_MS = 600;
/** Stuck for this long: the teacher asks again. */
const HINT_MS = 8000;

/**
 * One station: five questions about one topic, on one screen. The same layout for every
 * topic: the teacher and her speech bubble on top, the answers underneath.
 */
export function showQuiz(app: App, topic: TopicId, root: HTMLElement, scope: Scope): void {
  const { ctx, state } = app;
  const info = topicOf(topic);
  const plays = state.runs[topic] ?? 0;
  const rng = stationRng(topic, plays, state.turn);
  const plan = planStation(topic, state.mastery, state.turn, app.env, rng);

  const dots = Array.from({ length: QUESTIONS_PER_STATION }, () => h('span', { class: 'lq-dot' }));
  const back = h('button', { class: 'lq-back', type: 'button', 'aria-label': 'Về bản đồ' }, '🗺️');
  const bubbleText = h('p', { class: 'lq-text' });
  const stim = h('div', { class: 'lq-stim' });
  const replayBtn = h('button', { class: 'lq-replay', type: 'button', 'aria-label': 'Nghe lại' }, '🔊');
  const bubble = h('div', { class: 'lq-bubble' }, bubbleText, stim);
  const answers = h('div', { class: 'lq-answers' });
  const teach = h('div', { class: 'lq-teach' }, app.teacher.el, bubble);
  const screen = h(
    'div',
    { class: `lq lq-${topic}${app.low() ? ' low' : ''}` },
    h('div', { class: 'lq-head' }, back, h('span', { class: 'lq-topic' }, info.icon), h('div', { class: 'lq-dots' }, ...dots), replayBtn),
    teach,
    answers,
  );
  root.replaceChildren(screen);

  let index = 0;
  let q: Question;
  let view: AnswerView | null = null;
  let locked = false;
  let firstTry = true;
  let nudges = 0;
  /** Drag items already marked wrong, so a second slip on the same item is not counted twice. */
  let slipped = new Set<string>();

  const bye = makeTappable(
    back,
    () => {
      app.sayer.stop();
      app.goMap();
    },
    { cooldownMs: 300, feedback: false },
  );
  scope.onDispose(bye);

  function record(concept: string, right: boolean): void {
    state.turn++;
    state.mastery = recordAnswer(state.mastery, concept, right, state.turn);
    app.save();
  }

  function ask(withSound = true): void {
    // Once the answer is found the teacher is explaining it: a late "ask again" must not cut that off.
    if (locked) return;
    const chooseQ = q.type === 'choose' ? q : null;
    if (chooseQ?.sound && withSound) {
      ctx.audio.fx(chooseQ.sound);
      app.sayer.say(q.say, { delay: 1100 });
    } else {
      app.sayer.say(q.say);
    }
  }

  const stopReplay = makeTappable(
    replayBtn,
    () => {
      ctx.hint.touch();
      replay(replayBtn, 'anim-bounce');
      ask();
    },
    { cooldownMs: 250, feedback: false },
  );
  scope.onDispose(stopReplay);

  function armHint(): void {
    nudges = 0;
    ctx.hint.arm(() => {
      nudges++;
      app.teacher.think();
      ask();
      if (nudges >= 2) view?.hintAnswer();
    }, HINT_MS);
  }

  function show(i: number): void {
    index = i;
    view?.destroy();
    firstTry = true;
    locked = false;
    slipped = new Set();
    q = buildQuestion(topic, plan[i]!, state.mastery, app.env, rng);
    dots.forEach((d, n) => {
      d.classList.toggle('done', n < i);
      d.classList.toggle('now', n === i);
    });
    bubbleText.textContent = q.bubble;
    const stimulus = q.type === 'choose' ? q.stimulus : undefined;
    stim.replaceChildren(...(stimulus ? [renderVisual(stimulus)] : []));
    stim.hidden = !stimulus;
    screen.classList.toggle('lq-has-stim', !!stimulus);
    screen.classList.toggle('lq-count', stimulus?.k === 'group');
    screen.dataset.kind = q.type;
    replay(bubble, 'lq-pop');
    view = q.type === 'choose' ? chooseView(q) : dragView(q);
    scope.later(() => ask(), ASK_DELAY_MS);
    armHint();
  }

  function chooseView(cq: ChooseQuestion): AnswerView {
    return renderChoose(answers, cq, {
      onRight(_opt, el) {
        if (locked) return;
        locked = true;
        ctx.hint.clear();
        ctx.audio.ding();
        navigator.vibrate?.(15);
        el.classList.add('right');
        replay(el, 'anim-bounce');
        answers.querySelectorAll('.lq-opt').forEach((o) => o !== el && o.classList.add('faded'));
        app.teacher.cheer();
        record(cq.concept, firstTry);
        app.sayer.say(cq.reveal, { onDone: () => scope.later(next, NEXT_PAUSE_MS) });
      },
      onWrong(opt, el) {
        if (locked) return;
        ctx.hint.touch();
        firstTry = false;
        ctx.audio.boing();
        replay(el, 'anim-shake');
        el.classList.add('wrong');
        app.teacher.think();
        // No scolding: say what the child tapped, then what we are looking for.
        app.sayer.say([...(opt.name ? [{ text: 'Đây là', gap: 250 }, opt.name] : []), ...cq.again], {
          onDone: () => {
            if (cq.sound) ctx.audio.fx(cq.sound);
          },
        });
      },
    });
  }

  function dragView(dq: DragQuestion): AnswerView {
    return renderDrag(
      answers,
      dq,
      {
        onPlaced(item, bin) {
          ctx.hint.touch();
          ctx.audio.ding();
          navigator.vibrate?.(10);
          record(item.concept, !slipped.has(item.id));
          app.sayer.say([`${capText(item.name)}`, `vào ${bin.name}`]);
        },
        onWrongDrop(item, _hit, right) {
          ctx.hint.touch();
          slipped.add(item.id);
          ctx.audio.boing();
          app.teacher.think();
          app.sayer.say([{ text: 'Đây là', gap: 250 }, item.name, `Mình bỏ vào ${right.name} nhé`]);
        },
        onTap(item) {
          ctx.hint.touch();
          ctx.audio.pop(1);
          app.sayer.say([capText(item.name)]);
        },
        onAllPlaced() {
          locked = true;
          ctx.hint.clear();
          app.teacher.cheer();
          scope.later(() => {
            app.sayer.say(['Giỏi quá!'], { onDone: () => scope.later(next, NEXT_PAUSE_MS) });
          }, 500);
        },
      },
      { layer: ctx.stage },
    );
  }

  function next(): void {
    if (index + 1 >= QUESTIONS_PER_STATION) void finish();
    else show(index + 1);
  }

  async function finish(): Promise<void> {
    view?.destroy();
    view = null;
    dots.forEach((d) => {
      d.classList.add('done');
      d.classList.remove('now');
    });
    state.runs[topic] = (state.runs[topic] ?? 0) + 1;
    const earned = REWARDS[totalRuns(state) - 1];
    if (earned && !isWorn(state.wear, earned)) state.wear = toggleWear(state.wear, earned);
    app.save();
    app.teacher.setWear(state.wear);
    ctx.addStar();
    const done = ctx.celebrate();
    app.teacher.cheer();
    await done;
    if (!scope.alive()) return;
    showGift();
  }

  function showGift(): void {
    const earned = REWARDS[totalRuns(state) - 1];
    const go = h('button', { class: 'lq-gift-go', type: 'button', 'aria-label': 'Về bản đồ' }, '➡️');
    const gift = h(
      'div',
      { class: 'lq-gift' },
      h(
        'div',
        { class: 'lq-gift-card' },
        h('div', { class: 'lq-gift-who' }, app.teacher.el, earned ? h('span', { class: 'lq-gift-item' }, earned.emoji) : null),
        h('p', { class: 'lq-gift-text' }, earned ? `Cô có ${earned.name} mới!` : 'Bé giỏi quá!'),
        go,
      ),
    );
    screen.append(gift);
    app.teacher.cheer();
    app.sayer.say(earned ? ['Hoan hô!', `Cô có ${earned.name} mới`] : ['Hoan hô!', 'Bé giỏi quá'], {
      onDone: () => scope.later(() => app.goMap(), 1800),
    });
    const stop = makeTappable(go, () => app.goMap(), { cooldownMs: 300 });
    scope.onDispose(stop);
  }

  scope.onDispose(() => {
    view?.destroy();
    ctx.hint.clear();
  });
  show(0);
}

function capText(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
