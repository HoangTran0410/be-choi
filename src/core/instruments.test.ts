import { describe, expect, it } from 'vitest';
import { describe as measure, INSTRUMENT_IDS, INSTRUMENT_REF, renderInstrument, type InstrumentId } from './instruments';

const SR = 44100;
const make = (id: InstrumentId, f = INSTRUMENT_REF[id], v = 1) => renderInstrument(id, f, v, SR);

describe('world instrument synthesis', () => {
  it('makes finite, audible, un-clipped sound for every instrument', () => {
    for (const id of INSTRUMENT_IDS) {
      const x = make(id);
      expect(x.every(Number.isFinite), id).toBe(true);
      const m = measure(x, SR);
      expect(m.peak, id).toBeGreaterThan(0.1);
      expect(m.peak, id).toBeLessThanOrEqual(0.65);
      expect(m.rms, id).toBeGreaterThan(0.005);
      // the last few milliseconds are faded: no click at the end
      expect(Math.abs(x[x.length - 1]!), id).toBeLessThan(0.01);
    }
  });

  it('is repeatable for the same seed and different for another', () => {
    const a = renderInstrument('maracas', 440, 1, SR, { seed: 3 });
    const b = renderInstrument('maracas', 440, 1, SR, { seed: 3 });
    const c = renderInstrument('maracas', 440, 1, SR, { seed: 4 });
    expect(Array.from(a.slice(0, 500))).toEqual(Array.from(b.slice(0, 500)));
    expect(Array.from(a.slice(0, 500))).not.toEqual(Array.from(c.slice(0, 500)));
  });

  it('rings for very different lengths: a gong outlasts a kalimba, a kalimba a castanet', () => {
    const t60 = (id: InstrumentId) => measure(make(id), SR).t60;
    expect(t60('gong')).toBeGreaterThan(1.5);
    expect(t60('vibraphone')).toBeGreaterThan(t60('marimba'));
    expect(t60('handpan')).toBeGreaterThan(t60('steelpan'));
    expect(t60('kalimba')).toBeGreaterThan(t60('castanets'));
    expect(t60('castanets')).toBeLessThan(0.15);
    expect(t60('banjo')).toBeLessThan(t60('harp'));
  });

  it('sounds different from each other: the pitched instruments differ in tone at the same pitch', () => {
    const ids = INSTRUMENT_IDS.filter((i) => !['maracas', 'tambourine', 'castanets', 'djembe', 'gong'].includes(i));
    const feat = ids.map((id) => {
      const m = measure(make(id, 392), SR);
      return { id, v: [Math.log(m.centroid), Math.log(m.t60 + 0.05), Math.log(m.rms)] };
    });
    // no two instruments are close in (brightness, ring time, density)
    for (let i = 0; i < feat.length; i++) {
      for (let j = i + 1; j < feat.length; j++) {
        const d = Math.hypot(...feat[i]!.v.map((x, k) => x - feat[j]!.v[k]!));
        expect(d, `${feat[i]!.id} vs ${feat[j]!.id}`).toBeGreaterThan(0.1);
      }
    }
  });

  it('plays a harder touch louder and brighter', () => {
    for (const id of ['marimba', 'harp', 'steelpan', 'organ'] as InstrumentId[]) {
      const soft = measure(make(id, INSTRUMENT_REF[id], 0.3), SR);
      const hard = measure(make(id, INSTRUMENT_REF[id], 1), SR);
      expect(hard.rms, id).toBeGreaterThan(soft.rms);
    }
  });

  it('follows the pitch asked for', () => {
    const lo = measure(make('marimba', 220), SR).centroid;
    const hi = measure(make('marimba', 880), SR).centroid;
    expect(hi).toBeGreaterThan(lo * 2);
  });

  it('holds the sustained instruments as long as asked', () => {
    for (const id of ['organ', 'accordion', 'harmonica', 'panflute'] as InstrumentId[]) {
      const short = renderInstrument(id, 392, 1, SR, { dur: 0.3 });
      const long = renderInstrument(id, 392, 1, SR, { dur: 1.5 });
      expect(long.length, id).toBeGreaterThan(short.length + SR);
    }
  });

  it('survives silly input', () => {
    for (const id of INSTRUMENT_IDS) {
      expect(renderInstrument(id, NaN, NaN, SR).every(Number.isFinite)).toBe(true);
      expect(renderInstrument(id, -5, 7, SR).every(Number.isFinite)).toBe(true);
      expect(renderInstrument(id, 1e6, 0, SR).every(Number.isFinite)).toBe(true);
    }
  });
});
