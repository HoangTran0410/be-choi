/**
 * The parts of the newer robots, and the rebuilt parts of the sparkle and shake instruments (bell,
 * shaker, cowbell, triangle) that used to repeat two or three notes. Written as short recipes for
 * the builders in compose.ts; see there for how a recipe becomes a pattern.
 */
import { arp, comp, lead, notes, perc, type CompEv, type Ev } from './compose';
import type { DrumStyle } from './groove';
import type { RobotPatterns } from './patterns';

type Table = Record<DrumStyle, readonly CompEv[]>;

// ---------------------------------------------------------------------------------------------
// Sparkle and shake: rebuilt
// ---------------------------------------------------------------------------------------------

/** Chuông: a bright tune high above the band, with a run into every new lap. */
const bell = lead({ lo: 70, hi: 91, center: 79, seed: 23, maxD: 2 });

/** Lục lạc: down-strokes on the shaker, up-strokes on the hat; tuned shakes where a world instrument plays. */
const shaker = perc({
  kinds: { A: 'X', a: 'X', g: 'X', u: 'H' },
  tune: { A: [0, 0], a: [2, 0], g: [1, 0], u: [1, 1] },
  body: {
    pop: 'Aua.Aua.Aua.Aua.',
    disco: 'g.A.g.A.g.A.g.A.',
    soft: 'A.a.u.a.A.a.u.a.',
    latin: 'A.ua.uA.A.ua.uA.',
    east: 'A...a...A...a.u.',
  },
  dense: 'odd',
});

/** Chuông bò: the bell, the wood block and the clap talk to each other. */
const cowbell = perc({
  kinds: { A: 'B', a: 'W', g: 'B', u: 'P', o: 'A' },
  tune: { A: [0, 0], a: [2, 0], g: [1, 0], u: [1, 0] },
  body: {
    pop: 'A..a.uA.A..a.uA.',
    disco: 'A..g.u..A..g.u.g',
    soft: 'A.....g.A..g....',
    latin: 'A..a..A.a..A.a.a',
    east: 'A.....a.A..u....',
  },
  dense: 'quarter',
});

/** Kẻng tam giác: a ring, a little ring, a ride shimmer; tuned chimes in the eastern song. */
const triangle = perc({
  kinds: { A: 'A', a: 'A', g: 'A', u: 'R', o: 'A' },
  tune: { A: [0, 0], a: [2, 0], g: [1, 0], u: [1, 0] },
  body: {
    pop: 'A...a...A...a.g.',
    disco: '..A.....g.A...a.',
    soft: 'A.......a.......',
    latin: 'A..g..a.A..g..u.',
    east: 'A.......A...g...',
  },
  dense: 'quarter',
  tail: 'gaAu',
});

// ---------------------------------------------------------------------------------------------
// New percussion
// ---------------------------------------------------------------------------------------------

const conga = perc({
  kinds: { A: 'M', a: 'M', g: 'M', u: 'M' },
  tune: { A: [0, 0], a: [2, 0], g: [1, 1], u: [0, 1] },
  body: {
    pop: '..uaA.g...uaA.g.',
    disco: 'g.uaA.g.g.uaA.gu',
    soft: '....A..g....a.u.',
    latin: '..uaA..g.uaA..g.',
    east: '....A.....u.a.g.',
  },
  dense: 'quarter',
});

const bongo = perc({
  kinds: { A: 'M', a: 'M', g: 'M', u: 'M' },
  tune: { A: [2, 1], a: [0, 1], g: [1, 1], u: [1, 0] },
  body: {
    pop: 'A.gaA.gaA.gaA.gu',
    disco: 'g.A.g.A.g.A.g.Au',
    soft: 'A...g.a.A...g.u.',
    latin: 'Aga.gaA.Aga.gaAu',
    east: 'A..g..a.A.....u.',
  },
  dense: 'quarter',
});

const timpani = perc({
  kinds: { A: 'M', a: 'M', g: 'M', u: 'M' },
  tune: { A: [0, -1], a: [2, -1], g: [0, 0], u: [2, 0] },
  body: {
    pop: 'A.......a.......',
    disco: 'A.......A...a...',
    soft: 'A...............',
    latin: 'A.....a.A.....u.',
    east: 'A.......a.......',
  },
  dense: 'quarter',
  tail: 'gagA',
});

