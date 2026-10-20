import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/dom';
import { PICTURES as BLOCK_PICTURES } from '../blocks/logic';
import { dropY, emptyBoard, modelProgress, nextBrick, place, shiftModel, centerOffset } from '../bricks/logic';
import {
  BLUEPRINTS,
  FREE_ARTS,
  MODE_IDS,
  PUZZLE_ARTS,
  SHADOW_ORDER,
  blockColorName,
  blueprintsAt,
  describeBlock,
  describeStep,
  nextUnlock,
  pickArt,
  pickBlueprint,
  pickShadow,
  pieceHint,
  positionWord,
  puzzleArtsAt,
  puzzleLevel,
  puzzleRung,
  shadowHasSeams,
  shadowPoolAt,
  unlockTimes,
  unlockedAt,
  vehicleVoice,
} from './levels';

describe('puzzle pictures', () => {
  it('has unique ids, animals first and a gentle unlock order', () => {
    expect(new Set(PUZZLE_ARTS.map((a) => a.id)).size).toBe(PUZZLE_ARTS.length);
    expect(puzzleArtsAt(0)).toHaveLength(FREE_ARTS);
    expect(PUZZLE_ARTS.slice(0, FREE_ARTS).every((a) => a.kind === 'emoji')).toBe(true);
    for (let i = 1; i < PUZZLE_ARTS.length; i++) expect(PUZZLE_ARTS[i]!.unlockAt).toBeGreaterThanOrEqual(PUZZLE_ARTS[i - 1]!.unlockAt);
    expect(PUZZLE_ARTS.some((a) => a.kind === 'scene')).toBe(true);
  });
  it('one star opens exactly one more picture', () => {
    expect(puzzleArtsAt(1)).toHaveLength(FREE_ARTS + 1);
    expect(puzzleArtsAt(10_000)).toHaveLength(PUZZLE_ARTS.length);
  });
  it('never picks a locked picture, and avoids the last one', () => {
    const rng = mulberry32(7);
    for (let stars = 0; stars < 20; stars++) {
      const open = new Set(puzzleArtsAt(stars).map((a) => a.id));
      let last: string | undefined;
      for (let i = 0; i < 30; i++) {
        const a = pickArt(stars, rng, last);
        expect(open.has(a.id)).toBe(true);
        expect(a.id).not.toBe(last);
        last = a.id;
      }
    }
  });
  it('the cut ladder only climbs', () => {
    for (let s = 1; s < 40; s++) expect(puzzleRung(s)).toBeGreaterThanOrEqual(puzzleRung(s - 1));
    expect(puzzleLevel(0)).toEqual({ style: 'grid', args: [2, 2] });
    expect(['grid', 'strips', 'diag', 'pie', 'knobs', 'wavy']).toContain(puzzleLevel(12).style);
  });
});

describe('shadows', () => {
  it('start with the fewest blocks and grow one a star', () => {
    expect(SHADOW_ORDER).toHaveLength(BLOCK_PICTURES.length);
    const sizes = SHADOW_ORDER.map((p) => p.blocks.length);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(Math.max(...shadowPoolAt(0).map((p) => p.blocks.length))).toBeLessThanOrEqual(4);
    expect(shadowPoolAt(3)).toHaveLength(shadowPoolAt(2).length + 1);
    expect(shadowPoolAt(999)).toHaveLength(SHADOW_ORDER.length);
  });
  it('shows seams only for beginners', () => {
    expect(shadowHasSeams(0)).toBe(true);
    expect(shadowHasSeams(50)).toBe(false);
  });
  it('picks inside the pool', () => {
    const rng = mulberry32(3);
    const open = new Set(shadowPoolAt(2).map((p) => p.id));
    for (let i = 0; i < 30; i++) expect(open.has(pickShadow(2, rng).id)).toBe(true);
  });
  it('can say every colour and shape of every picture', () => {
    for (const p of BLOCK_PICTURES)
      for (const b of p.blocks) {
        expect(blockColorName(b.color)).not.toBe('nhiều màu');
        expect(describeBlock(b.shape, b.color)).toContain('hình');
      }
  });
});

