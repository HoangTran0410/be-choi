import type { FxKind } from '../../core/audio';
import { ANIMALS, COLORS, VOICED_ANIMALS, voiceOf, type Item } from '../../core/content';
import { pick, shuffle } from '../../core/dom';
import { LETTERS } from '../letters/logic';
import { SHAPES } from '../shapes/logic';
import { SETS, expand, itemsFor, visibleLength, type PatternType } from '../pattern/logic';
import {
  ANIMAL_LOOKALIKES,
  COLOR_NEIGHBOURS,
  COUNT_THINGS,
  LETTER_LOOKALIKES,
  LETTER_WORDS,
  ONOMATOPOEIA,
  QUESTIONS_PER_STATION,
  SHAPE_LOOKALIKES,
  SIZE_ITEMS,
  SORT_KINDS,
  animalByEmoji,
  conceptsOf,
  countAloud,
  glyphOf,
  keyOf,
  numberWord,
  shapeById,
  topicOf,
} from './curriculum';
import { optionCount, pickConcepts, statOf, type Mastery } from './picker';
import type { ChooseQuestion, DragQuestion, Env, Option, Question, Slot, SlotKind, TopicId, Visual } from './types';

type Rng = () => number;

export function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function oneOf<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/**
 * `n` wrong ids to stand beside `answer`. With `near`, ids from the same "looks alike"
 * group come first, so a steady child has to look closely.
 */
export function distractors(
  pool: readonly string[],
  answer: string,
  n: number,
  rng: Rng,
  near = false,
  groups: readonly (readonly string[])[] = [],
): string[] {
  const others = pool.filter((x) => x !== answer);
  const close = near
    ? shuffle(
        [...new Set(groups.filter((g) => g.includes(answer)).flat())].filter((x) => x !== answer && others.includes(x)),
        rng,
      ).slice(0, n)
    : [];
  const rest = shuffle(
    others.filter((x) => !close.includes(x)),
    rng,
  ).slice(0, Math.max(0, n - close.length));
  return [...close, ...rest];
}

function opts(ids: readonly string[], make: (id: string) => Option, rng: Rng): Option[] {
  return shuffle(ids.map(make), rng);
}

// ---- letters ----

function letterQuestion(key: string, lvl: number, rng: Rng): ChooseQuestion {
  const g = glyphOf(key);
  const words = LETTER_WORDS[key]!;
  const kinds = lvl === 0 ? ['find'] : lvl === 1 ? ['find', 'word'] : ['find', 'word', 'pic'];
  const kind = oneOf(kinds, rng);
  const labels = LETTERS.map((l) => l.label);
  const n = optionCount(lvl) - 1;
  const letterOpt = (l: string): Option => ({
    id: l,
    visual: { k: 'text', v: `${l}${l.toLowerCase()}` },
    name: `chữ ${glyphOf(l).name}`,
  });
  const base = { type: 'choose' as const, topic: 'letters' as const, concept: `L:${key}` };
  if (kind === 'pic') {
    const answer = oneOf(words, rng);
    const others = LETTERS.filter((l) => l.label !== key).map((l) => oneOf(LETTER_WORDS[l.label]!, rng));
    const wrong = shuffle(
      others.filter((w) => w.emoji !== answer.emoji && !words.some((x) => x.emoji === w.emoji)),
      rng,
    ).slice(0, n);
    const all = [answer, ...wrong];
    return {
      ...base,
      say: [`Chữ ${g.name}`, 'Cái nào bắt đầu bằng chữ này?'],
      bubble: `Cái nào bắt đầu bằng chữ ${key}?`,
      stimulus: { k: 'text', v: `${key}${key.toLowerCase()}` },
      options: shuffle(
        all.map((w): Option => ({ id: w.emoji, visual: { k: 'emoji', v: w.emoji }, name: w.name })),
        rng,
      ),
      answerId: answer.emoji,
      again: [`Mình tìm cái bắt đầu bằng chữ ${g.name} nhé.`],
      reveal: [`${capFirst(answer.name)} bắt đầu bằng chữ ${g.name}`],
    };
  }
  const ids = [key, ...distractors(labels, key, n, rng, lvl >= 2, LETTER_LOOKALIKES)];
  if (kind === 'word') {
    const w = oneOf(words, rng);
    return {
      ...base,
      say: [capFirst(w.name), 'bắt đầu bằng chữ nào?'],
      bubble: `${capFirst(w.name)} bắt đầu bằng chữ nào?`,
      stimulus: { k: 'emoji', v: w.emoji },
      options: opts(ids, letterOpt, rng),
      answerId: key,
      again: [`Mình tìm chữ ${g.name} nhé.`],
      reveal: [`${capFirst(w.name)} bắt đầu bằng chữ ${g.name}`],
    };
  }
  return {
    ...base,
    say: [`Chữ ${g.name}`, 'đâu nào?'],
    bubble: `Chữ ${key} đâu nào?`,
    // The first time, the letter is shown so the child can match it by shape while hearing its name.
    stimulus: lvl === 0 ? { k: 'text', v: `${key}${key.toLowerCase()}` } : undefined,
    options: opts(ids, letterOpt, rng),
    answerId: key,
    again: [`Mình tìm chữ ${g.name} nhé.`],
    reveal: [`Đúng rồi! Chữ ${g.name}`, capFirst(words[0].name)],
  };
}

