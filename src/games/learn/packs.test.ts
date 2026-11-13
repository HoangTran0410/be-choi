import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { BIG_NUMBER_IDS, NUMBER_IDS, NUMBER_WORDS, TOPICS, conceptsOf, countAloud, numberWord, visibleTopics } from './curriculum';
import { mathMax, mathQuestion, numberChoices } from './mathq';
import { packQuestion, startsWithSound } from './packq';
import {
  DAY_PARTS,
  LR_THINGS,
  OPPOSITES,
  SAFETY_SCENES,
  SEASONS,
  SOUND_LETTERS,
  TONE_FAMILIES,
  TONE_NAME,
  TONE_WORDS,
  blankTone,
  stripTone,
  toneOf,
  tonedVowel,
} from './packs';
import { optionCount, recordAnswer, statOf, type Mastery } from './picker';
import { planStation } from './questions';
import type { ChooseQuestion, TopicId, Visual } from './types';

const ENV = { people: [] };

function check(q: ChooseQuestion, lvl: number): void {
  const ids = q.options.map((o) => o.id);
  expect(new Set(ids).size, `${q.bubble}: duplicate options ${ids}`).toBe(ids.length);
  expect(ids.filter((i) => i === q.answerId).length).toBe(1);
  expect(q.options.length).toBeGreaterThanOrEqual(2);
  expect(q.options.length).toBeLessThanOrEqual(optionCount(lvl));
  for (const o of q.options) expect(o.name.length).toBeGreaterThan(0);
  expect(q.say.every((s) => s.trim().length > 0)).toBe(true);
  expect(q.reveal.length).toBeGreaterThan(0);
}

function loop(fn: (lvl: number, rng: () => number, seed: number) => void, seeds = 60): void {
  for (let lvl = 0; lvl <= 3; lvl++) for (let seed = 1; seed <= seeds; seed++) fn(lvl, mulberry32(seed * 31 + lvl), seed);
}

const textOf = (v: Visual | undefined): string => (v && v.k === 'text' ? v.v : '');
const groupN = (v: Visual): number => (v.k === 'group' ? v.n : -1);

describe('number words up to twenty', () => {
  it('says the teens and twenty the way a Vietnamese child hears them', () => {
    expect(numberWord(10)).toBe('mười');
    expect(numberWord(11)).toBe('mười một');
    expect(numberWord(14)).toBe('mười bốn');
    expect(numberWord(15)).toBe('mười lăm');
    expect(numberWord(16)).toBe('mười sáu');
    expect(numberWord(19)).toBe('mười chín');
    expect(numberWord(20)).toBe('hai mươi');
    expect(NUMBER_WORDS.length).toBe(21);
    expect(new Set(NUMBER_WORDS).size).toBe(21);
    expect(NUMBER_WORDS.some((w) => w.includes('mười năm'))).toBe(false);
    expect(countAloud(12)).toBe('một, hai, ba, bốn, năm, sáu, bảy, tám, chín, mười, mười một, mười hai');
  });

  it('keeps 11 to 20 out of the station until 1 to 10 are steady', () => {
    expect(conceptsOf('numbers', ENV)).toEqual([...NUMBER_IDS, ...BIG_NUMBER_IDS]);
    const fresh = planStation('numbers', {}, 0, ENV, mulberry32(1)).flatMap((s) => s.concepts);
    expect(fresh.some((id) => BIG_NUMBER_IDS.includes(id))).toBe(false);
    // Met all ten but still shaky (level 1): still no teens.
    let shaky: Mastery = {};
    for (const id of NUMBER_IDS) shaky = recordAnswer(recordAnswer(shaky, id, true, 1), id, true, 2);
    expect(NUMBER_IDS.every((id) => statOf(shaky, id).l === 1)).toBe(true);
    for (let seed = 0; seed < 20; seed++) {
      const ids = planStation('numbers', shaky, 10, ENV, mulberry32(seed)).flatMap((s) => s.concepts);
      expect(ids.some((id) => BIG_NUMBER_IDS.includes(id))).toBe(false);
    }
    // Steady (level 2) on every one of them: now the teens can come.
    let steady: Mastery = {};
    for (const id of NUMBER_IDS) for (let i = 0; i < 4; i++) steady = recordAnswer(steady, id, true, i + 1);
    expect(NUMBER_IDS.every((id) => statOf(steady, id).l >= 2)).toBe(true);
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) for (const s of planStation('numbers', steady, 10, ENV, mulberry32(seed))) s.concepts.forEach((c) => seen.add(c));
    expect([...seen].some((id) => BIG_NUMBER_IDS.includes(id))).toBe(true);
  });
});

