import { shuffle } from '../../core/dom';
import { LETTER_WORDS, type Pic } from './curriculum';
import {
  DANGEROUS,
  DAY_PARTS,
  HARMLESS,
  LR_THINGS,
  OPPOSITES,
  SAFETY_SCENES,
  SEASONS,
  SOUND_LETTERS,
  SOUND_NAMES,
  TONE_MARKED_WORDS,
  TONE_NAME,
  TONE_WORDS,
  blankTone,
  toneOf,
  tonedVowel,
  type OppositePair,
  type Side,
} from './packs';
import { optionCount } from './picker';
import type { ChooseQuestion, Option, TopicId, Visual } from './types';

type Rng = () => number;

const oneOf = <T>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)]!;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const emojiOpt = (e: string, name: string): Option => ({ id: e, visual: { k: 'emoji', v: e }, name });
const emojiV = (e: string): Visual => ({ k: 'emoji', v: e });

/** Keep the first of each id: pictures borrowed from other sets may repeat. */
function unique(list: readonly Option[]): Option[] {
  const seen = new Set<string>();
  return list.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
}

// ---- Vần & dấu thanh ----

/** True when `name` starts with this consonant as one sound (not "th", "ch", "nh", "gh"…). */
export function startsWithSound(name: string, letter: string): boolean {
  const n = name.toLowerCase();
  const l = letter.toLowerCase();
  if (!n.startsWith(l)) return false;
  return !(n[1] === 'h' && 'cgnt'.includes(l));
}

function soundQuestion(lvl: number, rng: Rng): ChooseQuestion {
  const letter = oneOf(SOUND_LETTERS, rng);
  const sound = SOUND_NAMES[letter]!;
  const wordsFor = (l: string): Pic[] => (LETTER_WORDS[l] ?? []).filter((w) => startsWithSound(w.name, l));
  const answer = oneOf(wordsFor(letter), rng);
  const others = shuffle(SOUND_LETTERS.filter((l) => l !== letter), rng)
    .map((l) => oneOf(wordsFor(l), rng))
    .filter((w) => w.emoji !== answer.emoji)
    .slice(0, optionCount(lvl) - 1);
  return {
    type: 'choose',
    topic: 'tones',
    concept: 'T:start',
    say: [`Âm ${sound}`, 'Cái nào bắt đầu bằng âm này?'],
    bubble: `Cái nào bắt đầu bằng âm "${letter.toLowerCase()}"?`,
    stimulus: { k: 'text', v: `${letter.toLowerCase()}` },
    options: shuffle([answer, ...others].map((w) => emojiOpt(w.emoji, w.name)), rng),
    answerId: answer.emoji,
    again: [`Mình tìm cái bắt đầu bằng âm ${sound} nhé.`],
    reveal: [`${cap(answer.name)} bắt đầu bằng âm ${sound}`],
  };
}

function hearQuestion(lvl: number, rng: Rng): ChooseQuestion {
  const w = oneOf(TONE_WORDS, rng);
  const wantPics = lvl >= 1 && w.family.pics.length >= 2 && rng() < 0.5;
  const n = optionCount(lvl);
  const base = { type: 'choose' as const, topic: 'tones' as const, concept: 'T:hear' };
  if (wantPics) {
    // By ear alone: "gà" or "ga"? The written word is there for the child who can read it.
    const mates = shuffle(w.family.pics.filter((p) => p.w !== w.w), rng);
    const fill = shuffle(TONE_WORDS.filter((x) => x.family !== w.family), rng);
    const options = unique(
      [w, ...mates, ...fill].map((p) => emojiOpt(p.emoji, p.name)),
    ).slice(0, n);
    return {
      ...base,
      say: [w.w, 'là cái nào?'],
      bubble: 'Cái nào đây?',
      stimulus: { k: 'text', v: w.w },
      options: shuffle(options, rng),
      answerId: w.emoji,
      again: ['Nghe lại nhé.', w.w],
      reveal: [w.w, cap(w.name)],
    };
  }
  const forms = shuffle(w.family.forms.filter((f) => f !== w.w), rng).slice(0, n - 1);
  return {
    ...base,
    say: [w.w, 'Chữ nào đây?'],
    bubble: 'Chữ nào đây?',
    stimulus: emojiV(w.emoji),
    options: shuffle([w.w, ...forms].map((f): Option => ({ id: f, visual: { k: 'text', v: f }, name: f })), rng),
    answerId: w.w,
    again: ['Nghe lại nhé.', w.w],
    reveal: [w.w, cap(w.name)],
  };
}

