import { describe, it, expect } from 'vitest';
import { dropAt } from './dnd';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
// Two seats on the stage, the shelf underneath.
const targets = [
  { id: '0', rect: rect(10, 100, 80, 120) },
  { id: '1', rect: rect(110, 100, 80, 120) },
];
const stage = rect(0, 80, 200, 200);
const shelf = rect(0, 300, 200, 100);

describe('where a robot lands', () => {
  it('on the seat it is let go over', () => {
    expect(dropAt({ x: 50, y: 150 }, targets, stage, shelf)).toEqual({ kind: 'slot', slot: 0 });
    expect(dropAt({ x: 150, y: 150 }, targets, stage, shelf)).toEqual({ kind: 'slot', slot: 1 });
  });
  it('on the nearest seat when let go over the stage but between seats (forgiving)', () => {
    expect(dropAt({ x: 99, y: 260 }, targets, stage, shelf)).toEqual({ kind: 'slot', slot: 0 });
    expect(dropAt({ x: 101, y: 260 }, targets, stage, shelf)).toEqual({ kind: 'slot', slot: 1 });
  });
  it('back on the shelf when let go over the shelf', () => {
    expect(dropAt({ x: 100, y: 350 }, targets, stage, shelf)).toEqual({ kind: 'shelf' });
  });
  it('nowhere when let go far from both', () => {
    expect(dropAt({ x: 100, y: 20 }, targets, stage, shelf)).toEqual({ kind: 'nowhere' });
    expect(dropAt({ x: 500, y: 150 }, targets, stage, shelf)).toEqual({ kind: 'nowhere' });
  });
});