describe('maths questions', () => {
  it('ranges: within 5, then 10, then 20', () => {
    expect([0, 1, 2, 3].map(mathMax)).toEqual([5, 10, 20, 20]);
  });

  it('numberChoices gives the answer and different neighbours inside the range', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = mulberry32(seed);
      const got = numberChoices(5, 1, 8, 4, r);
      expect(got.length).toBe(4);
      expect(new Set(got).size).toBe(4);
      expect(got).toContain(5);
      expect(got.every((x) => x >= 1 && x <= 8)).toBe(true);
    }
  });

  it('adding: the right option is the sum of what is shown, within the level range', () => {
    loop((lvl, rng) => {
      const q = mathQuestion('add', lvl, rng);
      check(q, lvl);
      let a: number;
      let b: number;
      const s = q.stimulus!;
      if (s.k === 'row') {
        const plus = s.items.findIndex((i) => i.k === 'chip');
        a = plus;
        b = s.items.length - plus - 1;
      } else {
        [a, b] = textOf(s).split(' + ').map(Number) as [number, number];
      }
      expect(Number(q.answerId)).toBe(a + b);
      expect(a + b).toBeLessThanOrEqual(mathMax(lvl));
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(q.reveal.join(' ')).toContain(numberWord(a + b));
    });
  });

  it('taking away: some fly off, the answer is what is left', () => {
    loop((lvl, rng) => {
      const q = mathQuestion('sub', lvl, rng);
      check(q, lvl);
      const s = q.stimulus!;
      expect(s.k).toBe('group');
      if (s.k !== 'group') return;
      expect(s.gone).toBeGreaterThanOrEqual(1);
      expect(s.gone!).toBeLessThan(s.n);
      expect(s.n).toBeLessThanOrEqual(mathMax(lvl));
      expect(Number(q.answerId)).toBe(s.n - s.gone!);
      // The teacher says both numbers before asking.
      expect(q.say.join(' ').toLowerCase()).toContain(numberWord(s.n));
      expect(q.say.join(' ').toLowerCase()).toContain(numberWord(s.gone!));
    });
  });

  it('comparing: more, fewer and equal point at the right group', () => {
    const kinds = new Set<string>();
    loop((lvl, rng) => {
      const q = mathQuestion('cmp', lvl, rng);
      check(q, lvl);
      const counts = q.options.map((o) => groupN(o.visual));
      expect(counts.every((n) => n >= 1 && n <= 10)).toBe(true);
      const right = groupN(q.options.find((o) => o.id === q.answerId)!.visual);
      if (q.bubble.includes('nhiều hơn')) {
        kinds.add('more');
        expect(right).toBe(Math.max(...counts));
        expect(new Set(counts).size).toBe(counts.length);
      } else if (q.bubble.includes('ít hơn')) {
        kinds.add('fewer');
        expect(right).toBe(Math.min(...counts));
        expect(new Set(counts).size).toBe(counts.length);
      } else {
        kinds.add('equal');
        expect(right).toBe(groupN(q.stimulus!));
        expect(counts.filter((n) => n === right).length).toBe(1);
      }
    });
    expect([...kinds].sort()).toEqual(['equal', 'fewer', 'more']);
  });

  it('before and after: the answer is one more or one less, and a ❓ marks the gap', () => {
    loop((lvl, rng) => {
      const q = mathQuestion('next', lvl, rng);
      check(q, lvl);
      const row = (q.stimulus as Extract<Visual, { k: 'row' }>).items;
      const n = Number(textOf(row.find((i) => i.k === 'text')));
      const after = row[0]!.k === 'text';
      expect(Number(q.answerId)).toBe(after ? n + 1 : n - 1);
      expect(Number(q.answerId)).toBeGreaterThanOrEqual(1);
      expect(Number(q.answerId)).toBeLessThanOrEqual(mathMax(lvl));
    });
  });

  it('number line: the missing number is the one that fits between its neighbours', () => {
    loop((lvl, rng) => {
      const q = mathQuestion('gap', lvl, rng);
      check(q, lvl);
      const row = (q.stimulus as Extract<Visual, { k: 'row' }>).items;
      expect(row.length).toBe(5);
      const hole = row.findIndex((i) => i.k === 'chip');
      expect(hole).toBeGreaterThanOrEqual(lvl === 0 ? 1 : 0);
      const known = row.map((i) => (i.k === 'text' ? Number(i.v) : NaN));
      const start = hole === 0 ? known[1]! - 1 : known[0]!;
      expect(Number(q.answerId)).toBe(start + hole);
      expect(start + 4).toBeLessThanOrEqual(mathMax(lvl));
      expect(start).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('tones', () => {
  it('reads the tone of a written syllable', () => {
    expect(toneOf('ba')).toBe('ngang');
    expect(toneOf('bà')).toBe('huyen');
    expect(toneOf('bá')).toBe('sac');
    expect(toneOf('bả')).toBe('hoi');
    expect(toneOf('mã')).toBe('nga');
    expect(toneOf('mạ')).toBe('nang');
    expect(toneOf('dừa')).toBe('huyen');
    expect(toneOf('sáo')).toBe('sac');
    expect(toneOf('cờ')).toBe('huyen');
    expect(toneOf('bợ')).toBe('nang');
    expect(stripTone('dứa')).toBe('dưa');
    expect(tonedVowel('cá')).toBe('á');
    expect(tonedVowel('dừa')).toBe('ừ');
    expect(tonedVowel('ba')).toBe('');
    expect(blankTone('cá')).toBe('c_');
    expect(blankTone('sáo')).toBe('s_o');
  });

  it('every family is real syllables that differ only by tone, each tone once, and its pictures are among them', () => {
    for (const f of TONE_FAMILIES) {
      expect(f.forms.length, f.base).toBeGreaterThanOrEqual(3);
      expect(new Set(f.forms.map(toneOf)).size, f.base).toBe(f.forms.length);
      expect(new Set(f.forms.map(stripTone)).size, f.base).toBe(1);
      // The mark sits on the same vowel in every form, so one blank fits all.
      expect(new Set(f.forms.filter((x) => toneOf(x) !== 'ngang').map(blankTone)).size, f.base).toBe(1);
      for (const p of f.pics) expect(f.forms, `${f.base}/${p.w}`).toContain(p.w);
      expect(f.pics.length).toBeGreaterThanOrEqual(1);
    }
    expect(TONE_WORDS.length).toBeGreaterThanOrEqual(20);
    // One picture, one word: otherwise "which word is this?" has two answers.
    expect(new Set(TONE_WORDS.map((w) => w.emoji)).size).toBe(TONE_WORDS.length);
  });

  it('knows which sounds a word starts with (th, ch, nh are not t, c, n)', () => {
    expect(startsWithSound('mèo', 'M')).toBe(true);
    expect(startsWithSound('thỏ', 'T')).toBe(false);
    expect(startsWithSound('táo', 'T')).toBe(true);
    expect(startsWithSound('nhà', 'N')).toBe(false);
    expect(startsWithSound('xe', 'X')).toBe(true);
  });

  it('starting sound: the answer starts with it, no other option does', () => {
    loop((lvl, rng) => {
      const q = packQuestion('tones', 'start', lvl, rng);
      check(q, lvl);
      const letter = SOUND_LETTERS.find((l) => q.bubble.includes(`"${l.toLowerCase()}"`))!;
      expect(letter).toBeDefined();
      const right = q.options.find((o) => o.id === q.answerId)!;
      expect(startsWithSound(right.name, letter)).toBe(true);
      for (const o of q.options) if (o !== right) expect(startsWithSound(o.name, letter), `${o.name} vs ${letter}`).toBe(false);
    });
  });

  it('hearing a word: the options are written forms (or pictures) and the answer is the spoken word', () => {
    let written = 0;
    let pics = 0;
    loop((lvl, rng) => {
      const q = packQuestion('tones', 'hear', lvl, rng);
      check(q, lvl);
      const spoken = q.say[0]!;
      if (q.options[0]!.visual.k === 'text') {
        written++;
        expect(q.answerId).toBe(spoken);
        const fam = TONE_FAMILIES.find((f) => f.forms.includes(spoken))!;
        for (const o of q.options) expect(fam.forms).toContain(o.id);
        expect(q.stimulus?.k).toBe('emoji');
      } else {
        pics++;
        expect(TONE_WORDS.find((w) => w.w === spoken)!.emoji).toBe(q.answerId);
      }
    });
    expect(written).toBeGreaterThan(0);
    expect(pics).toBeGreaterThan(0);
  });

  it('missing tone mark: the right vowel makes the pictured word, the others make other tones', () => {
    loop((lvl, rng) => {
      const q = packQuestion('tones', 'mark', lvl, rng);
      check(q, lvl);
      const row = (q.stimulus as Extract<Visual, { k: 'row' }>).items;
      const emoji = row[0]!.k === 'emoji' ? row[0]!.v : '';
      const blank = textOf(row[1]);
      const word = TONE_WORDS.find((w) => w.emoji === emoji && blankTone(w.w) === blank)!;
      expect(word, `${emoji} ${blank}`).toBeDefined();
      expect(q.answerId).toBe(tonedVowel(word.w));
      expect(blank.replace('_', q.answerId)).toBe(word.w);
      const tones = q.options.map((o) => toneOf(o.id));
      expect(new Set(tones).size).toBe(tones.length);
      expect(q.options.find((o) => o.id === q.answerId)!.name).toBe(TONE_NAME[word.tone]);
    });
  });
});

describe('opposites', () => {
  const side = (emoji: string) => OPPOSITES.flatMap((o) => [o.a, o.b]).filter((s) => s.pics.some((p) => p.emoji === emoji));
  it('each pair has three pictures per side and no picture on both sides', () => {
    expect(OPPOSITES.length).toBeGreaterThanOrEqual(7);
    for (const o of OPPOSITES) {
      expect(o.a.pics.length).toBe(3);
      expect(o.b.pics.length).toBe(3);
      const both = o.a.pics.filter((p) => o.b.pics.some((q) => q.emoji === p.emoji));
      expect(both, o.id).toEqual([]);
    }
  });

  it('"which is X?" has exactly one X among opposites; "opposite of X" is the other side', () => {
    let finds = 0;
    let opps = 0;
    for (const o of OPPOSITES) {
      loop((lvl, rng) => {
        const q = packQuestion('opposites', o.id, lvl, rng);
        check(q, lvl);
        expect(q.concept).toBe(`O:${o.id}`);
        const answerSide = o.a.pics.some((p) => p.emoji === q.answerId) ? o.a : o.b;
        const other = answerSide === o.a ? o.b : o.a;
        if (q.stimulus) {
          opps++;
          const shown = q.stimulus.k === 'emoji' ? q.stimulus.v : '';
          expect(other.pics.some((p) => p.emoji === shown)).toBe(true);
          expect(q.bubble).toContain(other.word);
        } else {
          finds++;
          expect(q.bubble).toBe(`Cái nào ${answerSide.word}?`);
          // Every wrong option is from the opposite side: only one right answer.
          for (const opt of q.options) if (opt.id !== q.answerId) expect(other.pics.some((p) => p.emoji === opt.id)).toBe(true);
        }
      }, 30);
    }
    expect(finds).toBeGreaterThan(0);
    expect(opps).toBeGreaterThan(0);
    expect(side('🔥').length).toBeGreaterThan(0);
  });

  it('is gentle at level 0: only "which is X?"', () => {
    for (let seed = 1; seed <= 50; seed++) expect(packQuestion('opposites', 'temp', 0, mulberry32(seed)).stimulus).toBeUndefined();
  });
});

describe('time', () => {
  const next = (id: string, by: number) => DAY_PARTS[(DAY_PARTS.findIndex((p) => p.id === id) + by + DAY_PARTS.length) % DAY_PARTS.length]!;

  it('day parts are in order with a sky picture each, and the sun moves', () => {
    expect(DAY_PARTS.map((p) => p.id)).toEqual(['morning', 'noon', 'afternoon', 'night']);
    expect(new Set(DAY_PARTS.map((p) => p.sky)).size).toBe(4);
    expect(SEASONS.length).toBe(4);
  });

  it('what comes next: after sáng is trưa, after tối is sáng again', () => {
    const seen = new Set<string>();
    loop((lvl, rng) => {
      const q = packQuestion('time', 'order', lvl, rng);
      check(q, lvl);
      const row = (q.stimulus as Extract<Visual, { k: 'row' }>).items;
      const shown = DAY_PARTS.find((p) => row.some((i) => i.k === 'emoji' && i.v === p.sky))!;
      const after = row[0]!.k === 'emoji';
      const want = next(shown.id, after ? 1 : -1);
      expect(q.answerId).toBe(want.sky);
      seen.add(`${shown.id}${after ? '>' : '<'}`);
    });
    expect(seen.has('night>')).toBe(true);
    expect(seen.has('morning>')).toBe(true);
    expect([...seen].some((s) => s.endsWith('<'))).toBe(true);
  });

  it('level 0 and 1 only ask what comes after', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const q = packQuestion('time', 'order', 1, mulberry32(seed));
      expect((q.stimulus as Extract<Visual, { k: 'row' }>).items[0]!.k).toBe('emoji');
    }
  });

  it('day questions: an activity belongs to the part chosen; seasons match their clue', () => {
    loop((lvl, rng) => {
      const q = packQuestion('time', 'day', lvl, rng);
      check(q, lvl);
      if (q.stimulus?.k === 'emoji' && DAY_PARTS.some((p) => p.sky === (q.stimulus as { v: string }).v)) {
        const part = DAY_PARTS.find((p) => p.sky === (q.stimulus as { v: string }).v)!;
        expect(part.acts.some((a) => a.emoji === q.answerId)).toBe(true);
        for (const o of q.options) if (o.id !== q.answerId) expect(part.acts.some((a) => a.emoji === o.id)).toBe(false);
      } else {
        const part = DAY_PARTS.find((p) => p.sky === q.answerId)!;
        expect(part.acts.some((a) => a.emoji === (q.stimulus as { v: string }).v)).toBe(true);
      }
      const s = packQuestion('time', 'season', lvl, rng);
      check(s, lvl);
      const season = SEASONS.find((x) => x.sky === s.answerId)!;
      expect(season.clues.some((c) => c.emoji === (s.stimulus as { v: string }).v)).toBe(true);
    });
  });
});

describe('left and right', () => {
  it('names the child\'s own side and the answer really is on that side of the row', () => {
    const kinds = new Set<string>();
    for (const key of ['left', 'right']) {
      loop((lvl, rng) => {
        const q = packQuestion('leftright', key, lvl, rng);
        check(q, lvl);
        const side = key === 'left' ? 'trái' : 'phải';
        expect(q.bubble).toContain(side);
        expect(q.bubble).not.toContain(side === 'trái' ? 'phải' : 'trái');
        if (q.stimulus?.k === 'row') {
          kinds.add('row');
          const order = q.stimulus.items.map((i) => (i.k === 'emoji' ? i.v : ''));
          expect(order.length).toBe(lvl >= 2 ? 3 : 2);
          expect(q.answerId).toBe(key === 'left' ? order[0] : order[order.length - 1]);
          expect(order.every((e) => LR_THINGS.some((t) => t.emoji === e))).toBe(true);
        } else {
          kinds.add('point');
          const right = q.options.find((o) => o.id === q.answerId)!;
          expect(right.name).toBe(`chỉ sang bên ${side}`);
          const v = right.visual.k === 'emoji' ? right.visual.v : '';
          expect(key === 'left' ? ['👈', '⬅️'] : ['👉', '➡️']).toContain(v);
        }
      });
    }
    expect(kinds.size).toBe(2);
  });

  it('level 0 only uses the two-picture row', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const q = packQuestion('leftright', 'right', 0, mulberry32(seed));
      expect(q.stimulus?.k).toBe('row');
      expect(q.options.length).toBe(2);
    }
  });
});