// ---- numbers ----

function numberQuestion(key: string, lvl: number, rng: Rng): ChooseQuestion {
  const n = Number(key);
  const word = numberWord(n);
  const kinds = lvl === 0 ? ['count'] : lvl === 1 ? ['count', 'numeral'] : ['count', 'numeral', 'group'];
  const kind = oneOf(kinds, rng);
  const thing = oneOf(COUNT_THINGS, rng);
  const nums = Array.from({ length: 10 }, (_, i) => String(i + 1));
  const near = lvl >= 2;
  const wrongNums = near
    ? shuffle(
        nums.filter((x) => x !== key && Math.abs(Number(x) - n) <= 2),
        rng,
      ).slice(0, optionCount(lvl) - 1)
    : distractors(nums, key, optionCount(lvl) - 1, rng);
  const ids = [key, ...wrongNums];
  while (ids.length < optionCount(lvl)) {
    const extra = oneOf(nums.filter((x) => !ids.includes(x)), rng);
    ids.push(extra);
  }
  const numeral = (x: string): Option => ({ id: x, visual: { k: 'text', v: x }, name: `số ${numberWord(Number(x))}` });
  const base = { type: 'choose' as const, topic: 'numbers' as const, concept: `N:${key}` };
  if (kind === 'group') {
    return {
      ...base,
      say: [`Cái nào có ${word} ${thing.name}?`],
      bubble: `Cái nào có ${word} ${thing.name}?`,
      options: opts(
        ids,
        (x) => ({ id: x, visual: { k: 'group', v: thing.emoji, n: Number(x) }, name: `${numberWord(Number(x))} ${thing.name}` }),
        rng,
      ),
      answerId: key,
      again: [`Mình tìm ${word} ${thing.name} nhé.`],
      reveal: [countAloud(n), `Có ${word} ${thing.name}`],
    };
  }
  if (kind === 'numeral') {
    return {
      ...base,
      say: [`Số ${word}`, 'đâu nào?'],
      bubble: `Số ${n} đâu nào?`,
      options: opts(ids, numeral, rng),
      answerId: key,
      again: [`Mình tìm số ${word} nhé.`],
      reveal: [`Đúng rồi! Số ${word}`],
    };
  }
  return {
    ...base,
    say: [`Có mấy ${thing.name}?`],
    bubble: `Có mấy ${thing.name}?`,
    stimulus: { k: 'group', v: thing.emoji, n },
    options: opts(ids, numeral, rng),
    answerId: key,
    again: ['Mình cùng đếm nhé.', countAloud(n)],
    reveal: [countAloud(n), `Có ${word} ${thing.name}`],
  };
}

// ---- colours ----

