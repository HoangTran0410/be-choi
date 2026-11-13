import { describe, it, expect, vi } from 'vitest';
import { fakeAudio } from '../../core/testing';
import { DEGREES, INSTRUMENTS, instOf, nextStep, padFreq, phraseMs, playPad, sampleKeysOf, SHOW_INSTRUMENTS, showInst, timeline } from './logic';
import { instrumentSvg } from './art';
import { showSvg } from './artExtra';
import { POSES, armPath, toPerformer } from './arms';
import { SAMPLE_SETS } from '../../core/samplesManifest';

describe('show logic', () => {
  it('has 8 distinct instruments with a phrase on the five pads', () => {
    expect(INSTRUMENTS.length).toBe(8);
    expect(new Set(INSTRUMENTS.map((i) => i.id)).size).toBe(8);
    expect(new Set(INSTRUMENTS.map((i) => i.name)).size).toBe(8);
    for (const i of INSTRUMENTS) {
      expect(i.phrase.length).toBeGreaterThanOrEqual(8);
      for (const n of i.phrase) {
        expect(n.p).toBeGreaterThanOrEqual(0);
        expect(n.p).toBeLessThan(DEGREES.length);
        expect(n.d).toBeGreaterThan(0);
      }
      const ms = phraseMs(i);
      expect(ms).toBeGreaterThan(2500);
      expect(ms).toBeLessThan(9000);
    }
  });
  it('the shelf has about twenty instruments, each with a phrase, a pose and real recordings', () => {
    expect(SHOW_INSTRUMENTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(SHOW_INSTRUMENTS.map((i) => i.id)).size).toBe(SHOW_INSTRUMENTS.length);
    expect(new Set(SHOW_INSTRUMENTS.map((i) => i.name)).size).toBe(SHOW_INSTRUMENTS.length);
    for (const i of SHOW_INSTRUMENTS) {
      expect(showInst(i.id)).toBe(i);
      expect(POSES[i.id], i.id).toBeTruthy();
      expect(i.phrase.length).toBeGreaterThanOrEqual(8);
      const ms = phraseMs(i);
      expect(ms).toBeGreaterThan(2500);
      expect(ms).toBeLessThan(9500);
      for (const key of sampleKeysOf(i)) expect(SAMPLE_SETS[key], `${i.id}: ${key}`).toBeTruthy();
      expect(showSvg(i.id, 'zz').startsWith('<svg')).toBe(true);
    }
  });
  it('lists the recording sets an instrument plays from', () => {
    expect(sampleKeysOf(instOf('violin'))).toEqual(['note:violin']);
    expect(sampleKeysOf(instOf('harp'))).toEqual(['inst:harp']);
    expect(sampleKeysOf(instOf('drum'))).toEqual(['drum:kick', 'drum:tom', 'drum:snare', 'drum:wood', 'drum:hat']);
  });
  it('arms: a hand lands where the pose says, however the instrument is placed', () => {
    expect(toPerformer({ l: [0, 0], r: [0, 0], tap: 'l' }, [120, 120])).toEqual([120, 160.8]);
    const moved = { s: 0.5, at: [66, 24] as const, to: [112, 84] as const, l: [0, 0] as const, r: [0, 0] as const, tap: 'l' as const };
    expect(toPerformer(moved, [66, 24])).toEqual([112, 84]);
    expect(armPath('l', [60, 200]).startsWith('M80 128 Q')).toBe(true);
    expect(armPath('r', [180, 200]).startsWith('M160 128 Q')).toBe(true);
  });
  it('times a phrase by tempo', () => {
    const t = timeline([{ p: 0, d: 1 }, { p: 1, d: 0.5 }, { p: 2, d: 2 }], 120);
    expect(t.map((x) => x.atMs)).toEqual([0, 500, 750]);
    expect(t.map((x) => x.durMs)).toEqual([500, 250, 1000]);
  });
  it('pad frequencies rise with the pad and with the octave, and wrap safely', () => {
    const piano = instOf('piano');
    const f = [0, 1, 2, 3, 4].map((i) => padFreq(piano, i));
    expect([...f].sort((a, b) => a - b)).toEqual(f);
    expect(padFreq(instOf('flute'), 0)).toBeCloseTo(f[0]! * 2, 1);
    expect(padFreq(piano, 5)).toBe(f[0]);
    expect(padFreq(piano, -1)).toBe(f[4]);
  });
  it('steps the follow-along guide and wraps', () => {
    expect(nextStep(0, 3)).toBe(1);
    expect(nextStep(2, 3)).toBe(0);
    expect(nextStep(0, 0)).toBe(0);
  });
  it('plays notes, drums and world instruments through the right audio call', () => {
    const a = fakeAudio();
    const note = vi.spyOn(a, 'note');
    const drum = vi.spyOn(a, 'drum');
    const inst = vi.spyOn(a, 'inst');
    playPad(a, instOf('violin'), 2, { delay: 0.5 });
    expect(note).toHaveBeenCalledWith(padFreq(instOf('violin'), 2), 0.9, 'violin', 0.5, 0.9);
    playPad(a, instOf('drum'), 1);
    expect(drum).toHaveBeenCalledWith('tom', 0, 0.9);
    playPad(a, instOf('harp'), 0);
    expect(inst).toHaveBeenCalledTimes(1);
  });
  it('draws every instrument as SVG with its own gradient ids', () => {
    for (const i of INSTRUMENTS) {
      const svg = instrumentSvg(i.id, 'zz');
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('id="zzwood"');
      expect(svg.length).toBeGreaterThan(900);
    }
  });
});