describe('safety and hygiene', () => {
  it('every scene has the right habit and at least three wrong ones, none the same picture', () => {
    expect(SAFETY_SCENES.map((s) => s.id)).toEqual(expect.arrayContaining(['wash', 'helmet', 'cross']));
    for (const s of SAFETY_SCENES) {
      expect(s.wrong.length, s.id).toBeGreaterThanOrEqual(3);
      expect(s.wrong.some((w) => w.emoji === s.right.emoji)).toBe(false);
      expect(new Set(s.wrong.map((w) => w.emoji)).size).toBe(s.wrong.length);
    }
  });

  it('scenes ask for the right habit; "danger" picks the dangerous thing among harmless ones', () => {
    for (const s of SAFETY_SCENES) {
      loop((lvl, rng) => {
        const q = packQuestion('safety', s.id, lvl, rng);
        check(q, lvl);
        expect(q.answerId).toBe(s.right.emoji);
      }, 20);
    }
    loop((lvl, rng) => {
      const q = packQuestion('safety', 'danger', lvl, rng);
      check(q, lvl);
      expect(q.reveal.join(' ').length).toBeGreaterThan(0);
    });
  });
});

describe('the new stations in the whole game', () => {
  it('have concepts with the right prefix, no repeats', () => {
    const prefix: Partial<Record<TopicId, string>> = { math: 'M', tones: 'T', opposites: 'O', time: 'D', leftright: 'R', safety: 'S' };
    for (const [t, p] of Object.entries(prefix)) {
      const ids = conceptsOf(t as TopicId, ENV);
      expect(ids.length).toBeGreaterThan(1);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id.startsWith(`${p}:`)).toBe(true);
    }
  });

  it('show only to the ages (or the amount of play) that suit them', () => {
    const ids = (age: number, total: number, runs = {}) => visibleTopics(age, runs, total).map((t) => t.id);
    const base = TOPICS.slice(0, 10).map((t) => t.id);
    // A three-year-old, or a parent who set nothing and a child who just started: the friendly ten.
    expect(ids(3, 50)).toEqual(base);
    expect(ids(2, 0)).toEqual(base);
    expect(ids(0, 0)).toEqual(base);
    expect(ids(0, 2)).toEqual(base);
    // Age four gets maths, opposites, safety; five and six get everything.
    expect(ids(4, 0)).toEqual([...base, 'math', 'opposites', 'safety']);
    expect(ids(5, 0).length).toBe(16);
    expect(ids(6, 0).length).toBe(16);
    // No age set: they open one by one as stations are finished.
    expect(ids(0, 3)).toContain('math');
    expect(ids(0, 3)).not.toContain('opposites');
    expect(ids(0, 8).length).toBe(16);
    // Played already: stays even if the age was lowered.
    expect(ids(3, 0, { math: 1 })).toContain('math');
  });
});