function ballOption(colorId: string): Option {
  const c = COLORS.find((x) => x.id === colorId)!;
  return { id: c.id, visual: { k: 'ball', hex: c.hex }, name: `quả bóng ${c.name}` };
}

function colorQuestion(key: string, lvl: number, rng: Rng): ChooseQuestion {
  const c = COLORS.find((x) => x.id === key)!;
  const ids = COLORS.map((x) => x.id);
  const n = optionCount(lvl) - 1;
  const near = lvl >= 2;
  const neighbours = near ? (COLOR_NEIGHBOURS[key] ?? []).slice(0, n) : [];
  const rest = shuffle(
    ids.filter((x) => x !== key && !neighbours.includes(x)),
    rng,
  ).slice(0, n - neighbours.length);
  const all = [key, ...neighbours, ...rest];
  const base = { type: 'choose' as const, topic: 'colors' as const, concept: `C:${key}` };
  const match = lvl >= 1 && rng() < 0.5;
  if (match) {
    return {
      ...base,
      say: ['Quả bóng nào giống quả này?'],
      bubble: 'Quả bóng nào giống quả này?',
      stimulus: { k: 'ball', hex: c.hex },
      options: opts(all, ballOption, rng),
      answerId: key,
      again: ['Mình tìm quả bóng giống nhau nhé.'],
      reveal: [`Đều là ${c.name}`],
    };
  }
  return {
    ...base,
    say: [`Quả bóng ${c.name}`, 'đâu nào?'],
    bubble: `Quả bóng ${c.name} đâu nào?`,
    options: opts(all, ballOption, rng),
    answerId: key,
    again: [`Mình tìm quả bóng ${c.name} nhé.`],
    reveal: [`Đúng rồi! Đây là ${c.name}`],
  };
}

// ---- shapes ----

function shapeQuestion(key: string, lvl: number, rng: Rng): ChooseQuestion {
  const shape = shapeById(key);
  const ids = SHAPES.map((s) => s.id as string);
  const n = optionCount(lvl) - 1;
  const all = [key, ...distractors(ids, key, n, rng, lvl >= 2, SHAPE_LOOKALIKES)];
  const hexes = shuffle(
    COLORS.map((c) => c.hex),
    rng,
  );
  const colorOf = new Map(all.map((id, i) => [id, hexes[i % hexes.length]!]));
  const option = (id: string): Option => {
    const s = shapeById(id);
    return { id, visual: { k: 'shape', path: s.path, hex: colorOf.get(id)! }, name: s.name };
  };
  const base = { type: 'choose' as const, topic: 'shapes' as const, concept: `S:${key}` };
  if (lvl >= 1 && rng() < 0.5) {
    // Same shape, different colour from the one in the bubble: look at the outline, not the colour.
    const stimHex = hexes[all.length % hexes.length]!;
    return {
      ...base,
      say: ['Hình nào giống hình này?'],
      bubble: 'Hình nào giống hình này?',
      stimulus: { k: 'shape', path: shape.path, hex: stimHex },
      options: opts(all, option, rng),
      answerId: key,
      again: ['Mình tìm hình giống nhau nhé.'],
      reveal: [`Đều là ${shape.name}`],
    };
  }
  return {
    ...base,
    say: [capFirst(shape.name), 'đâu nào?'],
    bubble: `${capFirst(shape.name)} đâu nào?`,
    stimulus: lvl === 0 ? { k: 'shape', path: shape.path, hex: '#94a3b8' } : undefined,
    options: opts(all, option, rng),
    answerId: key,
    again: [`Mình tìm ${shape.name} nhé.`],
    reveal: [`Đúng rồi! Đây là ${shape.name}`],
  };
}

// ---- sizes ----

const SCALES = [0.42, 0.62, 0.85, 1.06, 1.28];

/** `n` different glyph sizes. Level 0 keeps them far apart; level 3 packs them close. */
export function pickScales(n: number, lvl: number, rng: Rng): number[] {
  if (n <= 2 && lvl === 0) return shuffle([oneOf(SCALES.slice(0, 2), rng), oneOf(SCALES.slice(3), rng)], rng);
  if (lvl >= 3 && n >= 4) {
    const from = rng() < 0.5 ? 0 : 1;
    return shuffle(SCALES.slice(from, from + n), rng);
  }
  return pick(SCALES, Math.min(n, SCALES.length), rng);
}

