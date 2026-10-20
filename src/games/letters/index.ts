import { h, replay, wait } from '../../core/dom';
import type { GameContext, GameModule } from '../../core/types';
import type { SpeechPart } from '../../core/speech';
import { makeTappable } from '../../core/tap';
import { tapOnRelease } from './release';
import { dragScroll } from './dragscroll';
import { meta } from './meta';
import { ALL, DIGITS, STAR_EVERY_TILES, isDigit, lowerOf, splitWord, type Countable, type Glyph, type Word } from './logic';
import { buildCountRound, buildFindRound, easeStreak, levelFor, record, ROUNDS_PER_STAR, type CountRound, type LetterRound, type Mastery, type PictureRound } from './quiz';
import { loadMastery, saveMastery } from './progress';
import './style.css';

export type Mode = 'learn' | 'find' | 'count';

const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: 'learn', icon: '🔊', label: 'Nghe & học' },
  { id: 'find', icon: '🔍', label: 'Tìm chữ' },
  { id: 'count', icon: '🔢', label: 'Đếm số' },
];

/** The mode the child picked last, kept while the app stays open. */
let rememberedMode: Mode = 'learn';

// Speaking speeds: letter names slowest, they are what a 3-year-old struggles to hear.
const NAME_RATE = 0.65;
const WORD_RATE = 0.7;
const TALK_RATE = 0.75;

const say = (text: string, rate = TALK_RATE, pauseAfterMs?: number, onStart?: () => void): SpeechPart => ({ text, rate, pauseAfterMs, onStart });

/** Letter shown as "Bb". */
function letterFace(glyph: Glyph): HTMLElement {
  return isDigit(glyph)
    ? h('span', { class: 'face' }, h('span', { class: 'cap' }, glyph.label))
    : h('span', { class: 'face' }, h('span', { class: 'cap' }, glyph.label), h('span', { class: 'low' }, lowerOf(glyph)));
}

/** A word with its first letter coloured in. */
function wordEl(word: string): HTMLElement {
  const { first, rest } = splitWord(word);
  return h('span', { class: 'word' }, h('span', { class: 'first' }, first), rest);
}

interface CountField {
  el: HTMLElement;
  /** Show the i-th picture (0-based). */
  reveal(i: number): void;
  /** Put the number badge on the i-th picture. */
  mark(i: number): void;
  items: HTMLElement[];
}

/** A group of pictures to count. Touching one counts it out loud, in order. */
function countField(ctx: GameContext, count: number, item: Countable, names: readonly string[], opts: { hidden: boolean }): CountField {
  const items: HTMLElement[] = [];
  let counted = 0;
  const counts = new Set<number>();
  const el = h('div', { class: 'count-field', 'data-count': count });
  if (count === 0) {
    el.append(h('span', { class: 'count-empty' }, '🧺'));
  }
  for (let i = 0; i < count; i++) {
    const pic = h('button', { class: `count-item${opts.hidden ? ' hidden' : ''}`, type: 'button', 'aria-label': item.noun }, item.emoji);
    makeTappable(
      pic,
      () => {
        if (pic.classList.contains('hidden')) return;
        ctx.hint.touch();
        ctx.audio.pop(1 + (i % 5) * 0.08);
        replay(pic, 'anim-bounce');
        if (!counts.has(i)) {
          counts.add(i);
          counted++;
          pic.dataset.n = String(counted);
          pic.append(h('span', { class: 'badge' }, String(counted)));
          void ctx.speakSeq([say(names[counted] ?? '', NAME_RATE, 0)]);
        } else {
          void ctx.speakSeq([say(names[Number(pic.dataset.n)] ?? '', NAME_RATE, 0)]);
        }
      },
      { cooldownMs: 0, ctx },
    );
    items.push(pic);
    el.append(pic);
  }
  return {
    el,
    items,
    reveal(i) {
      const pic = items[i];
      if (!pic) return;
      pic.classList.remove('hidden');
      replay(pic, 'anim-bounce');
      ctx.audio.pop(1 + i * 0.1);
    },
    mark(i) {
      const pic = items[i];
      if (!pic || pic.querySelector('.badge')) return;
      pic.dataset.n = String(i + 1);
      pic.append(h('span', { class: 'badge' }, String(i + 1)));
      replay(pic, 'anim-bounce');
      ctx.audio.pop(1 + i * 0.1);
    },
  };
}