const tambourine = perc({
  kinds: { A: 'X', a: 'X', g: 'X', u: 'H', o: 'P' },
  tune: { A: [0, 0], a: [2, 0], g: [1, 0], u: [1, 0] },
  body: {
    pop: '.u.A.u.a.u.A.u.a',
    disco: 'g.A.g.A.g.A.g.A.',
    soft: '..A...u...A...u.',
    latin: 'A.ua..A.A.ua..a.',
    east: 'A...u...A...u.a.',
  },
  dense: 'quarter',
});

const maracas = perc({
  kinds: { A: 'X', a: 'X', g: 'X', u: 'H' },
  tune: { A: [0, 0], a: [1, 0], g: [2, 0], u: [0, 1] },
  body: {
    pop: 'Ag.gAgu.Ag.gAgu.',
    disco: 'gA.ugAgu.A.ugAgu',
    soft: 'A.g.a.g.A.g.a.g.',
    latin: 'Ag.gaguAg.guagu.',
    east: 'A..g..a.A..g..a.',
  },
  dense: 'even',
  tail: 'agaA',
});

const castanets = perc({
  kinds: { A: 'W', a: 'W', g: 'W', u: 'W' },
  tune: { A: [0, 0], a: [1, 0], g: [2, 0], u: [2, 0] },
  body: {
    pop: 'A..a..A...A.A...',
    disco: 'A.g.A.g.A.g.A.g.',
    soft: 'A.......a...g...',
    latin: 'A..a..A...A.a...',
    east: 'A...a.g.A.....a.',
  },
  dense: 'even',
});

const mo = perc({
  kinds: { A: 'W', a: 'W', g: 'W', u: 'P' },
  body: {
    pop: 'A.g.a.g.A.g.a.u.',
    disco: 'A.u.a.u.A.u.a.u.',
    soft: 'A...g...a...u...',
    latin: 'A.ga.gA.a.ua.g..',
    east: 'A.....g.a...u...',
  },
  dense: 'quarter',
});

const beatbox = perc({
  kinds: { A: 'K', a: 'S', g: 'H', u: 'P', o: 'W' },
  body: {
    pop: 'A.g.a.g.Ag..a.gu',
    disco: 'A.g.a.g.A.g.a.gu',
    soft: 'A...g...a...g.u.',
    latin: 'A..g..a.A.g.a..u',
    east: 'A...g...a...g.u.',
  },
  dense: 'quarter',
  tail: 'guaS',
});

// ---------------------------------------------------------------------------------------------
// Tuned mallets and arpeggios
// ---------------------------------------------------------------------------------------------

const marimba = lead({ lo: 52, hi: 79, center: 62, seed: 3, maxD: 4 });
const steelpan = lead({ lo: 58, hi: 86, center: 69, seed: 5, maxD: 3 });
const trung = lead({ lo: 55, hi: 84, center: 64, seed: 11, maxD: 3 });
const kalimba = arp({ lo: 64, hi: 91, center: 72, seed: 1, shapes: ['updown', 'up', 'skip', 'updown'], maxD: 3 });
const vibraphone = arp({ lo: 55, hi: 84, center: 62, seed: 2, shapes: ['up', 'skip', 'updown', 'down'], maxD: 6 });
const handpan = arp({ lo: 48, hi: 72, center: 55, seed: 3, shapes: ['updown', 'skip', 'up', 'updown'], maxD: 4 });
const chime = arp({ lo: 72, hi: 91, center: 79, seed: 1, shapes: ['down', 'down', 'skip', 'down'], maxD: 2, vel: -1 });
const harp = arp({ lo: 48, hi: 84, center: 55, seed: 0, shapes: ['up', 'updown', 'up', 'skip'], maxD: 8 });
const tranh = arp({ lo: 55, hi: 90, center: 72, seed: 2, shapes: ['down', 'updown', 'down', 'skip'], maxD: 3, vel: 1 });

// ---------------------------------------------------------------------------------------------
// Winds and bowed
// ---------------------------------------------------------------------------------------------

