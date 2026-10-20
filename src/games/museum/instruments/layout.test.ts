import { describe, expect, it } from 'vitest';
import { DRUMS, TIMBRES } from '../../../core/audio';
import { INSTRUMENT_IDS } from '../../../core/instruments';
import { ALL_KINDS, familyOf, layoutFor } from './layout';
import { inPenta, MAJOR, snapPenta, pentaFrom, majorFrom } from './scale';
import { shapeCenter, shapeSize } from './svg';
import type { Board, Harmony, InstrumentKind, Voice, Zone } from './types';
import { voiceMidi } from './voices';

/** Playfields a phone and a tablet actually give the instrument (stage minus the header strip). */
const SIZES = [
  { name: 'phone portrait', w: 370, h: 620 },
  { name: 'phone landscape', w: 660, h: 290 },
  { name: 'tablet portrait', w: 740, h: 900 },
  { name: 'tablet landscape', w: 980, h: 600 },
] as const;

const pitched = (z: Zone): number[] => z.voices.map(voiceMidi).filter((m): m is number => m !== null);

describe('simulations cover every sound in the repo', () => {
  it('has a board for every timbre, drum and world instrument', () => {
    expect(ALL_KINDS.length).toBe(TIMBRES.length + DRUMS.length + INSTRUMENT_IDS.length);
    for (const kind of ALL_KINDS) {
      for (const s of SIZES) {
        const b = layoutFor(kind, s.w, s.h);
        expect(b.zones.length, `${kind} ${s.name}`).toBeGreaterThan(0);
        expect(b.svg.startsWith('<svg'), kind).toBe(true);
        expect(b.family).toBe(familyOf(kind));
      }
    }
  });

  it('draws every zone and gives ids that are unique', () => {
    for (const kind of ALL_KINDS) {
      const b = layoutFor(kind, 370, 620);
      const ids = b.zones.map((z) => z.id);
      expect(new Set(ids).size, kind).toBe(ids.length);
      for (const id of ids) expect(b.svg, `${kind} ${id}`).toContain(`data-z="${id}"`);
    }
  });

  it('keeps every zone on the board', () => {
    for (const kind of ALL_KINDS) {
      for (const s of SIZES) {
        const b = layoutFor(kind, s.w, s.h);
        for (const z of b.zones) {
          const c = shapeCenter(z.shape);
          expect(c.x, `${kind} ${z.id} ${s.name}`).toBeGreaterThan(0);
          expect(c.x).toBeLessThan(s.w);
          expect(c.y).toBeGreaterThan(0);
          expect(c.y).toBeLessThan(s.h);
        }
      }
    }
  });
});

describe('touch targets', () => {
  it('are at least 72 px (small ones are flagged on purpose)', () => {
    for (const kind of ALL_KINDS) {
      for (const s of SIZES) {
        const b = layoutFor(kind, s.w, s.h);
        for (const z of b.zones) {
          if (z.small) continue;
          expect(shapeSize(z.shape), `${kind} ${z.id} on ${s.name}`).toBeGreaterThanOrEqual(71.5);
        }
      }
    }
  });

  it('only a few zones are allowed to be small, and never the main ones', () => {
    for (const kind of ALL_KINDS) {
      const b = layoutFor(kind, 370, 620);
      const small = b.zones.filter((z) => z.small).length;
      expect(small, kind).toBeLessThanOrEqual(5);
      expect(b.zones.length - small, kind).toBeGreaterThanOrEqual(2);
    }
  });
});

/** Position of a zone along the axis a rising pitch should follow, per family and orientation. */
function axis(b: Board, z: Zone): number {
  const c = shapeCenter(z.shape);
  const up = b.family === 'keyboard' || b.family === 'bars';
  if (b.portrait && (up || b.family === 'harmonica' || b.family === 'accordion')) return up ? -c.y : c.y;
  return c.x;
}

