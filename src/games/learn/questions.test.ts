import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { TOPICS, conceptsOf, peopleFrom } from './curriculum';
import { optionCount, recordAnswer, statOf, type Mastery } from './picker';
import { buildQuestion, distractors, pickScales, planStation, slotKinds } from './questions';
import type { ChooseQuestion, Env, Question, TopicId } from './types';

const people = peopleFrom([
  { id: '1', url: 'data:a', name: 'Mẹ' },
  { id: '2', url: 'data:b', name: 'Ba' },
  { id: '3', url: 'data:c', name: 'Bà' },
  { id: '4', url: 'data:d', name: 'Mẹ' },
]);
const ENV: Env = { people };

function levelUp(id: string, to: number): Mastery {
  let m: Mastery = {};
  for (let i = 0; statOf(m, id).l < to && i < 40; i++) m = recordAnswer(m, id, true, i + 1);
  return m;
}

function assertChoose(q: ChooseQuestion, level: number): void {
  expect(q.options.length).toBeGreaterThanOrEqual(2);
  expect(q.options.length).toBeLessThanOrEqual(Math.max(optionCount(level), 4));
  const ids = q.options.map((o) => o.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.filter((id) => id === q.answerId).length).toBe(1);
  expect(q.say.length).toBeGreaterThan(0);
  expect(q.say.every((s) => s.trim().length > 0)).toBe(true);
  expect(q.again.length).toBeGreaterThan(0);
  expect(q.reveal.length).toBeGreaterThan(0);
  expect(q.bubble.length).toBeGreaterThan(0);
}

describe('every topic builds sound questions at every level', () => {
  for (const topic of TOPICS) {
    it(`${topic.id}: one answer, distinct options, enough to say`, () => {
      const concepts = conceptsOf(topic.id, ENV);
      for (let lvl = 0; lvl <= 3; lvl++) {
        for (let seed = 0; seed < 12; seed++) {
          const rng = mulberry32(seed * 31 + lvl);
          for (const concept of concepts.slice(0, 12)) {
            const m = levelUp(concept, lvl);
            const q = buildQuestion(topic.id, { kind: 'choose', concepts: [concept] }, m, ENV, rng);
            expect(q.type).toBe('choose');
            expect(q.topic).toBe(topic.id);
            assertChoose(q as ChooseQuestion, lvl);
          }
        }
      }
    });
  }

  it('offers 2 choices at level 0 and 4 at level 2 for letters', () => {
    const q0 = buildQuestion('letters', { kind: 'choose', concepts: ['L:B'] }, {}, ENV, mulberry32(1)) as ChooseQuestion;
    expect(q0.options.length).toBe(2);
    const q2 = buildQuestion('letters', { kind: 'choose', concepts: ['L:B'] }, levelUp('L:B', 2), ENV, mulberry32(1)) as ChooseQuestion;
    expect(q2.options.length).toBe(4);
  });
});

describe('specific questions', () => {
  it('asks to find the letter and names it slowly in two parts', () => {
    const q = buildQuestion('letters', { kind: 'choose', concepts: ['L:B'] }, {}, ENV, mulberry32(2)) as ChooseQuestion;
    expect(q.say).toEqual(['Chữ bê', 'đâu nào?']);
    expect(q.answerId).toBe('B');
    expect(q.stimulus).toEqual({ k: 'text', v: 'Bb' });
  });

  it('counts: the right number of pictures, and the answer is that number', () => {
    for (let seed = 0; seed < 30; seed++) {
      const q = buildQuestion('numbers', { kind: 'choose', concepts: ['N:3'] }, {}, ENV, mulberry32(seed)) as ChooseQuestion;
      expect(q.answerId).toBe('3');
      if (q.stimulus?.k === 'group') expect(q.stimulus.n).toBe(3);
    }
  });

  it('plays a voice for sound questions and never offers two animals that sound the same', () => {
    for (let seed = 0; seed < 40; seed++) {
      const m = levelUp('A:🦁', 2);
      const q = buildQuestion('animals', { kind: 'choose', concepts: ['A:🦁'] }, m, ENV, mulberry32(seed)) as ChooseQuestion;
      expect(q.sound).toBe('roar');
      expect(q.options.some((o) => o.id === '🐯')).toBe(false);
    }
  });

  it('shows the pattern with its missing piece last', () => {
    const q = buildQuestion('pattern', { kind: 'choose', concepts: ['P:AB'] }, {}, ENV, mulberry32(4)) as ChooseQuestion;
    expect(q.stimulus?.k).toBe('row');
    if (q.stimulus?.k === 'row') {
      expect(q.stimulus.items.at(-1)).toEqual({ k: 'chip', v: '❓' });
      expect(q.stimulus.items.length).toBe(6);
    }
  });

  it('asks for the bigger one, and the answer really is the biggest', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const key of ['big', 'small']) {
        const q = buildQuestion('sizes', { kind: 'choose', concepts: [`Z:${key}`] }, levelUp(`Z:${key}`, seed % 3), ENV, mulberry32(seed)) as ChooseQuestion;
        const scales = q.options.map((o) => (o.visual.k === 'emoji' ? (o.visual.scale ?? 1) : 0));
        const answer = q.options.findIndex((o) => o.id === q.answerId);
        const want = key === 'big' ? Math.max(...scales) : Math.min(...scales);
        expect(scales[answer]).toBe(want);
        expect(new Set(scales).size).toBe(scales.length);
      }
    }
  });

  it('keeps sizes apart at level 0 and tight at level 3', () => {
    const far = pickScales(2, 0, mulberry32(1));
    expect(Math.abs(far[0]! - far[1]!)).toBeGreaterThan(0.4);
    expect(pickScales(4, 3, mulberry32(1)).length).toBe(4);
  });

  it('family: asks by name, shows distinct people and teaches with the name', () => {
    const mq = conceptsOf('family', ENV)[0]!;
    for (let seed = 0; seed < 30; seed++) {
      const q = buildQuestion('family', { kind: 'choose', concepts: [mq] }, levelUp(mq, 2), ENV, mulberry32(seed)) as ChooseQuestion;
      assertChoose(q, 2);
      expect(q.answerId).toBe(mq.slice(2));
    }
  });

  it('family: with unnamed (old) photos falls back to matching two photos', () => {
    const old: Env = { people: peopleFrom([{ id: '1', url: 'a' }, { id: '2', url: 'b' }, { id: '3', url: 'c' }]) };
    const c = conceptsOf('family', old)[0]!;
    const q = buildQuestion('family', { kind: 'choose', concepts: [c] }, {}, old, mulberry32(1)) as ChooseQuestion;
    assertChoose(q, 0);
    expect(q.stimulus?.k).toBe('photo');
    expect(q.options.every((o) => o.visual.k === 'photo')).toBe(true);
  });

  it('distractors never include the answer and can prefer look-alikes', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'];
    const d = distractors(pool, 'a', 2, mulberry32(1), true, [['a', 'e', 'c']]);
    expect(d.length).toBe(2);
    expect(d).not.toContain('a');
    expect([...d].sort()).toEqual(['c', 'e']);
  });
});