const harmonica = lead({ lo: 60, hi: 84, center: 67, seed: 7 });
const panpipe = lead({ lo: 64, hi: 88, center: 72, seed: 13, maxD: 5 });
const cello = lead({ lo: 45, hi: 70, center: 55, seed: 19, maxD: 8, slow: true });

// ---------------------------------------------------------------------------------------------
// Chords, rolls and oompah
// ---------------------------------------------------------------------------------------------

const ukulele: Table = {
  pop: [[0, 'w', 2, 8], [3, 'v2', 1, 4], [4, 'w', 2, 6], [6, 'v1', 1, 4], [8, 'w', 2, 7], [11, 'v2', 1, 4], [12, 'w', 2, 6], [14, 'v1', 1, 5]],
  disco: [[2, 'w', 1, 8], [3, 'v2', 1, 3], [6, 'w', 1, 8], [10, 'w', 1, 8], [11, 'v2', 1, 3], [14, 'w', 1, 8]],
  soft: [[0, 'w', 4, 6], [4, 'v1', 2, 4], [6, 'v2', 2, 4], [8, 'w', 4, 5], [12, 'v1', 2, 4], [14, 'v2', 2, 4]],
  latin: [[0, 'w', 2, 8], [3, 'w', 2, 6], [6, 'v2', 1, 5], [8, 'w', 2, 7], [11, 'w', 2, 6], [14, 'v2', 1, 5]],
  east: [[0, 'v0', 2, 6], [2, 'v1', 2, 4], [4, 'v2', 2, 5], [6, 'v1', 2, 4], [8, 'v0', 2, 6], [10, 'v1', 2, 4], [12, 'v2', 2, 5], [14, 'v1', 2, 4]],
};

const banjo: Table = {
  pop: [[0, 'w', 2, 8], [2, 'v2', 1, 5], [3, 'v1', 1, 4], [4, 'v2', 1, 6], [6, 'v0', 1, 5], [7, 'v1', 1, 4], [8, 'w', 2, 7], [10, 'v2', 1, 5], [11, 'v1', 1, 4], [12, 'v2', 1, 6], [14, 'v0', 1, 5], [15, 'v1', 1, 4]],
  disco: [[0, 'v0', 2, 7], [2, 'v2', 1, 6], [4, 'v1', 2, 5], [6, 'v2', 1, 6], [8, 'v0', 2, 7], [10, 'v2', 1, 6], [12, 'v1', 2, 5], [14, 'v2', 1, 6]],
  soft: [[0, 'v0', 3, 6], [3, 'v1', 1, 4], [4, 'v2', 3, 5], [7, 'v1', 1, 4], [8, 'v0', 3, 6], [11, 'v1', 1, 4], [12, 'v2', 3, 5], [15, 'v1', 1, 4]],
  latin: [[0, 'v0', 2, 8], [3, 'v2', 1, 5], [6, 'v1', 1, 6], [8, 'v0', 2, 7], [11, 'v2', 1, 5], [14, 'v1', 1, 6]],
  east: [[0, 'v0', 3, 6], [3, 'v1', 1, 4], [6, 'v2', 2, 5], [8, 'v1', 3, 6], [11, 'v0', 1, 4], [14, 'v2', 2, 5]],
};

const accordion: Table = {
  pop: [[0, 'b0', 3, 8], [4, 'w', 3, 6], [8, 'b1', 3, 7], [12, 'w', 3, 6]],
  disco: [[0, 'b0', 2, 8], [2, 'w', 1, 5], [4, 'b1', 2, 7], [8, 'b0', 2, 8], [10, 'w', 1, 5], [12, 'b1', 2, 7]],
  soft: [[0, 'b0', 6, 7], [6, 'w', 2, 4], [8, 'b1', 6, 6], [14, 'w', 2, 4]],
  latin: [[0, 'b0', 3, 8], [3, 'w', 2, 5], [6, 'b1', 2, 6], [8, 'b0', 3, 7], [11, 'w', 2, 5], [14, 'b1', 2, 6]],
  east: [[0, 'b0', 6, 6], [8, 'w', 6, 5], [12, 'b1', 3, 5]],
};

