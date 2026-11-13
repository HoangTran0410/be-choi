import { FRUITS } from '../../core/content';
import { shuffle } from '../../core/dom';
import { countAloud, numberWord } from './curriculum';
import { optionCount } from './picker';
import type { ChooseQuestion, Option, Visual } from './types';

type Rng = () => number;

/** The biggest number a question may use: within 5, then within 10, then within 20. */
export function mathMax(level: number): number {
  return level <= 0 ? 5 : level === 1 ? 10 : 20;
}

const oneOf = <T>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)]!;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const int = (lo: number, hi: number, rng: Rng): number => lo + Math.floor(rng() * (hi - lo + 1));

const numeral = (x: number): Option => ({ id: String(x), visual: { k: 'text', v: String(x) }, name: `số ${numberWord(x)}` });

/** The answer and `count - 1` other numbers, close to it first, all different, all in `lo … hi`. */
export function numberChoices(answer: number, lo: number, hi: number, count: number, rng: Rng): number[] {
  const all: number[] = [];
  for (let x = lo; x <= hi; x++) if (x !== answer) all.push(x);
  const near = shuffle(all.filter((x) => Math.abs(x - answer) <= 3), rng);
  const far = shuffle(all.filter((x) => Math.abs(x - answer) > 3), rng);
  return shuffle([answer, ...[...near, ...far].slice(0, count - 1)], rng);
}

function numberOptions(answer: number, lo: number, hi: number, lvl: number, rng: Rng): Option[] {
  return numberChoices(answer, lo, hi, optionCount(lvl), rng).map(numeral);
}

/** Things that fly or go away, for "how many are left?". */
const LEAVERS = [
  { emoji: '🐦', noun: 'con chim', verb: 'bay đi' },
  { emoji: '🦋', noun: 'con bướm', verb: 'bay đi' },
  { emoji: '🐝', noun: 'con ong', verb: 'bay đi' },
  { emoji: '🎈', noun: 'quả bóng bay', verb: 'bay mất' },
  { emoji: '🍪', noun: 'cái bánh', verb: 'được ăn mất' },
] as const;

const base = { type: 'choose' as const, topic: 'math' as const };

function addQuestion(lvl: number, rng: Rng): ChooseQuestion {
  const max = mathMax(lvl);
  const thing = oneOf(FRUITS.slice(0, 6), rng);
  const unit = thing.name; // "quả táo"
  let a: number;
  let b: number;
  if (max <= 10) {
    const sum = int(max <= 5 ? 3 : 5, max, rng);
    a = int(1, sum - 1, rng);
    b = sum - a;
  } else {
    a = int(3, 12, rng);
    b = int(3, Math.min(12, max - a), rng);
  }
  const sum = a + b;
  const [wa, wb, ws] = [numberWord(a), numberWord(b), numberWord(sum)];
  const opts = numberOptions(sum, Math.max(2, sum - 3), Math.min(max, sum + 3), lvl, rng);
  const objects = max <= 10;
  const stimulus: Visual = objects
    ? {
        k: 'row',
        items: [
          ...Array.from({ length: a }, (): Visual => ({ k: 'emoji', v: thing.emoji })),
          { k: 'chip', v: '➕' },
          ...Array.from({ length: b }, (): Visual => ({ k: 'emoji', v: thing.emoji })),
        ],
      }
    : { k: 'text', v: `${a} + ${b}` };
  return {
    ...base,
    concept: 'M:add',
    say: objects ? [`${cap(wa)} ${unit}`, `thêm ${wb} ${unit}`, 'Có tất cả mấy?'] : [`${cap(wa)} cộng ${wb}`, 'bằng mấy?'],
    bubble: objects ? 'Có tất cả mấy?' : `${a} cộng ${b} bằng mấy?`,
    stimulus,
    options: opts,
    answerId: String(sum),
    again: objects ? ['Mình cùng đếm nhé.', countAloud(sum)] : [`${cap(wa)} cộng ${wb} nhé.`, 'Mình đếm lên nhé.'],
    reveal: objects ? [countAloud(sum), `${cap(wa)} thêm ${wb} là ${ws}`] : [`${cap(wa)} cộng ${wb} bằng ${ws}`],
  };
}

function subQuestion(lvl: number, rng: Rng): ChooseQuestion {
  const max = mathMax(lvl);
  const leaver = oneOf(LEAVERS, rng);
  const total = int(max <= 5 ? 3 : max <= 10 ? 5 : 8, max, rng);
  const gone = int(1, total - 1, rng);
  const left = total - gone;
  const [wt, wg, wl] = [numberWord(total), numberWord(gone), numberWord(left)];
  return {
    ...base,
    concept: 'M:sub',
    say: [`Có ${wt} ${leaver.noun}`, `${cap(wg)} ${leaver.noun} ${leaver.verb}`, 'Còn lại mấy?'],
    bubble: 'Còn lại mấy?',
    stimulus: { k: 'group', v: leaver.emoji, n: total, gone },
    options: numberOptions(left, 1, Math.min(max, total), lvl, rng),
    answerId: String(left),
    again: ['Mình đếm những bạn còn lại nhé.', countAloud(left)],
    reveal: [countAloud(left), `${cap(wt)} bớt ${wg} còn ${wl}`],
  };
}