describe('drag-and-drop questions', () => {
  const dragTopics: TopicId[] = ['colors', 'sizes', 'sorting'];
  for (const topic of dragTopics) {
    it(`${topic}: every item belongs to exactly one bin and every bin gets an item`, () => {
      for (let seed = 0; seed < 25; seed++) {
        const rng = mulberry32(seed);
        const slots = planStation(topic, {}, seed, ENV, rng);
        const drag = slots.find((s) => s.kind === 'drag')!;
        const q = buildQuestion(topic, drag, {}, ENV, rng) as Extract<Question, { type: 'drag' }>;
        expect(q.type).toBe('drag');
        expect(q.bins.length).toBeGreaterThanOrEqual(2);
        expect(q.items.length).toBeGreaterThanOrEqual(4);
        expect(q.items.length).toBeLessThanOrEqual(6);
        const binIds = q.bins.map((b) => b.id);
        expect(new Set(binIds).size).toBe(binIds.length);
        for (const it of q.items) expect(binIds).toContain(it.binId);
        for (const b of binIds) expect(q.items.some((it) => it.binId === b)).toBe(true);
        expect(new Set(q.items.map((i) => i.id)).size).toBe(q.items.length);
      }
    });
  }
});

describe('planning a station', () => {
  it('makes five slots; topics with drag mix it in', () => {
    expect(slotKinds('letters')).toEqual(['choose', 'choose', 'choose', 'choose', 'choose']);
    expect(slotKinds('colors').filter((k) => k === 'drag').length).toBe(2);
  });

  it('is the same plan for the same state and seed, and different for another seed', () => {
    const plan = (seed: number) => planStation('letters', {}, 5, ENV, mulberry32(seed));
    expect(plan(9)).toEqual(plan(9));
    expect(JSON.stringify(plan(9))).not.toEqual(JSON.stringify(plan(10)));
  });

  it('asks five different concepts when it can', () => {
    const slots = planStation('letters', {}, 5, ENV, mulberry32(3));
    const ids = slots.flatMap((s) => s.concepts);
    expect(new Set(ids).size).toBe(5);
  });

  it('puts a concept the child has not met ahead of one they know', () => {
    let m: Mastery = {};
    for (let i = 0; i < 6; i++) m = recordAnswer(m, 'L:B', true, i + 1);
    let withB = 0;
    for (let seed = 0; seed < 60; seed++) {
      const ids = planStation('letters', m, 50, ENV, mulberry32(seed)).flatMap((s) => s.concepts);
      if (ids.includes('L:B')) withB++;
    }
    expect(withB).toBeLessThan(60);
  });

  it('plans a family station from two people', () => {
    const slots = planStation('family', {}, 1, ENV, mulberry32(1));
    expect(slots.length).toBe(5);
    for (const s of slots) {
      const q = buildQuestion('family', s, {}, ENV, mulberry32(2));
      expect(q.type).toBe('choose');
    }
  });
});