describe('blueprints', () => {
  it('unlock in order, two free', () => {
    expect(blueprintsAt(0).length).toBeGreaterThanOrEqual(2);
    expect(blueprintsAt(999)).toHaveLength(BLUEPRINTS.length);
  });
  it('fit both plates (8 wide at most, 8 tall at most)', () => {
    for (const { model } of BLUEPRINTS) {
      const xs = model.cells.map((c) => c.x);
      expect(Math.max(...xs) - Math.min(...xs) + 1).toBeLessThanOrEqual(8);
      expect(Math.max(...model.cells.map((c) => c.y)) + 1).toBeLessThanOrEqual(8);
    }
  });
  it('can always be built by following the glowing step, on both plates', () => {
    for (const [cols, rows] of [
      [10, 8],
      [8, 10],
    ] as const) {
      for (const { model: base } of BLUEPRINTS) {
        const model = shiftModel(base, centerOffset(base, cols));
        let board = emptyBoard(cols, rows);
        for (let i = 0; i < 80 && !modelProgress(board, model).complete; i++) {
          const s = nextBrick(board, model);
          expect(s, `${base.id} step ${i}`).not.toBeNull();
          const y = dropY(board, s!.x, s!.w, s!.h);
          expect(y).not.toBeNull();
          board = place(board, { x: s!.x, y: y!, w: s!.w, h: s!.h, color: s!.color });
        }
        expect(modelProgress(board, model).complete, base.id).toBe(true);
      }
    }
  });
  it('picks only what is open', () => {
    const rng = mulberry32(5);
    const open = new Set(blueprintsAt(1).map((b) => b.model.id));
    for (let i = 0; i < 20; i++) expect(open.has(pickBlueprint(1, rng).id)).toBe(true);
  });
  it('describes a step in few words', () => {
    expect(describeStep({ x: 0, w: 2, h: 1, color: '#ef4444' })).toBe('Gạch màu đỏ, dài hai ô');
    expect(describeStep({ x: 0, w: 1, h: 1, color: '#22c55e' })).toBe('Gạch màu xanh lá, một ô');
    expect(describeStep({ x: 0, w: 2, h: 2, color: '#3b82f6' })).toContain('hai nhân hai');
  });
});

describe('unlock clock', () => {
  it('every mode has unlocks, and the bar fills between them', () => {
    for (const m of MODE_IDS) {
      const t = unlockTimes(m);
      expect(t.length).toBeGreaterThan(3);
      expect(nextUnlock(m, 0).remaining).toBe(t[0]);
      expect(nextUnlock(m, 0).fraction).toBe(0);
      expect(nextUnlock(m, 999)).toEqual({ remaining: 0, fraction: 1 });
    }
  });
  it('names what a star opens', () => {
    expect(unlockedAt('puzzle', 0)).toEqual([]);
    expect(unlockedAt('puzzle', 1)).toHaveLength(1);
    expect(unlockedAt('shadow', 1)).toHaveLength(1);
    expect(unlockedAt('build', 1)).toHaveLength(1);
  });
});

describe('words', () => {
  it('says where a piece goes', () => {
    expect(positionWord(0.5, 0.1)).toBe('lên trên');
    expect(positionWord(0.5, 0.9)).toBe('xuống dưới');
    expect(positionWord(0.1, 0.5)).toBe('sang bên trái');
    expect(positionWord(0.9, 0.5)).toBe('sang bên phải');
    expect(positionWord(0.5, 0.5)).toBe('vào giữa');
    expect(positionWord(0.1, 0.1)).toBe('ở góc trên bên trái');
    expect(pieceHint(0.5, 0.1)).toBe('Mảnh này, lên trên nhé');
  });
  it('knows a few vehicle sounds', () => {
    expect(vehicleVoice('🚒')).toBe('siren');
    expect(vehicleVoice('🍎')).toBeNull();
  });
});