function markQuestion(lvl: number, rng: Rng): ChooseQuestion {
  const w = oneOf(TONE_MARKED_WORDS, rng);
  const answer = tonedVowel(w.w);
  const marks = w.family.forms.map(tonedVowel).filter((v) => v !== '');
  const wrong = shuffle(marks.filter((v) => v !== answer), rng).slice(0, optionCount(lvl) - 1);
  const tone = TONE_NAME[w.tone];
  return {
    type: 'choose',
    topic: 'tones',
    concept: 'T:mark',
    say: [cap(w.name), 'Thiếu dấu gì nhỉ?'],
    bubble: 'Thiếu dấu gì nhỉ?',
    stimulus: { k: 'row', items: [emojiV(w.emoji), { k: 'text', v: blankTone(w.w) }] },
    options: shuffle(
      [answer, ...wrong].map((v): Option => ({ id: v, visual: { k: 'text', v }, name: TONE_NAME[toneOf(v)] })),
      rng,
    ),
    answerId: answer,
    again: ['Nghe lại nhé.', w.w],
    reveal: [w.w, tone],
  };
}

// ---- opposites ----

function oppositeQuestion(pairId: string, lvl: number, rng: Rng): ChooseQuestion {
  const pair = OPPOSITES.find((o) => o.id === pairId)!;
  const flip = rng() < 0.5;
  const x: Side = flip ? pair.b : pair.a;
  const y: Side = flip ? pair.a : pair.b;
  const n = optionCount(lvl);
  const base = { type: 'choose' as const, topic: 'opposites' as const, concept: `O:${pair.id}` };
  const opp = lvl >= 1 && rng() < 0.5;
  if (!opp) {
    const answer = oneOf(x.pics, rng);
    const wrong = shuffle(y.pics, rng).slice(0, Math.min(n - 1, y.pics.length));
    return {
      ...base,
      say: [`Cái nào ${x.word}?`],
      bubble: `Cái nào ${x.word}?`,
      options: shuffle([answer, ...wrong].map((p) => emojiOpt(p.emoji, p.name)), rng),
      answerId: answer.emoji,
      again: [`Mình tìm cái ${x.word} nhé.`],
      reveal: [cap(x.word), `Ngược lại là ${y.word}`],
    };
  }
  const shown = oneOf(x.pics, rng);
  const answer = oneOf(y.pics, rng);
  const strangers = OPPOSITES.filter((o: OppositePair) => o.id !== pair.id).map((o) => oneOf(rng() < 0.5 ? o.a.pics : o.b.pics, rng));
  const pool = unique(
    [...shuffle(x.pics.filter((p) => p.emoji !== shown.emoji), rng), ...shuffle(strangers, rng)]
      .filter((p) => p.emoji !== answer.emoji && p.emoji !== shown.emoji)
      .map((p) => emojiOpt(p.emoji, p.name)),
  ).slice(0, n - 1);
  return {
    ...base,
    say: [cap(x.word), 'Ngược lại là gì?'],
    bubble: `Ngược với "${x.word}" là gì?`,
    stimulus: emojiV(shown.emoji),
    options: shuffle([emojiOpt(answer.emoji, answer.name), ...pool], rng),
    answerId: answer.emoji,
    again: [`Ngược với ${x.word} nhé.`],
    reveal: [`${cap(x.word)}, ngược lại là ${y.word}`],
  };
}

// ---- time ----