describe('pitch follows position', () => {
  const rising: InstrumentKind[] = ['piano', 'organ', 'xylo', 'bell', 'marimba', 'vibraphone', 'kalimba', 'chimes', 'harp', 'panflute'];
  for (const kind of rising) {
    it(`${kind}: pitch rises from low to high across the instrument`, () => {
      for (const s of SIZES) {
        for (const harmony of ['free', 'pentatonic'] as Harmony[]) {
          const b = layoutFor(kind, s.w, s.h, harmony);
          const white = b.zones.filter((z) => !z.small);
          const sorted = [...white].sort((a, c) => axis(b, a) - axis(b, c));
          const midis = sorted.map((z) => pitched(z)[0]!);
          for (let i = 1; i < midis.length; i++) expect(midis[i]!, `${kind} ${s.name} ${harmony}`).toBeGreaterThanOrEqual(midis[i - 1]!);
          expect(midis[midis.length - 1]!).toBeGreaterThan(midis[0]!);
        }
      }
    });
  }

  it('piano white keys are C D E F G A B C, and the black keys sit between', () => {
    const b = layoutFor('piano', 660, 290, 'free');
    const whites = b.zones.filter((z) => !z.small).sort((a, c) => axis(b, a) - axis(b, c));
    expect(whites.map((z) => pitched(z)[0])).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    const blacks = b.zones.filter((z) => z.small);
    expect(blacks.map((z) => pitched(z)[0]).sort()).toEqual([61, 63, 66, 68, 70]);
  });

  it('marimba bars are longer for lower notes', () => {
    const b = layoutFor('marimba', 660, 290, 'free');
    const bars = b.zones.filter((z) => z.shape.t === 'rect').sort((a, c) => axis(b, a) - axis(b, c));
    const len = (z: Zone) => (z.shape.t === 'rect' ? Math.max(z.shape.w, z.shape.h) : 0);
    // landscape: the bar's length is its height
    const h = (z: Zone) => (z.shape.t === 'rect' ? z.shape.h : 0);
    for (let i = 1; i < bars.length; i++) expect(h(bars[i]!)).toBeLessThan(h(bars[i - 1]!));
    expect(len(bars[0]!)).toBeGreaterThan(len(bars[7]!));
  });

  it('the steel pan ring rises clockwise from the upper left', () => {
    const b = layoutFor('steelpan', 400, 400, 'pentatonic');
    const ring = b.zones.filter((z) => shapeCenter(z.shape).x !== 200 || shapeCenter(z.shape).y !== 200);
    const ang = ring.map((z) => {
      const c = shapeCenter(z.shape);
      return { a: (Math.atan2(c.y - 200, c.x - 200) * 180) / Math.PI + 360, m: pitched(z)[0]! };
    });
    const byAngle = [...ang].sort((p, q) => ((p.a - 205) % 360) - ((q.a - 205) % 360));
    for (let i = 1; i < byAngle.length; i++) expect(byAngle[i]!.m).toBeGreaterThan(byAngle[i - 1]!.m);
  });

  it('violin: higher toward the bridge, and each string starts a step above the last', () => {
    const b = layoutFor('violin', 660, 290, 'pentatonic');
    for (let s = 0; s < 4; s++) {
      const row = b.zones.filter((z) => z.id.startsWith(`v${s}-`)).sort((a, c) => axis(b, a) - axis(b, c));
      const ms = row.map((z) => pitched(z)[0]!);
      for (let i = 1; i < ms.length; i++) expect(ms[i]!).toBeGreaterThan(ms[i - 1]!);
    }
  });
});

describe('harmony mode: nothing outside C pentatonic', () => {
  it('every pitched voice of every instrument is pentatonic', () => {
    for (const kind of ALL_KINDS) {
      for (const s of SIZES) {
        const b = layoutFor(kind, s.w, s.h, 'pentatonic');
        const voices: Voice[] = b.zones.flatMap((z) => z.voices);
        for (const [, chord] of Object.entries(b.strum?.chords ?? {})) voices.push(...(chord.filter(Boolean) as Voice[]));
        if (b.fingering && b.holes) {
          const n = b.holes.length;
          for (let mask = 0; mask < 1 << n; mask++) voices.push(b.fingering(Array.from({ length: n }, (_, i) => !!(mask & (1 << i)))));
        }
        for (const v of voices) {
          const m = voiceMidi(v);
          if (m !== null) expect(inPenta(m), `${kind} ${s.name}: midi ${m}`).toBe(true);
        }
      }
    }
  });

  it('free mode keeps the instrument in C major (a chord, a key, a hole never leaves the key)', () => {
    const major = MAJOR as readonly number[];
    for (const kind of ALL_KINDS) {
      const b = layoutFor(kind, 660, 290, 'free');
      const voices: Voice[] = b.zones.flatMap((z) => z.voices);
      for (const chord of Object.values(b.strum?.chords ?? {})) voices.push(...(chord.filter(Boolean) as Voice[]));
      if (b.fingering && b.holes && kind !== 'trumpet') {
        const n = b.holes.length;
        for (let mask = 0; mask < 1 << n; mask++) voices.push(b.fingering(Array.from({ length: n }, (_, i) => !!(mask & (1 << i)))));
      }
      for (const v of voices) {
        const m = voiceMidi(v);
        // black keys are the one place an instrument may step outside the key
        if (m !== null && kind !== 'piano' && kind !== 'organ')
          expect(major.includes(((m % 12) + 12) % 12), `${kind}: midi ${m}`).toBe(true);
      }
    }
  });
});