function sizeQuestion(key: string, lvl: number, rng: Rng): ChooseQuestion {
  const big = key === 'big';
  const n = optionCount(lvl);
  const item = oneOf(SIZE_ITEMS, rng);
  const scales = pickScales(n, lvl, rng);
  const want = big ? Math.max(...scales) : Math.min(...scales);
  const degree = n === 2 ? 'hơn' : 'nhất';
  const word = big ? 'to' : 'nhỏ';
  const options = scales.map(
    (s, i): Option => ({
      id: `s${i}`,
      visual: { k: 'emoji', v: item.emoji, scale: s },
      name: big ? 'cái nhỏ hơn' : 'cái to hơn',
    }),
  );
  return {
    type: 'choose',
    topic: 'sizes',
    concept: `Z:${key}`,
    say: [`Cái nào ${word} ${degree}?`],
    bubble: `Cái nào ${word} ${degree}?`,
    options,
    answerId: `s${scales.indexOf(want)}`,
    again: [`Mình tìm cái ${word} ${degree} nhé.`],
    reveal: [`Đúng rồi! Cái này ${word} ${degree}`],
  };
}

// ---- animals and their voices ----

function animalQuestion(key: string, lvl: number, rng: Rng): ChooseQuestion {
  const a = animalByEmoji(key);
  const voice: FxKind = voiceOf(a);
  const ono = ONOMATOPOEIA[key] ?? '';
  const n = optionCount(lvl) - 1;
  const animalOpt = (it: Item): Option => ({ id: it.emoji, visual: { k: 'emoji', v: it.emoji }, name: it.name });
  const base = { type: 'choose' as const, topic: 'animals' as const, concept: `A:${key}` };
  const kind = lvl === 0 ? oneOf(['name', 'sound'], rng) : oneOf(['sound', 'hear'], rng);
  if (kind === 'name') {
    const ids = [key, ...distractors(ANIMALS.map((x) => x.emoji), key, n, rng, false, ANIMAL_LOOKALIKES)];
    return {
      ...base,
      say: [`${capFirst(a.name)}`, 'đâu nào?'],
      bubble: `${capFirst(a.name)} đâu nào?`,
      options: opts(ids, (id) => animalOpt(animalByEmoji(id)), rng),
      answerId: key,
      again: [`Mình tìm ${a.name} nhé.`],
      reveal: [`Đúng rồi! ${capFirst(a.name)}`, ono],
    };
  }
  // By ear, every animal on screen sounds different: the lion and the tiger never share a question.
  const heard = new Set<FxKind>([voice]);
  const rivals: Item[] = [];
  for (const it of shuffle(VOICED_ANIMALS, rng)) {
    if (rivals.length >= n) break;
    if (it.emoji === key || heard.has(voiceOf(it))) continue;
    heard.add(voiceOf(it));
    rivals.push(it);
  }
  const question = kind === 'sound' ? `Con gì kêu ${ono}?` : 'Con gì kêu thế nhỉ?';
  return {
    ...base,
    say: kind === 'sound' ? [question] : ['Nghe nào!', 'Con gì kêu thế nhỉ?'],
    bubble: question,
    stimulus: { k: 'emoji', v: '🔊' },
    sound: voice,
    options: opts([key, ...rivals.map((r) => r.emoji)], (id) => animalOpt(animalByEmoji(id)), rng),
    answerId: key,
    again: ['Nghe lại nhé.'],
    reveal: [`${capFirst(a.name)} kêu ${ono}`],
  };
}

// ---- shadows ----