const NUMBER_WORDS = DIGITS.map((d) => d.name);

function start(ctx: GameContext): void {
  const all = ALL;
  let alive = true;
  /** Bumped whenever the screen changes, so late timers and speech callbacks do nothing. */
  let gen = 0;
  let mode: Mode = rememberedMode;
  let mastery: Mastery = loadMastery();
  let streak = 0;
  /** Right answers towards the next star. */
  let correct = 0;
  let lastKey: string | undefined;

  const modeBar = h('nav', { class: 'letters-modes', 'aria-label': 'Chọn cách chơi' });
  const main = h('div', { class: 'letters-main' });
  const focus = h('div', { class: 'letters-focus', hidden: true });
  const root = h('div', { class: 'letters', 'data-mode': mode }, modeBar, main, focus);
  ctx.stage.append(root);

  ctx.onCleanup(() => {
    alive = false;
    gen++;
    ctx.stopSpeech();
  });

  const current = (g: number): boolean => alive && g === gen;

  // ---- mode buttons ----
  const modeButtons = MODES.map((m) => {
    const btn = h('button', { class: 'mode-btn', type: 'button', 'aria-label': m.label, 'data-mode': m.id }, h('span', { class: 'mode-icon' }, m.icon), h('span', { class: 'mode-label' }, m.label));
    makeTappable(btn, () => setMode(m.id), { cooldownMs: 0, ctx });
    return btn;
  });
  modeBar.append(...modeButtons);

  function setMode(next: Mode): void {
    mode = next;
    rememberedMode = next;
    gen++;
    ctx.stopSpeech();
    ctx.hint.clear();
    closeFocus(false);
    root.dataset.mode = next;
    for (const b of modeButtons) b.classList.toggle('on', b.dataset.mode === next);
    ctx.audio.pop(1.1);
    if (next === 'learn') showLearn();
    else if (next === 'find') nextFind();
    else nextCount();
  }

  // ---- stars strip (find / count) ----
  function starsEl(): HTMLElement {
    return h('div', { class: 'quiz-stars', 'aria-hidden': 'true' }, ...Array.from({ length: ROUNDS_PER_STAR }, (_, i) => h('span', { class: `quiz-star${i < correct ? ' on' : ''}` }, '⭐')));
  }
  function refreshStars(): void {
    const slots = main.querySelectorAll('.quiz-star');
    slots.forEach((s, i) => s.classList.toggle('on', i < correct));
    const last = slots[Math.min(correct, slots.length) - 1];
    if (last) replay(last, 'anim-bounce');
  }

  /** A round ended well: tick the strip; every fifth is a celebration and a star. */
  async function roundWon(g: number): Promise<void> {
    correct++;
    refreshStars();
    if (correct < ROUNDS_PER_STAR) return;
    await wait(500);
    if (!current(g)) return;
    await ctx.celebrate();
    if (!current(g)) return;
    ctx.addStar();
    correct = 0;
  }

  function remember(key: string, firstTry: boolean): void {
    mastery = record(mastery, key, firstTry);
    lastKey = key;
    saveMastery(mastery);
    streak = firstTry ? streak + 1 : easeStreak(streak);
  }

  // ---- Nghe & học ----
  /** One board, letters then digits; opened tiles are remembered while the game stays open. */
  const touched = new Set<number>();
  /** Stars already given for opened tiles (one per STAR_EVERY_TILES). */
  let rewarded = 0;
  let tilesEls: HTMLElement[] = [];

  function showLearn(): void {
    const board = h('div', { class: 'letters-board' });
    const grid = h('div', { class: 'letters-grid', tabindex: 0, 'aria-label': 'Bảng chữ và số' });
    const more = h('div', { class: 'letters-more', 'aria-hidden': 'true' });
    board.append(grid, more);
    main.replaceChildren(board);
    dragScroll(grid, ctx);

    const lettersCount = all.findIndex((x) => isDigit(x));
    tilesEls = all.map((glyph, i) => {
      const tile = h(
        'button',
        { class: `letter-tile${isDigit(glyph) ? ' digit' : ''}${touched.has(i) ? ' seen' : ''}`, type: 'button', 'aria-label': isDigit(glyph) ? `Số ${glyph.label}` : `Chữ ${glyph.label}` },
        letterFace(glyph),
        h('span', { class: 'letter-pic' }, isDigit(glyph) ? glyph.emoji : glyph.words[0]!.emoji),
      );
      tile.style.setProperty('--hue', String((i * 37) % 360));
      // On release, not on press: a swipe that starts on a tile scrolls the board instead of opening it.
      tapOnRelease(
        tile,
        () => {
          ctx.hint.touch();
          ctx.audio.pop(1 + (i % 5) * 0.1);
          navigator.vibrate?.(10);
          openFocus(i);
        },
        ctx,
      );
      return tile;
    });
    const divider = h('div', { class: 'letters-divider' }, 'Số');
    grid.replaceChildren(...tilesEls.slice(0, lettersCount), divider, ...tilesEls.slice(lettersCount));

    // A soft fade at the bottom says "there is more"; it goes away at the very end.
    const updateMore = (): void => {
      const left = grid.scrollHeight - grid.clientHeight - grid.scrollTop;
      board.classList.toggle('at-end', left < 8);
    };
    grid.addEventListener(
      'scroll',
      () => {
        ctx.hint.touch();
        updateMore();
      },
      { passive: true },
    );
    updateMore();
    requestAnimationFrame?.(updateMore);

    armLearnHint();
  }

  function markSeen(index: number): void {
    touched.add(index);
    tilesEls[index]?.classList.add('seen');
  }

  /** Every STAR_EVERY_TILES newly opened tiles: a celebration and a star. */
  async function maybeReward(): Promise<void> {
    if (touched.size < (rewarded + 1) * STAR_EVERY_TILES) return;
    rewarded++;
    const g = gen;
    ctx.hint.clear();
    await wait(600);
    if (!current(g)) return;
    await ctx.celebrate();
    if (!current(g)) return;
    ctx.addStar();
    if (mode === 'learn' && focus.hidden) armLearnHint();
  }

  /** Big letter in the middle: its name, then its pictures one after another. */
  function openFocus(index: number): void {
    ctx.hint.clear();
    const glyphs = all;
    const glyph = glyphs[index]!;
    markSeen(index);
    focus.hidden = false;
    focus.className = `letters-focus${isDigit(glyph) ? ' digits' : ''}`;
    focus.style.setProperty('--hue', String((index * 37) % 360));

    const face = h('button', { class: 'focus-letter', type: 'button', 'aria-label': `Chữ ${glyph.label}` }, letterFace(glyph));
    const nav = h('div', { class: 'focus-nav' });
    const body = h('div', { class: 'focus-body' });
    const goto = (to: number): void => openFocus((to + glyphs.length) % glyphs.length);

    const mkNav = (cls: string, text: string, label: string, fn: () => void): HTMLElement => {
      const b = h('button', { class: `focus-btn ${cls}`, type: 'button', 'aria-label': label }, text);
      makeTappable(b, fn, { cooldownMs: 150, ctx });
      return b;
    };
    nav.append(
      mkNav('prev', '‹', 'Chữ trước', () => goto(index - 1)),
      mkNav('close', '✕', 'Đóng', () => closeFocus(true)),
      mkNav('next', '›', 'Chữ sau', () => goto(index + 1)),
    );

    let parts: SpeechPart[];
    const pulse = (): void => replay(face, 'anim-bounce');
    if (isDigit(glyph)) {
      const n = Number(glyph.label);
      const field = countField(ctx, n, { emoji: glyph.emoji, noun: '' }, NUMBER_WORDS, { hidden: true });
      body.append(field.el);
      parts = [say(glyph.name, NAME_RATE, 900, pulse)];
      if (n === 0) {
        parts.push(say('không có gì cả', WORD_RATE, 0));
      } else {
        for (let i = 0; i < n; i++) parts.push(say(NUMBER_WORDS[i + 1]!, NAME_RATE, 550, () => field.reveal(i)));
        parts.push(say(glyph.name, NAME_RATE, 0, pulse));
      }
    } else {
      const cards = glyph.words.map((word) => {
        const card = h('button', { class: 'word-card hidden', type: 'button', 'aria-label': word.word }, h('span', { class: 'pic' }, word.emoji), wordEl(word.word));
        makeTappable(
          card,
          () => {
            ctx.hint.touch();
            card.classList.remove('hidden');
            ctx.audio.pop(1.2);
            replay(card, 'anim-bounce');
            void ctx.speakSeq(wordParts(glyph, word));
          },
          { cooldownMs: 0, ctx },
        );
        return card;
      });
      body.append(...cards);
      parts = [
        say(glyph.name, NAME_RATE, 1000, pulse),
        ...glyph.words.map((word, i) =>
          say(word.word, WORD_RATE, 750, () => {
            const card = cards[i]!;
            card.classList.remove('hidden');
            replay(card, 'anim-bounce');
            ctx.audio.pop(1 + i * 0.12);
          }),
        ),
      ];
    }
    const play = (): void => {
      void ctx.speakSeq(parts);
      // a child who sits still in front of the pictures is nudged to touch one
      ctx.hint.arm(() => {
        const pics = [...body.children];
        const pick = pics[Math.floor(Math.random() * pics.length)];
        if (pick) replay(pick as HTMLElement, 'anim-wiggle');
        void ctx.speakSeq([say(isDigit(glyph) ? 'Bé chạm vào hình để đếm nhé' : 'Bé chạm vào hình để nghe nhé', TALK_RATE, 0)]);
      });
    };
    makeTappable(
      face,
      () => {
        ctx.audio.pop(1);
        pulse();
        void ctx.speakSeq([say(glyph.name, NAME_RATE, 0, pulse)]);
      },
      { cooldownMs: 0, ctx },
    );
    focus.replaceChildren(face, body, nav);
    replay(focus, 'focus-in');
    play();
  }

  /** Tapped on its own: the opening sound, a beat, then the whole word. */
  function wordParts(glyph: Glyph, word: Word): SpeechPart[] {
    return [say(glyph.sound, NAME_RATE, 450), say(word.word, WORD_RATE, 0)];
  }

  function closeFocus(speakNext: boolean): void {
    if (focus.hidden) return;
    ctx.stopSpeech();
    focus.hidden = true;
    focus.replaceChildren();
    if (mode !== 'learn') return;
    armLearnHint();
    if (speakNext) void maybeReward();
  }

  function armLearnHint(): void {
    ctx.hint.arm(() => {
      const next = main.querySelector('.letter-tile:not(.seen)');
      if (next) {
        next.scrollIntoView?.({ block: 'nearest' });
        replay(next as HTMLElement, 'anim-wiggle');
      }
      void ctx.speakSeq([say('Bé chạm vào một chữ nhé', TALK_RATE, 0)]);
    });
  }

  // ---- Tìm chữ ----
  function nextFind(): void {
    const g = ++gen;
    const round = buildFindRound({ streak, mastery }, Math.random, lastKey);
    renderFind(round, g);
  }

  function questionFor(round: LetterRound | PictureRound): SpeechPart[] {
    return round.kind === 'letter'
      ? [say('Chữ', TALK_RATE, 300), say(round.target.name, NAME_RATE, 550), say('đâu nào?', TALK_RATE, 0)]
      : [say('Hình nào bắt đầu bằng chữ', TALK_RATE, 400), say(round.target.name, NAME_RATE, 550), say('nhỉ?', TALK_RATE, 0)];
  }

  function renderFind(round: LetterRound | PictureRound, g: number): void {
    const target = round.target;
    let locked = false;
    let wrong = false;
    const ask = (): void => void ctx.speakSeq(questionFor(round));

    const prompt = h(
      'button',
      { class: 'quiz-prompt', type: 'button', 'aria-label': 'Nghe lại câu hỏi' },
      h('span', { class: 'speaker' }, '🔊'),
      round.kind === 'letter'
        ? h('span', { class: 'prompt-text' }, 'Chữ ', h('b', {}, target.label), ' đâu nào?')
        : h('span', { class: 'prompt-text' }, 'Hình nào bắt đầu bằng chữ ', h('b', {}, `${target.label}${lowerOf(target)}`), '?'),
    );
    makeTappable(prompt, ask, { cooldownMs: 300, ctx });

    const optionEls = round.options.map((opt, i) => {
      const isCorrect = round.kind === 'letter' ? (opt as Glyph).label === target.label : (opt as { correct: boolean }).correct;
      const btn =
        round.kind === 'letter'
          ? h('button', { class: 'quiz-opt letter-opt', type: 'button', 'aria-label': (opt as Glyph).label }, letterFace(opt as Glyph))
          : h('button', { class: 'quiz-opt pic-opt', type: 'button', 'aria-label': (opt as { word: Word }).word.word }, (opt as { word: Word }).word.emoji);
      btn.style.setProperty('--hue', String(((i + 1) * 83 + target.label.charCodeAt(0) * 7) % 360));
      makeTappable(
        btn,
        () => {
          if (locked) return;
          ctx.hint.touch();
          if (isCorrect) {
            locked = true;
            ctx.hint.clear();
            btn.classList.add('good');
            replay(btn, 'anim-bounce');
            ctx.audio.ding();
            remember(target.label, !wrong);
            const pop: SpeechPart[] =
              round.kind === 'letter'
                ? [say('Đúng rồi!', 0.85, 300), say(`chữ ${target.name}`, NAME_RATE, 0)]
                : [say('Đúng rồi!', 0.85, 300), ...wordParts(target, (opt as { word: Word }).word)];
            void advance(g, pop, () => roundWon(g), nextFind);
          } else {
            wrong = true;
            streak = easeStreak(streak);
            replay(btn, 'anim-wiggle');
            ctx.audio.pop(0.8);
            const said =
              round.kind === 'letter'
                ? [say(`Đây là chữ ${(opt as Glyph).name}`, NAME_RATE, 700), say(`mình tìm chữ ${target.name} nhé`, WORD_RATE, 0)]
                : [say(`Đây là ${(opt as { word: Word }).word.word}`, WORD_RATE, 700), say(`mình tìm hình bắt đầu bằng chữ ${target.name} nhé`, WORD_RATE, 0)];
            void ctx.speakSeq(said);
          }
        },
        { cooldownMs: 0, ctx },
      );
      return { btn, isCorrect };
    });

    const options = h('div', { class: `quiz-options n${round.options.length}` }, ...optionEls.map((o) => o.btn));
    main.replaceChildren(prompt, options, starsEl());
    refreshStarsQuiet();
    ctx.hint.arm(() => {
      ask();
      const right = optionEls.find((o) => o.isCorrect);
      if (right) replay(right.btn, 'anim-wiggle');
    }, 9000);
    // let the sound of the screen change finish before the question
    void wait(350).then(() => {
      if (current(g)) ask();
    });
  }

  function refreshStarsQuiet(): void {
    main.querySelectorAll('.quiz-star').forEach((s, i) => s.classList.toggle('on', i < correct));
  }

  /** Speak `parts` and give the child at least a beat to look, then move on. */
  async function advance(g: number, parts: SpeechPart[], won: () => Promise<void>, next: () => void): Promise<void> {
    await Promise.all([ctx.speakSeq(parts), wait(1300)]);
    if (!current(g)) return;
    await won();
    if (!current(g)) return;
    next();
  }

  // ---- Đếm số ----
  function nextCount(): void {
    const g = ++gen;
    const level = levelFor(streak);
    const lastCount = lastKey && /^\d$/.test(lastKey) ? Number(lastKey) : undefined;
    renderCount(buildCountRound(level, mastery, Math.random, lastCount), g);
  }

  function renderCount(round: CountRound, g: number): void {
    let locked = false;
    let wrong = false;
    const noun = round.item.noun;
    const ask = (): void => void ctx.speakSeq([say('Có mấy', TALK_RATE, 250), say(noun, WORD_RATE, 450), say('nhỉ?', TALK_RATE, 0)]);
    const prompt = h(
      'button',
      { class: 'quiz-prompt', type: 'button', 'aria-label': 'Nghe lại câu hỏi' },
      h('span', { class: 'speaker' }, '🔊'),
      h('span', { class: 'prompt-text' }, `Có mấy ${noun}?`),
    );
    makeTappable(prompt, ask, { cooldownMs: 300, ctx });
    const field = countField(ctx, round.count, round.item, NUMBER_WORDS, { hidden: false });

    const optionEls = round.options.map((opt, i) => {
      const isCorrect = opt.label === String(round.count);
      const btn = h('button', { class: 'quiz-opt num-opt', type: 'button', 'aria-label': opt.label }, h('span', { class: 'face' }, h('span', { class: 'cap' }, opt.label)));
      btn.style.setProperty('--hue', String(((i + 1) * 83 + round.count * 31) % 360));
      makeTappable(
        btn,
        () => {
          if (locked) return;
          ctx.hint.touch();
          if (isCorrect) {
            locked = true;
            ctx.hint.clear();
            btn.classList.add('good');
            replay(btn, 'anim-bounce');
            ctx.audio.ding();
            remember(opt.label, !wrong);
            const say1 = round.count === 0 ? 'không có quả nào' : `${opt.name} ${noun}`;
            void advance(g, [say('Đúng rồi!', 0.85, 300), say(say1, WORD_RATE, 0)], () => roundWon(g), nextCount);
          } else {
            wrong = true;
            streak = easeStreak(streak);
            replay(btn, 'anim-wiggle');
            ctx.audio.pop(0.8);
            const parts: SpeechPart[] = [say(`Đây là số ${opt.name}`, NAME_RATE, 700), say('mình đếm nhé', WORD_RATE, 600)];
            for (let i = 0; i < round.count; i++) parts.push(say(NUMBER_WORDS[i + 1]!, NAME_RATE, 500, () => field.mark(i)));
            if (round.count === 0) parts.push(say('không có gì cả', WORD_RATE, 0));
            void ctx.speakSeq(parts);
          }
        },
        { cooldownMs: 0, ctx },
      );
      return { btn, isCorrect };
    });

    const options = h('div', { class: `quiz-options n${round.options.length}` }, ...optionEls.map((o) => o.btn));
    main.replaceChildren(prompt, field.el, options, starsEl());
    refreshStarsQuiet();
    ctx.hint.arm(() => {
      ask();
      const right = optionEls.find((o) => o.isCorrect);
      if (right) replay(right.btn, 'anim-wiggle');
    }, 10000);
    void wait(350).then(() => {
      if (current(g)) ask();
    });
  }

  // ---- go ----
  for (const b of modeButtons) b.classList.toggle('on', b.dataset.mode === mode);
  if (mode === 'learn') showLearn();
  else if (mode === 'find') nextFind();
  else nextCount();
}

const game: GameModule = { ...meta, start };
export default game;