function compareQuestion(lvl: number, rng: Rng): ChooseQuestion {
  const max = Math.min(10, mathMax(lvl));
  const thing = oneOf(FRUITS.slice(0, 6), rng);
  const kind = oneOf(lvl === 0 ? ['more', 'fewer'] : ['more', 'fewer', 'equal'], rng);
  const group = (id: string, n: number, emoji = thing.emoji): Option => ({
    id,
    visual: { k: 'group', v: emoji, n },
    name: `${numberWord(n)} ${thing.name}`,
  });
  if (kind === 'equal') {
    // Find the group with as many as this one, drawn with a different fruit.
    const n = int(2, max, rng);
    const other = oneOf(FRUITS.slice(0, 6).filter((f) => f.emoji !== thing.emoji), rng);
    const wrong = numberChoices(n, 1, max, optionCount(lvl), rng).filter((x) => x !== n);
    const opts = shuffle([group('eq', n, other.emoji), ...wrong.map((x) => group(`n${x}`, x, other.emoji))], rng);
    return {
      ...base,
      concept: 'M:cmp',
      say: ['Bên nào nhiều', 'bằng thế này?'],
      bubble: 'Bên nào nhiều bằng thế này?',
      stimulus: { k: 'group', v: thing.emoji, n },
      options: opts,
      answerId: 'eq',
      again: ['Mình đếm từng bên nhé.'],
      reveal: [`Đều có ${numberWord(n)}`, 'Bằng nhau'],
    };
  }
  const big = int(2, max, rng);
  const small = int(1, big - 1, rng);
  const more = kind === 'more';
  const opts = shuffle([group('big', big), group('small', small)], rng);
  const [wb, ws] = [numberWord(big), numberWord(small)];
  return {
    ...base,
    concept: 'M:cmp',
    say: [more ? 'Bên nào nhiều hơn?' : 'Bên nào ít hơn?'],
    bubble: more ? 'Bên nào nhiều hơn?' : 'Bên nào ít hơn?',
    options: opts,
    answerId: more ? 'big' : 'small',
    again: ['Mình đếm từng bên nhé.'],
    reveal: more ? [`${cap(wb)} nhiều hơn ${ws}`] : [`${cap(ws)} ít hơn ${wb}`],
  };
}

function nextQuestion(lvl: number, rng: Rng): ChooseQuestion {
  const max = mathMax(lvl);
  const after = rng() < 0.5;
  const n = after ? int(1, max - 1, rng) : int(2, max, rng);
  const answer = after ? n + 1 : n - 1;
  const [wn, wa] = [numberWord(n), numberWord(answer)];
  const row: Visual[] = after
    ? [{ k: 'text', v: String(n) }, { k: 'chip', v: '❓' }]
    : [{ k: 'chip', v: '❓' }, { k: 'text', v: String(n) }];
  return {
    ...base,
    concept: 'M:next',
    say: [after ? `Sau số ${wn}` : `Trước số ${wn}`, 'là số mấy?'],
    bubble: after ? `Sau số ${n} là số mấy?` : `Trước số ${n} là số mấy?`,
    stimulus: { k: 'row', items: row },
    options: numberOptions(answer, 1, max, lvl, rng),
    answerId: String(answer),
    again: ['Mình đếm nhé.', countAloud(Math.max(n, answer))],
    reveal: [after ? `Sau số ${wn} là số ${wa}` : `Trước số ${wn} là số ${wa}`],
  };
}

function gapQuestion(lvl: number, rng: Rng): ChooseQuestion {
  const max = mathMax(lvl);
  const start = int(1, max - 4, rng);
  const hole = int(lvl === 0 ? 1 : 0, 4, rng);
  const nums = Array.from({ length: 5 }, (_, i) => start + i);
  const answer = nums[hole]!;
  const items: Visual[] = nums.map((x, i): Visual => (i === hole ? { k: 'chip', v: '❓' } : { k: 'text', v: String(x) }));
  return {
    ...base,
    concept: 'M:gap',
    say: ['Số nào còn thiếu?'],
    bubble: 'Số nào còn thiếu?',
    stimulus: { k: 'row', items },
    options: numberOptions(answer, Math.max(1, start), Math.min(max, start + 4), lvl, rng),
    answerId: String(answer),
    again: ['Mình đếm từ đầu nhé.', nums.map(numberWord).join(', ')],
    reveal: [nums.map(numberWord).join(', '), `Số ${numberWord(answer)} đây rồi`],
  };
}

/** One maths question for a concept ('add', 'sub', 'cmp', 'next', 'gap') at a level. */
export function mathQuestion(key: string, lvl: number, rng: Rng): ChooseQuestion {
  switch (key) {
    case 'add':
      return addQuestion(lvl, rng);
    case 'sub':
      return subQuestion(lvl, rng);
    case 'cmp':
      return compareQuestion(lvl, rng);
    case 'next':
      return nextQuestion(lvl, rng);
    default:
      return gapQuestion(lvl, rng);
  }
}