function dayQuestion(lvl: number, rng: Rng): ChooseQuestion {
  const part = oneOf(DAY_PARTS, rng);
  const n = optionCount(lvl);
  const base = { type: 'choose' as const, topic: 'time' as const, concept: 'D:day' };
  if (rng() < 0.5) {
    const act = oneOf(part.acts, rng);
    const others = shuffle(DAY_PARTS.filter((p) => p.id !== part.id), rng).slice(0, n - 1);
    return {
      ...base,
      say: [cap(act.name), 'là buổi nào?'],
      bubble: 'Là buổi nào?',
      stimulus: emojiV(act.emoji),
      options: shuffle([part, ...others].map((p) => emojiOpt(p.sky, p.name)), rng),
      answerId: part.sky,
      again: ['Nhìn mặt trời trên trời nhé.'],
      reveal: [cap(act.name), `là ${part.name}`],
    };
  }
  const act = oneOf(part.acts, rng);
  const others = shuffle(
    DAY_PARTS.filter((p) => p.id !== part.id).map((p) => oneOf(p.acts, rng)),
    rng,
  ).slice(0, n - 1);
  return {
    ...base,
    say: [cap(part.name), 'bé làm gì?'],
    bubble: `${cap(part.name)} bé làm gì?`,
    stimulus: emojiV(part.sky),
    options: shuffle([act, ...others].map((a) => emojiOpt(a.emoji, a.name)), rng),
    answerId: act.emoji,
    again: [`Mình nghĩ về ${part.name} nhé.`],
    reveal: [`${cap(part.name)}`, `bé ${act.name}`],
  };
}

function orderQuestion(lvl: number, rng: Rng): ChooseQuestion {
  const i = Math.floor(rng() * DAY_PARTS.length);
  const after = lvl < 2 || rng() < 0.5;
  const part = DAY_PARTS[i]!;
  const target = DAY_PARTS[(i + (after ? 1 : DAY_PARTS.length - 1)) % DAY_PARTS.length]!;
  const others = shuffle(DAY_PARTS.filter((p) => p.id !== target.id && p.id !== part.id), rng).slice(0, optionCount(lvl) - 2);
  // The part shown in the bubble is a fair wrong answer too: "what comes after morning" is not morning.
  const opts = [target, part, ...others].slice(0, optionCount(lvl));
  const row: Visual[] = after ? [emojiV(part.sky), { k: 'chip', v: '❓' }] : [{ k: 'chip', v: '❓' }, emojiV(part.sky)];
  return {
    type: 'choose',
    topic: 'time',
    concept: 'D:order',
    say: [after ? `Sau ${part.name}` : `Trước ${part.name}`, 'là buổi nào?'],
    bubble: after ? `Sau ${part.name} là buổi nào?` : `Trước ${part.name} là buổi nào?`,
    stimulus: { k: 'row', items: row },
    options: shuffle(opts.map((p) => emojiOpt(p.sky, p.name)), rng),
    answerId: target.sky,
    again: ['Mặt trời đi từ sáng đến tối nhé.'],
    reveal: [after ? `Sau ${part.name} là ${target.name}` : `Trước ${part.name} là ${target.name}`],
  };
}

function seasonQuestion(lvl: number, rng: Rng): ChooseQuestion {
  const s = oneOf(SEASONS, rng);
  const clue = oneOf(s.clues, rng);
  const others = shuffle(SEASONS.filter((x) => x.id !== s.id), rng).slice(0, optionCount(lvl) - 1);
  return {
    type: 'choose',
    topic: 'time',
    concept: 'D:season',
    say: [cap(clue.name), 'là mùa nào?'],
    bubble: 'Là mùa nào?',
    stimulus: emojiV(clue.emoji),
    options: shuffle([s, ...others].map((x) => emojiOpt(x.sky, x.name)), rng),
    answerId: s.sky,
    again: ['Mình nghĩ về các mùa nhé.'],
    reveal: [cap(clue.name), `là ${s.name}`],
  };
}

// ---- left and right: always the child's own left and right, as the child sees the screen ----