function shadowQuestion(key: string, lvl: number, rng: Rng): ChooseQuestion {
  const a = animalByEmoji(key);
  const n = optionCount(lvl) - 1;
  const ids = [key, ...distractors(ANIMALS.map((x) => x.emoji), key, n, rng, lvl >= 2, ANIMAL_LOOKALIKES)];
  return {
    type: 'choose',
    topic: 'shadows',
    concept: `H:${key}`,
    say: ['Bóng của ai đây?'],
    bubble: 'Bóng của ai đây?',
    stimulus: { k: 'emoji', v: key, silhouette: true },
    options: opts(ids, (id) => ({ id, visual: { k: 'emoji', v: id }, name: animalByEmoji(id).name }), rng),
    answerId: key,
    again: ['Nhìn kỹ cái bóng nhé.'],
    reveal: [`Đúng rồi! Là ${a.name}`],
  };
}

// ---- patterns ----

function patternQuestion(key: string, lvl: number, rng: Rng): ChooseQuestion {
  const type = key as PatternType;
  const set = oneOf(SETS, rng);
  const items = pick(set, itemsFor(type), rng);
  const len = visibleLength(type);
  const full = expand(type, items, len + 1);
  const answer = full[len]!;
  const decoys = pick(
    set.filter((i) => i.emoji !== answer.emoji),
    optionCount(lvl) - 1,
    rng,
  );
  const row: Visual[] = [...full.slice(0, len).map((i): Visual => ({ k: 'emoji', v: i.emoji })), { k: 'chip', v: '❓' }];
  return {
    type: 'choose',
    topic: 'pattern',
    concept: `P:${key}`,
    say: ['Tiếp theo là gì?'],
    bubble: 'Tiếp theo là gì?',
    stimulus: { k: 'row', items: row },
    options: shuffle(
      [answer, ...decoys].map((i): Option => ({ id: i.emoji, visual: { k: 'emoji', v: i.emoji }, name: i.name })),
      rng,
    ),
    answerId: answer.emoji,
    again: ['Mình nhìn lại từ đầu nhé.'],
    reveal: [`Đúng rồi! Tiếp theo là ${answer.name}`],
  };
}

// ---- sorting by kind ----

function sortChoose(key: string, lvl: number, rng: Rng): ChooseQuestion {
  const kind = SORT_KINDS.find((k) => k.id === key)!;
  const answer = oneOf(kind.things, rng);
  const others = pick(
    SORT_KINDS.filter((k) => k.id !== key),
    Math.min(optionCount(lvl) - 1, SORT_KINDS.length - 1),
    rng,
  ).map((k) => oneOf(k.things, rng));
  const unique = [answer, ...others.filter((t) => t.emoji !== answer.emoji)];
  return {
    type: 'choose',
    topic: 'sorting',
    concept: `K:${key}`,
    say: [`Cái nào là ${kind.kind}?`],
    bubble: `Cái nào là ${kind.kind}?`,
    options: shuffle(
      unique.map((t): Option => ({ id: t.emoji, visual: { k: 'emoji', v: t.emoji }, name: t.name })),
      rng,
    ),
    answerId: answer.emoji,
    again: [`Mình tìm ${kind.kind} nhé.`],
    reveal: [`${capFirst(answer.name)} là ${kind.kind}`],
  };
}

// ---- family photos ----