describe('fretted instruments', () => {
  for (const kind of ['guitar', 'ukulele', 'banjo', 'bass'] as const) {
    it(`${kind}: four chords, one voice per string, strings in order`, () => {
      for (const s of SIZES) {
        const b = layoutFor(kind, s.w, s.h);
        const strum = b.strum!;
        expect(strum.order).toEqual(['C', 'Am', 'F', 'G']);
        const n = strum.lines.length;
        expect(n).toBeGreaterThanOrEqual(4);
        for (const name of strum.order) expect(strum.chords[name]!.length).toBe(n);
        expect(strum.axis).toBe(s.w < s.h ? 'x' : 'y');
        for (let i = 1; i < n; i++) expect(strum.lines[i]!).toBeGreaterThan(strum.lines[i - 1]!);
        expect(b.zones.filter((z) => z.role === 'chord').length).toBe(4);
      }
    });
  }

  it('the C chord on guitar is C E G C E (low to high), G chord has a B', () => {
    const b = layoutFor('guitar', 660, 290, 'free');
    const pcs = (name: string) => b.strum!.chords[name]!.filter(Boolean).map((v) => voiceMidi(v!)! % 12);
    expect(new Set(pcs('C'))).toEqual(new Set([0, 4, 7]));
    expect(new Set(pcs('G'))).toEqual(new Set([7, 11, 2]));
    expect(new Set(pcs('Am'))).toEqual(new Set([9, 0, 4]));
    expect(new Set(pcs('F'))).toEqual(new Set([5, 9, 0]));
  });
});

describe('wind instruments', () => {
  it('the flute goes down one step for every hole covered', () => {
    const b = layoutFor('flute', 660, 290, 'pentatonic');
    const n = b.holes!.length;
    let prev = Infinity;
    for (let c = 0; c <= n; c++) {
      const cov = Array.from({ length: n }, (_, i) => i < c);
      const m = voiceMidi(b.fingering!(cov))!;
      expect(m).toBeLessThan(prev);
      prev = m;
    }
  });

  it('the trumpet valves lower the note, and all three together lower it most', () => {
    const b = layoutFor('trumpet', 660, 290, 'free');
    const open = voiceMidi(b.fingering!([false, false, false]))!;
    const all = voiceMidi(b.fingering!([true, true, true]))!;
    expect(open - all).toBe(6);
    expect(open - voiceMidi(b.fingering!([false, true, false]))!).toBe(1);
  });

  it('has a big blow zone and hole zones in order along the tube', () => {
    for (const kind of ['flute', 'trumpet', 'sax'] as const) {
      const b = layoutFor(kind, 370, 620);
      expect(b.zones.some((z) => z.role === 'blow')).toBe(true);
      const holes = b.zones.filter((z) => z.role === 'hole');
      expect(holes.length).toBe(b.holes!.length);
      const ys = holes.map((z) => shapeCenter(z.shape).y);
      expect(ys).toEqual([...ys].sort((a, c) => a - c));
    }
  });
});

describe('scale helpers', () => {
  it('snaps to the nearest pentatonic note', () => {
    expect(snapPenta(60)).toBe(60);
    expect(snapPenta(61)).toBe(62);
    expect(snapPenta(65)).toBe(64);
    expect(snapPenta(71)).toBe(72);
    expect(pentaFrom(60, 6)).toEqual([60, 62, 64, 67, 69, 72]);
    expect(majorFrom(60, 8)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });
});