const organ: Table = {
  pop: [[0, 'y', 6, 6], [6, 'w', 2, 7], [8, 'y', 6, 5], [14, 'w', 2, 7]],
  disco: [[0, 'y', 2, 6], [2, 'w', 1, 8], [6, 'w', 1, 8], [10, 'w', 1, 8], [14, 'w', 1, 8]],
  soft: [[0, 'y', 8, 5], [8, 'y', 4, 4], [12, 'j3', 4, 4]],
  latin: [[0, 'y', 3, 6], [3, 'w', 3, 6], [8, 'y', 3, 6], [11, 'w', 3, 6]],
  east: [[0, 'y', 8, 5], [8, 'j2', 4, 4], [12, 'j3', 4, 5]],
};

const tuba: Table = {
  pop: [[0, 'b0', 3, 8], [4, 'b1', 3, 6], [8, 'b0', 3, 7], [12, 'b1', 3, 6]],
  disco: [[0, 'b0', 2, 8], [2, 'b2', 1, 5], [4, 'b1', 2, 7], [6, 'b2', 1, 5], [8, 'b0', 2, 8], [10, 'b2', 1, 5], [12, 'b1', 2, 7], [14, 'b2', 1, 5]],
  soft: [[0, 'b0', 4, 7], [4, 'b1', 2, 5], [8, 'b0', 4, 6], [12, 'b3', 2, 5]],
  latin: [[0, 'b0', 3, 8], [6, 'b1', 2, 6], [8, 'b0', 3, 7], [14, 'b1', 2, 6]],
  east: [[0, 'b0', 8, 6], [8, 'b1', 4, 5], [12, 'b0', 3, 4]],
};

// ---------------------------------------------------------------------------------------------
// The gong: a few huge, slow notes
// ---------------------------------------------------------------------------------------------

const g = (s: number, d: number, v: number, o: number): Ev => ({ s, d, v, o });
const SHIFT: Record<DrumStyle, [number, number]> = { pop: [0, 0], disco: [2, 0], soft: [0, -1], latin: [3, 0], east: [0, 1] };

function gongTable(): Record<DrumStyle, [Ev[][], Ev[][], Ev[][]]> {
  const make = (style: DrumStyle): [Ev[][], Ev[][], Ev[][]] => {
    const [sh, dv] = SHIFT[style];
    const m = (e: Ev): Ev => ({ ...e, s: Math.min(15, e.s + sh), v: e.v + dv });
    const bars = (b: Ev[][]): Ev[][] => b.map((x) => x.map(m));
    return [
      bars([[g(0, 12, 7, 0)], [g(0, 12, 6, 1)], [g(0, 12, 7, 0)], [g(0, 12, 8, 2)]]),
      bars([[g(0, 12, 8, 0)], [g(0, 6, 6, 1), g(8, 8, 6, 2)], [g(0, 12, 7, 0)], [g(0, 8, 8, 0), g(8, 8, 6, 2)]]),
      bars([
        [g(0, 8, 8, 0), g(8, 4, 5, 2)],
        [g(0, 4, 6, 1), g(6, 4, 5, 2), g(10, 6, 6, 1)],
        [g(0, 8, 8, 0), g(8, 4, 5, 2)],
        [g(0, 4, 8, 0), g(4, 4, 6, 1), g(8, 4, 7, 2), g(12, 4, 9, 3)],
      ]),
    ];
  };
  return { pop: make('pop'), disco: make('disco'), soft: make('soft'), latin: make('latin'), east: make('east') };
}

const gong = notes({ lo: 43, hi: 62, center: 48 }, gongTable());

export const NEW_PATTERNS: Record<string, RobotPatterns> = {
  // rebuilt
  bell,
  shaker,
  cowbell,
  triangle,
  // tuned mallets
  marimba,
  kalimba,
  vibraphone,
  steelpan,
  handpan,
  chime,
  trung,
  // strings
  harp,
  tranh,
  ukulele: comp(ukulele),
  banjo: comp(banjo),
  cello,
  // winds, keys, bass
  harmonica,
  accordion: comp(accordion),
  organ: comp(organ),
  panpipe,
  tuba: comp(tuba, { tail: [[10, 'b1', 2, 6], [12, 'b3', 2, 7], [14, 'b4', 2, 9]], ghostWhat: 'b2' }),
  // percussion
  conga,
  bongo,
  tambourine,
  maracas,
  castanets,
  mo,
  beatbox,
  timpani,
  gong,
};
