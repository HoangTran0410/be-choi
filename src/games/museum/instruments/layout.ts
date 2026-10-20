import { DRUMS, TIMBRES } from '../../../core/audio';
import { INSTRUMENT_IDS } from '../../../core/instruments';
import { layoutBars, layoutChimes, layoutTines } from './bars';
import { layoutDjembe, layoutKit, layoutRack } from './drums';
import { layoutKeyboard } from './keyboard';
import { layoutGong, layoutPan } from './pans';
import { layoutShake } from './shake';
import { layoutFret, layoutHarp, layoutViolin } from './strings';
import type { Board, Family, Harmony, InstrumentKind } from './types';
import { layoutAccordion, layoutHarmonica, layoutPanflute, layoutTube } from './wind';

/** Every kind there is a simulation for: all 9 timbres, all 11 drums and all the world instruments. */
export const ALL_KINDS: readonly InstrumentKind[] = [...TIMBRES, ...DRUMS, ...INSTRUMENT_IDS];

const KIT_PIECES: ReadonlySet<string> = new Set(['kick', 'snare', 'hat', 'tom', 'crash', 'ride']);

/** Which simulation plays a kind. */
export function familyOf(kind: InstrumentKind): Family {
  switch (kind) {
    case 'piano':
    case 'organ':
      return 'keyboard';
    case 'xylo':
    case 'bell':
    case 'marimba':
    case 'vibraphone':
      return 'bars';
    case 'kalimba':
      return 'tines';
    case 'chimes':
      return 'chimes';
    case 'guitar':
    case 'ukulele':
    case 'banjo':
    case 'bass':
      return 'fret';
    case 'harp':
      return 'harp';
    case 'violin':
      return 'bow';
    case 'flute':
    case 'trumpet':
    case 'sax':
      return 'tube';
    case 'harmonica':
      return 'harmonica';
    case 'panflute':
      return 'panflute';
    case 'accordion':
      return 'accordion';
    case 'djembe':
      return 'djembe';
    case 'steelpan':
    case 'handpan':
      return 'pan';
    case 'gong':
      return 'gong';
    case 'maracas':
    case 'tambourine':
    case 'castanets':
      return 'shake';
    default:
      return KIT_PIECES.has(kind) ? 'kit' : 'rack';
  }
}

/**
 * Build the board for `kind` filling a `w` × `h` box. Pure: no DOM, no audio — this
 * is what the tests read to check which zone sounds which note.
 */
export function layoutFor(kind: InstrumentKind, w: number, h: number, harmony: Harmony = 'free'): Board {
  switch (kind) {
    case 'piano':
    case 'organ':
      return layoutKeyboard(kind, w, h, harmony);
    case 'xylo':
    case 'bell':
    case 'marimba':
    case 'vibraphone':
      return layoutBars(kind, w, h, harmony);
    case 'kalimba':
      return layoutTines(w, h, harmony);
    case 'chimes':
      return layoutChimes(w, h, harmony);
    case 'guitar':
    case 'ukulele':
    case 'banjo':
    case 'bass':
      return layoutFret(kind, w, h, harmony);
    case 'harp':
      return layoutHarp(w, h, harmony);
    case 'violin':
      return layoutViolin(w, h, harmony);
    case 'flute':
    case 'trumpet':
    case 'sax':
      return layoutTube(kind, w, h, harmony);
    case 'harmonica':
      return layoutHarmonica(w, h, harmony);
    case 'panflute':
      return layoutPanflute(w, h, harmony);
    case 'accordion':
      return layoutAccordion(w, h, harmony);
    case 'djembe':
      return layoutDjembe(w, h, harmony);
    case 'steelpan':
    case 'handpan':
      return layoutPan(kind, w, h, harmony);
    case 'gong':
      return layoutGong(w, h, harmony);
    case 'maracas':
    case 'tambourine':
    case 'castanets':
      return layoutShake(kind, w, h, harmony);
    default:
      return KIT_PIECES.has(kind) ? layoutKit(kind as never, w, h, harmony) : layoutRack(kind as never, w, h, harmony);
  }
}
