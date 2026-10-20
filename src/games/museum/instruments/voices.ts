import type { AudioEngine, DrumKind, InstrumentId, InstVoice, Timbre } from '../../../core/audio';
import { midiFreq } from './scale';
import type { Voice } from './types';

export const note = (timbre: Timbre, midi: number, dur = 0.9): Voice => ({ t: 'note', timbre, freq: midiFreq(midi), dur });
export const inst = (id: InstrumentId, midi: number, dur?: number): Voice => ({ t: 'inst', id, freq: midiFreq(midi), dur });
export const instHz = (id: InstrumentId, freq: number, dur?: number): Voice => ({ t: 'inst', id, freq, dur });
export const drum = (d: DrumKind): Voice => ({ t: 'drum', drum: d });

/** Instruments whose `freq` picks a tone colour or a spot on the skin, not a musical note. */
const UNPITCHED: ReadonlySet<string> = new Set(['djembe', 'gong', 'maracas', 'tambourine', 'castanets']);

/** MIDI note of a pitched voice, or null for a drum. */
export function voiceMidi(v: Voice): number | null {
  if (v.t === 'drum') return null;
  if (v.t === 'inst' && UNPITCHED.has(v.id)) return null;
  return Math.round(69 + 12 * Math.log2(v.freq / 440));
}

/** Rainbow used by toy bars and keys. */
export const RAINBOW = ['#ef4444', '#f97316', '#facc15', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7'];

/** Play a voice on the audio engine. Only world instruments hear `vel`; the older synth notes have a fixed level. */
export function sound(audio: AudioEngine, v: Voice, vel = 0.8): InstVoice | null {
  if (v.t === 'note') audio.note(v.freq, v.dur, v.timbre);
  else if (v.t === 'drum') audio.drum(v.drum);
  else return audio.inst(v.id, v.freq, vel, v.dur);
  return null;
}