function familyQuestion(key: string, lvl: number, rng: Rng, env: Env): ChooseQuestion {
  const person = env.people.find((q) => q.key === key) ?? env.people[0];
  if (!person) throw new Error('learn: no family photos');
  const others = shuffle(
    env.people.filter((q) => q.key !== person.key),
    rng,
  ).slice(0, optionCount(lvl) - 1);
  const group = shuffle([person, ...others], rng);
  const photoOf = (q: (typeof env.people)[number]) => ({ k: 'photo', url: oneOf(q.urls, rng) }) as Visual;
  const base = { type: 'choose' as const, topic: 'family' as const, concept: `F:${person.key}` };
  const named = env.people.filter((q) => q.name);
  const kinds: string[] = [];
  if (person.name) kinds.push('find');
  if (person.name && lvl >= 1 && named.length >= 2) kinds.push('who');
  if (!kinds.length) kinds.push('same');
  const kind = oneOf(kinds, rng);
  if (kind === 'who') {
    const chipPeople = shuffle(
      [person, ...shuffle(named.filter((q) => q.key !== person.key), rng).slice(0, optionCount(lvl) - 1)],
      rng,
    );
    return {
      ...base,
      say: ['Ai đây nhỉ?'],
      bubble: 'Ai đây nhỉ?',
      stimulus: photoOf(person),
      options: chipPeople.map((q): Option => ({ id: q.key, visual: { k: 'chip', v: q.name! }, name: q.name! })),
      answerId: person.key,
      again: ['Nhìn kỹ bức ảnh nhé.'],
      reveal: [`Đây là ${person.name}`],
    };
  }
  const options = group.map((q): Option => ({ id: q.key, visual: photoOf(q), name: q.name ?? '' }));
  if (kind === 'find') {
    return {
      ...base,
      say: [`${person.name} đâu nào?`],
      bubble: `${person.name} đâu nào?`,
      options,
      answerId: person.key,
      again: [`Mình tìm ${person.name} nhé.`],
      reveal: [`Đúng rồi! Đây là ${person.name}`],
    };
  }
  // Unnamed photos: find the one that is the same as the picture in the bubble.
  const first = oneOf(person.urls, rng);
  const second = person.urls.find((u) => u !== first) ?? first;
  return {
    ...base,
    say: ['Tìm ảnh giống thế này nhé'],
    bubble: 'Tìm ảnh giống thế này nhé',
    stimulus: { k: 'photo', url: first },
    options: group.map((q): Option => ({ id: q.key, visual: q.key === person.key ? { k: 'photo', url: second } : photoOf(q), name: q.name ?? '' })),
    answerId: person.key,
    again: ['Mình tìm ảnh giống nhau nhé.'],
    reveal: ['Đúng rồi! Hai ảnh giống nhau'],
  };
}

// ---- drag-and-drop ----

function colorDrag(ids: readonly string[], rng: Rng): DragQuestion {
  const cols = ids.map((id) => COLORS.find((c) => c.id === keyOf(id))!);
  const per = cols.length >= 3 ? [2, 2, 1] : [2, 2];
  const items = shuffle(
    cols.flatMap((c, ci) =>
      Array.from({ length: per[ci] ?? 1 }, (_, i) => ({
        id: `${c.id}${i}`,
        visual: { k: 'ball', hex: c.hex } as Visual,
        binId: c.id,
        concept: `C:${c.id}`,
        name: `quả bóng ${c.name}`,
      })),
    ),
    rng,
  );
  return {
    type: 'drag',
    topic: 'colors',
    concepts: [...ids],
    say: ['Bỏ bóng vào rổ', 'cùng màu nhé'],
    bubble: 'Bỏ bóng vào rổ cùng màu nhé',
    bins: cols.map((c) => ({ id: c.id, visual: { k: 'basket', hex: c.hex }, name: `rổ ${c.name}` })),
    items,
  };
}

function sizeDrag(lvl: number, rng: Rng): DragQuestion {
  const item = oneOf(SIZE_ITEMS, rng);
  const total = lvl >= 2 ? 5 : 4;
  const bigCount = Math.floor(total / 2) + (rng() < 0.5 ? 0 : total % 2);
  const flags = shuffle(Array.from({ length: total }, (_, i) => i < bigCount), rng);
  return {
    type: 'drag',
    topic: 'sizes',
    concepts: ['Z:big', 'Z:small'],
    say: ['Con to bỏ vào hộp to', 'con nhỏ bỏ vào hộp nhỏ'],
    bubble: 'Con to vào hộp to, con nhỏ vào hộp nhỏ',
    bins: [
      { id: 'big', visual: { k: 'emoji', v: '📦', scale: 1.25 }, name: 'hộp to' },
      { id: 'small', visual: { k: 'emoji', v: '📦', scale: 0.55 }, name: 'hộp nhỏ' },
    ],
    items: flags.map((isBig, i) => ({
      id: `z${i}`,
      visual: { k: 'emoji', v: item.emoji, scale: isBig ? 1.15 : 0.55 } as Visual,
      binId: isBig ? 'big' : 'small',
      concept: isBig ? 'Z:big' : 'Z:small',
      name: `${item.name} ${isBig ? 'to' : 'nhỏ'}`,
    })),
  };
}