function leftRightQuestion(key: string, lvl: number, rng: Rng): ChooseQuestion {
  const side = key === 'left' ? 'trái' : 'phải';
  const base = { type: 'choose' as const, topic: 'leftright' as const, concept: `R:${key}` };
  if (lvl >= 1 && rng() < 0.5) {
    const arrows = lvl >= 2 && rng() < 0.5;
    const L = arrows ? '⬅️' : '👈';
    const R = arrows ? '➡️' : '👉';
    return {
      ...base,
      say: [`Chỉ sang bên ${side}`, 'là cái nào?'],
      bubble: `Cái nào chỉ sang bên ${side}?`,
      options: shuffle(
        [
          { id: 'L', visual: emojiV(L), name: 'chỉ sang bên trái' },
          { id: 'R', visual: emojiV(R), name: 'chỉ sang bên phải' },
        ] as Option[],
        rng,
      ),
      answerId: key === 'left' ? 'L' : 'R',
      again: [`Mình tìm bên ${side} nhé.`],
      reveal: [`Đúng rồi! Bên ${side}`],
    };
  }
  const count = lvl >= 2 ? 3 : 2;
  const things = shuffle(LR_THINGS, rng).slice(0, count);
  const answer = key === 'left' ? things[0]! : things[count - 1]!;
  return {
    ...base,
    say: [`Bên tay ${side} của bé`, 'là cái nào?'],
    bubble: `Bên tay ${side} của bé là cái nào?`,
    stimulus: { k: 'row', items: things.map((t) => emojiV(t.emoji)) },
    options: shuffle(things.map((t) => emojiOpt(t.emoji, t.name)), rng),
    answerId: answer.emoji,
    again: [`Tay ${side} của bé nhé.`],
    reveal: [`${cap(answer.name)} ở bên tay ${side}`],
  };
}

// ---- safety and hygiene ----

function safetyQuestion(key: string, lvl: number, rng: Rng): ChooseQuestion {
  const n = optionCount(lvl);
  const base = { type: 'choose' as const, topic: 'safety' as const, concept: `S:${key}` };
  if (key === 'danger') {
    const safeAsk = lvl >= 2 && rng() < 0.4;
    const answer = oneOf(safeAsk ? HARMLESS : DANGEROUS, rng);
    const wrong = shuffle(safeAsk ? DANGEROUS : HARMLESS, rng).slice(0, n - 1);
    return {
      ...base,
      say: safeAsk ? ['Cái nào an toàn', 'bé chơi được?'] : ['Cái nào nguy hiểm?', 'Bé không được chạm'],
      bubble: safeAsk ? 'Cái nào an toàn để chơi?' : 'Cái nào nguy hiểm, bé không chạm vào?',
      options: shuffle([answer, ...wrong].map((p) => emojiOpt(p.emoji, p.name)), rng),
      answerId: answer.emoji,
      again: [safeAsk ? 'Mình tìm cái an toàn nhé.' : 'Mình tìm cái nguy hiểm nhé.'],
      reveal: safeAsk ? [`${cap(answer.name)} an toàn`] : [`${cap(answer.name)} nguy hiểm`, 'Bé không chạm vào nhé'],
    };
  }
  const scene = SAFETY_SCENES.find((s) => s.id === key)!;
  const wrong = shuffle(scene.wrong, rng).slice(0, n - 1);
  return {
    ...base,
    say: scene.say,
    bubble: scene.bubble,
    stimulus: emojiV(scene.stim),
    options: shuffle([scene.right, ...wrong].map((p) => emojiOpt(p.emoji, p.name)), rng),
    answerId: scene.right.emoji,
    again: ['Mình nghĩ lại nhé.', ...scene.say.slice(0, 1)],
    reveal: scene.reveal,
  };
}

/** One question of a "concept pack" station. */
export function packQuestion(topic: TopicId, key: string, lvl: number, rng: Rng): ChooseQuestion {
  switch (topic) {
    case 'tones':
      return key === 'start' ? soundQuestion(lvl, rng) : key === 'hear' ? hearQuestion(lvl, rng) : markQuestion(lvl, rng);
    case 'opposites':
      return oppositeQuestion(key, lvl, rng);
    case 'time':
      return key === 'day' ? dayQuestion(lvl, rng) : key === 'order' ? orderQuestion(lvl, rng) : seasonQuestion(lvl, rng);
    case 'leftright':
      return leftRightQuestion(key, lvl, rng);
    default:
      return safetyQuestion(key, lvl, rng);
  }
}
