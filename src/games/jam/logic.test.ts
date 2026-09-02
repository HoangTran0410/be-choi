import { describe, it, expect, vi } from 'vitest';
import { DRUMS, FX, TIMBRES } from '../../core/audio';
import { noteFreq } from '../../core/music';
import { fakeAudio } from '../../core/testing';
import {
  BASS_HOLD,
  BEATS,
  COUNT_IN_BEATS,
  KITS,
  MAX_LAYERS,
  STEPS,
  TEMPO_EMOJIS,
  TEMPO_FACTORS,
  VOICE_EMOJI,
  eventsAt,
  playPad,
  quantize,
  stepMs,
  type Kit,
  type Layer,
  type Pad,
} from './logic';

function kit(id: string): Kit {
  const found = KITS.find((k) => k.id === id);
  if (!found) throw new Error(`missing kit ${id}`);
  return found;
}

function pad(kitId: string, index: number): Pad {
  const p = kit(kitId).pads[index];
  if (!p) throw new Error(`missing pad ${kitId}[${index}]`);
  return p;
}

describe('jam logic', () => {
  it('has 4 kits of 12 pads with distinct ids, emojis per kit, labels and colours', () => {
    expect(KITS.length).toBe(4);
    expect(KITS.map((k) => k.id)).toEqual(['drums', 'notes', 'animals', 'fun']);
    expect(new Set(KITS.map((k) => k.emoji)).size).toBe(4);
    expect(new Set(KITS.map((k) => k.name)).size).toBe(4);
    for (const k of KITS) {
      expect(k.pads.length).toBe(12);
      expect(new Set(k.pads.map((p) => p.emoji)).size).toBe(12);
      for (const p of k.pads) {
        expect(p.label.length).toBeGreaterThan(0);
        expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('every pad sound is valid: drum kinds in DRUMS, fx in FX, notes parse with noteFreq', () => {
    for (const k of KITS) {
      for (const p of k.pads) {
        const s = p.sound;
        if (s.kind === 'drum') expect(DRUMS).toContain(s.drum);
        else if (s.kind === 'fx') expect(FX).toContain(s.fx);
        else expect(noteFreq(s.note)).toBeGreaterThan(0);
      }
    }
  });

  it('the drum kit covers all 11 drums plus a roll; animals are the 12 animal voices; fun mixes fx and drums', () => {
    const drums = kit('drums');
    const kinds = drums.pads.map((p) => (p.sound.kind === 'drum' ? p.sound.drum : null)).filter((k) => k !== null);
    expect(new Set(kinds)).toEqual(new Set(DRUMS));
    expect(drums.pads[11]?.sound).toEqual({ kind: 'fx', fx: 'roll' });
    expect(drums.voices).toBeUndefined();

    const animals = kit('animals');
    const fx = animals.pads.map((p) => (p.sound.kind === 'fx' ? p.sound.fx : null));
    expect(fx).toEqual(['meow', 'bark', 'quack', 'moo', 'chirp', 'roar', 'frog', 'pig', 'owl', 'elephant', 'sheep', 'cricket']);

    const fun = kit('fun');
    expect(fun.pads.filter((p) => p.sound.kind === 'fx').length).toBe(9);
    expect(fun.pads.filter((p) => p.sound.kind === 'drum').length).toBe(3);
  });

  it('the notes kit is a two-octave pentatonic scale with six cycling voices', () => {
    const notes = kit('notes');
    const names = notes.pads.map((p) => (p.sound.kind === 'note' ? p.sound.note : ''));
    expect(names).toEqual(['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6']);
    // Ascending pitch left to right.
    for (let i = 1; i < names.length; i++) expect(noteFreq(names[i] ?? '')).toBeGreaterThan(noteFreq(names[i - 1] ?? ''));
    expect(notes.voices).toEqual(['piano', 'xylo', 'bell', 'guitar', 'trumpet', 'sax']);
    for (const v of notes.voices ?? []) {
      expect(TIMBRES).toContain(v);
      expect(VOICE_EMOJI[v].length).toBeGreaterThan(0);
    }
    // Only the notes kit has voices.
    expect(KITS.filter((k) => k.voices).map((k) => k.id)).toEqual(['notes']);
  });

  it('has 3 beats with 16 steps, positive bpm, valid drum kinds and bass notes', () => {
    expect(BEATS.length).toBe(3);
    expect(BEATS.map((b) => b.emoji)).toEqual(['😊', '🕺', '🌙']);
    expect(BEATS.map((b) => b.bpm)).toEqual([110, 128, 88]);
    expect(new Set(BEATS.map((b) => b.id)).size).toBe(3);
    for (const b of BEATS) {
      expect(b.bpm).toBeGreaterThan(0);
      expect(b.steps.length).toBe(STEPS);
      expect(b.bass.length).toBe(STEPS);
      expect(b.steps.some((s) => s !== null)).toBe(true);
      expect(b.bass.some((n) => n !== null)).toBe(true);
      for (const s of b.steps) if (s) for (const k of s) expect(DRUMS).toContain(k);
      for (const n of b.bass) if (n) expect(noteFreq(n)).toBeGreaterThan(0);
    }
    // 😊: kick on 1 and 3, snare on 2 and 4, hats on the eighths, bass on every quarter.
    const vui = BEATS[0]!;
    expect(vui.steps[0]).toContain('kick');
    expect(vui.steps[8]).toContain('kick');
    expect(vui.steps[4]).toContain('snare');
    expect(vui.steps[12]).toContain('snare');
    for (let s = 0; s < STEPS; s += 2) expect(vui.steps[s]).toContain('hat');
    for (let s = 1; s < STEPS; s += 2) expect(vui.steps[s]).toBeNull();
    expect([vui.bass[0], vui.bass[4], vui.bass[8], vui.bass[12]]).toEqual(['C3', 'G2', 'A2', 'F2']);
    // 🕺: four on the floor with claps on 2 and 4.
    const nhay = BEATS[1]!;
    for (const s of [0, 4, 8, 12]) expect(nhay.steps[s]).toContain('kick');
    expect(nhay.steps[4]).toContain('clap');
    expect(nhay.steps[12]).toContain('clap');
    // 🌙: sparse and soft, no kick or snare.
    const ru = BEATS[2]!;
    for (const s of ru.steps) if (s) for (const k of s) expect(['kick', 'snare']).not.toContain(k);
    expect(ru.bass.filter((n) => n !== null).length).toBeLessThanOrEqual(4);
  });

  it('exposes the sequencer constants', () => {
    expect(STEPS).toBe(16);
    expect(MAX_LAYERS).toBe(4);
    expect(COUNT_IN_BEATS).toBe(4);
    expect(BASS_HOLD).toBeGreaterThan(0);
    expect(TEMPO_FACTORS).toEqual([0.75, 1, 1.25]);
    expect(TEMPO_EMOJIS).toEqual(['🐢', '🙂', '🐇']);
    expect(TEMPO_EMOJIS.length).toBe(TEMPO_FACTORS.length);
  });

  it('quantize snaps to the nearest step and wraps past the bar', () => {
    const ms = stepMs(120);
    expect(quantize(0, ms)).toBe(0);
    expect(quantize(1.4 * ms, ms)).toBe(1);
    expect(quantize(1.6 * ms, ms)).toBe(2);
    expect(quantize(7 * ms, ms)).toBe(7);
    expect(quantize(15.4 * ms, ms)).toBe(15);
    expect(quantize(15.6 * ms, ms)).toBe(0);
    expect(quantize(16 * ms, ms)).toBe(0);
    expect(quantize(17 * ms, ms)).toBe(1);
    expect(quantize(-1 * ms, ms)).toBe(15);
    // Degenerate inputs never produce NaN.
    expect(quantize(100, 0)).toBe(0);
    expect(quantize(Number.NaN, ms)).toBe(0);
  });

  it('stepMs is a sixteenth note scaled by the tempo factor', () => {
    expect(stepMs(120)).toBe(125);
    expect(stepMs(60)).toBe(250);
    expect(stepMs(120, 1)).toBe(125);
    expect(stepMs(120, 0.5)).toBe(250);
    expect(stepMs(120, 1.25)).toBe(100);
    expect(stepMs(110, 0.75)).toBeCloseTo(60000 / 82.5 / 4, 6);
  });

  it('eventsAt returns unmuted events on the step, in layer order, and wraps the step', () => {
    const kick = pad('drums', 0);
    const meow = pad('animals', 0);
    const c4 = pad('notes', 0);
    const layers: Layer[] = [
      { id: 1, kit: 'drums', events: [{ step: 0, pad: kick }, { step: 8, pad: kick }], muted: false },
      { id: 2, kit: 'animals', events: [{ step: 0, pad: meow }], muted: true },
      { id: 3, kit: 'notes', events: [{ step: 8, pad: c4, voice: 'xylo' }], muted: false },
    ];
    expect(eventsAt([], 0)).toEqual([]);
    expect(eventsAt(layers, 0).map((e) => e.pad)).toEqual([kick]);
    expect(eventsAt(layers, 8).map((e) => e.pad)).toEqual([kick, c4]);
    expect(eventsAt(layers, 8)[1]?.voice).toBe('xylo');
    expect(eventsAt(layers, 1)).toEqual([]);
    expect(eventsAt(layers, 16).map((e) => e.pad)).toEqual([kick]);
    expect(eventsAt(layers, -8).map((e) => e.pad)).toEqual([kick, c4]);
    // Unmuting brings the layer back.
    layers[1]!.muted = false;
    expect(eventsAt(layers, 0).map((e) => e.pad)).toEqual([kick, meow]);
  });

  it('playPad dispatches drums, effects and notes to the right audio method', () => {
    const audio = fakeAudio();
    const drum = vi.spyOn(audio, 'drum');
    const fx = vi.spyOn(audio, 'fx');
    const note = vi.spyOn(audio, 'note');

    playPad(audio, pad('drums', 0), 'piano');
    expect(drum).toHaveBeenCalledWith('kick');
    expect(fx).not.toHaveBeenCalled();
    expect(note).not.toHaveBeenCalled();

    playPad(audio, pad('animals', 0), 'piano');
    expect(fx).toHaveBeenCalledWith('meow');
    playPad(audio, pad('drums', 11), 'piano');
    expect(fx).toHaveBeenCalledWith('roll');

    playPad(audio, pad('notes', 0), 'piano');
    expect(note).toHaveBeenCalledWith(noteFreq('C4'), 0.5, 'piano');
    playPad(audio, pad('notes', 5), 'xylo', 0.25);
    expect(note).toHaveBeenCalledWith(noteFreq('C5'), 0.25, 'xylo');
    expect(drum).toHaveBeenCalledTimes(1);
    expect(fx).toHaveBeenCalledTimes(2);
    expect(note).toHaveBeenCalledTimes(2);

    // A note that does not parse stays silent rather than playing 0 Hz.
    const bad: Pad = { emoji: '❓', label: 'x', color: '#000000', sound: { kind: 'note', note: 'H9' } };
    playPad(audio, bad, 'piano');
    expect(note).toHaveBeenCalledTimes(2);
  });
});