function sortDrag(ids: readonly string[], rng: Rng): DragQuestion {
  const kinds = ids.map((id) => SORT_KINDS.find((k) => k.id === keyOf(id))!);
  const per = kinds.length >= 3 ? [2, 1, 2] : [2, 2];
  const items = shuffle(
    kinds.flatMap((k, ki) =>
      pick(k.things, per[ki] ?? 1, rng).map((t) => ({
        id: `${k.id}-${t.emoji}`,
        visual: { k: 'emoji', v: t.emoji } as Visual,
        binId: k.id,
        concept: `K:${k.id}`,
        name: t.name,
      })),
    ),
    rng,
  );
  return {
    type: 'drag',
    topic: 'sorting',
    concepts: [...ids],
    say: ['Bỏ đồ vào', 'đúng chỗ nhé'],
    bubble: 'Bỏ đồ vào đúng chỗ nhé',
    bins: kinds.map((k) => ({ id: k.id, visual: { k: 'emoji', v: k.bin }, name: k.binName })),
    items,
  };
}

// ---- putting it together ----

/** Build the question for one slot. `m` supplies each concept's current level. */
export function buildQuestion(topic: TopicId, slot: Slot, m: Mastery, env: Env, rng: Rng): Question {
  const levels = slot.concepts.map((c) => statOf(m, c).l);
  if (slot.kind === 'drag') {
    const lvl = Math.min(...levels);
    if (topic === 'colors') return colorDrag(slot.concepts, rng);
    if (topic === 'sizes') return sizeDrag(lvl, rng);
    return sortDrag(slot.concepts, rng);
  }
  const concept = slot.concepts[0]!;
  const key = keyOf(concept);
  const lvl = statOf(m, concept).l;
  switch (topic) {
    case 'letters':
      return letterQuestion(key, lvl, rng);
    case 'numbers':
      return numberQuestion(key, lvl, rng);
    case 'colors':
      return colorQuestion(key, lvl, rng);
    case 'shapes':
      return shapeQuestion(key, lvl, rng);
    case 'sizes':
      return sizeQuestion(key, lvl, rng);
    case 'animals':
      return animalQuestion(key, lvl, rng);
    case 'shadows':
      return shadowQuestion(key, lvl, rng);
    case 'pattern':
      return patternQuestion(key, lvl, rng);
    case 'sorting':
      return sortChoose(key, lvl, rng);
    case 'family':
      return familyQuestion(key, lvl, rng, env);
  }
}

/** The shape of one station: five slots, with drag-and-drop mixed in for topics that have it. */
export function slotKinds(topic: TopicId): SlotKind[] {
  const drag = topicOf(topic).drag;
  const kinds: SlotKind[] = ['choose', 'choose', drag ? 'drag' : 'choose', 'choose', drag ? 'drag' : 'choose'];
  return kinds.slice(0, QUESTIONS_PER_STATION);
}

/** Which concepts each of the station's five questions is about. Pure given (mastery, turn, rng). */
export function planStation(topic: TopicId, m: Mastery, turn: number, env: Env, rng: Rng): Slot[] {
  const order = conceptsOf(topic, env);
  const used: string[] = [];
  return slotKinds(topic).map((kind, i): Slot => {
    let concepts: string[];
    if (kind === 'drag' && topic === 'sizes') {
      concepts = [...order];
    } else if (kind === 'drag') {
      const met = order.filter((id) => statOf(m, id).a > 0);
      const steady = met.length >= 3 && met.every((id) => statOf(m, id).l >= 1);
      concepts = pickConcepts(order, m, Math.min(steady ? 3 : 2, order.length), turn + i, rng, used);
    } else {
      concepts = pickConcepts(order, m, 1, turn + i, rng, used);
    }
    used.push(...concepts);
    return { kind, concepts };
  });
}
