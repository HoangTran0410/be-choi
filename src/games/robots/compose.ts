/**
 * Builders for the robots' parts. A part is written as a short recipe (a rhythm, a register, a seed)
 * and turned into the pattern language of `parseBars`, one four-bar string for each of the three
 * levels and each of the five drum feels. Everything here is pure and deterministic, so the same
 * recipe always gives the same music, and the tests can check every note.
 *
 * Pitches never come from a letter name. Each bar has a "ladder": the notes (chord tones, the colour
 * tone, and the key's pentatonic notes that do not rub against the chord) inside a register, in
 * order. A melody is a walk up and down that ladder, so it cannot be out of tune. Long notes snap
 * to chord tones. Rhythm comes from small tables, one row per feel.
 */
import { BARS, SONGS, chordTones, pitchOf, type DrumStyle, type Pitch, type Song } from './groove';
import type { RobotPatterns, Trio } from './patterns';

const STYLES: readonly DrumStyle[] = ['pop', 'disco', 'soft', 'latin', 'east'];

const songOf = (style: DrumStyle): Song => SONGS.find((s) => s.style === style) as Song;

/** A small deterministic random number generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------------------------

export interface Rung {
  what: string;
  oct: number;
  midi: number;
  /** A chord tone (or the chord's colour tone): safe to hold. */
  chord: boolean;
}

const ladders = new Map<string, Rung[]>();

/** Every safe note of this bar between `lo` and `hi`, low to high. */
export function ladder(style: DrumStyle, bar: number, lo: number, hi: number, chordOnly: boolean): Rung[] {
  const key = `${style}|${bar}|${lo}|${hi}|${chordOnly}`;
  const hit = ladders.get(key);
  if (hit) return hit;
  const song = songOf(style);
  const tones = chordTones(song.chords[bar % BARS] as Song['chords'][number]);
  const out = new Map<number, Rung>();
  const add = (what: string, oct: number, p: Pitch, chord: boolean): void => {
    const midi = pitchOf(song, bar, p);
    if (midi < lo || midi > hi) return;
    const old = out.get(midi);
    if (!old || (chord && !old.chord)) out.set(midi, { what, oct, midi, chord });
  };
  for (let i = -3; i <= 8; i++) add(`c${i}`, 0, { k: 'chord', i, oct: 0 }, true);
  for (let oct = -1; oct <= 1; oct++) add('e', oct, { k: 'ext', oct }, true);
  if (!chordOnly) {
    for (let d = -5; d <= 9; d++) {
      const p: Pitch = { k: 'scale', d, oct: 0 };
      const pc = ((pitchOf(song, bar, p) % 12) + 12) % 12;
      const rubs = tones.some((t) => {
        const diff = (pc - t + 12) % 12;
        return diff === 1 || diff === 11;
      });
      if (!rubs) add(`s${d}`, 0, p, tones.includes(pc));
    }
  }
  const list = [...out.values()].sort((a, b) => a.midi - b.midi);
  ladders.set(key, list);
  return list;
}

function nearest(list: readonly Rung[], midi: number): number {
  let best = 0;
  for (let i = 1; i < list.length; i++) if (Math.abs((list[i] as Rung).midi - midi) < Math.abs((list[best] as Rung).midi - midi)) best = i;
  return best;
}

/** One note of a part: step, length, velocity (1 … 9) and the offset (in ladder rungs) from the register's centre. */
export interface Ev {
  s: number;
  d: number;
  v: number;
  o: number;
}

export interface Register {
  lo: number;
  hi: number;
  center: number;
}

const octSuffix = (oct: number): string => (oct > 0 ? '^'.repeat(oct) : '_'.repeat(-oct));

function token(e: Ev, r: Rung): string {
  const d = Math.max(1, Math.min(e.d, 16 - e.s));
  return `${e.s}${r.what}${d > 1 ? `:${d}` : ''}${octSuffix(r.oct)}@${Math.max(1, Math.min(9, Math.round(e.v)))}`;
}

/** The note an event plays in this bar. Notes of four steps or more are always chord tones. */
function pick(style: DrumStyle, bar: number, reg: Register, e: Ev, chordOnly: boolean, preferChord: boolean): Rung {
  const full = ladder(style, bar, reg.lo, reg.hi, chordOnly);
  let i = Math.max(0, Math.min(full.length - 1, nearest(full, reg.center) + e.o));
  let r = full[i] as Rung;
  if (!r.chord && (e.d >= 4 || (preferChord && e.s === 0))) {
    const ch = ladder(style, bar, reg.lo, reg.hi, true);
    r = ch[nearest(ch, r.midi)] as Rung;
    i = 0;
  }
  return r;
}

function render(style: DrumStyle, reg: Register, bars: readonly (readonly Ev[])[], chordOnly: boolean): string {
  return bars
    .map((evs, bar) =>
      [...evs]
        .sort((a, b) => a.s - b.s)
        .map((e) => token(e, pick(style, bar, reg, e, chordOnly, true)))
        .join(' '),
    )
    .join(' | ');
}

/** Velocity of a step: the downbeat leans, the beat is firm, the off-beats are light. */
export function accent(s: number, style: DrumStyle): number {
  if (s === 0) return 8;
  if (style === 'disco' && s % 4 === 2) return 8;
  if (s % 4 === 0) return 7;
  if (s % 4 === 2) return 5;
  return 4;
}

const gaps = (steps: readonly number[], cap: number): number[] => steps.map((s, i) => Math.min(cap, (steps[i + 1] ?? 16) - s));

function perStyle<T>(make: (style: DrumStyle) => T): Record<DrumStyle, T> {
  return Object.fromEntries(STYLES.map((s) => [s, make(s)])) as Record<DrumStyle, T>;
}

// ---------------------------------------------------------------------------------------------
// Arpeggios: harp, kalimba, vibraphone … notes of the chord, in a shape that turns every bar.
// ---------------------------------------------------------------------------------------------

type Shape = 'up' | 'down' | 'updown' | 'skip';
const SHAPES: Record<Shape, readonly number[]> = { up: [0, 1, 2, 3], down: [3, 2, 1, 0], updown: [0, 1, 2, 3, 2, 1], skip: [0, 2, 1, 3] };

/** Steps for [body, fill] bars at each level, per feel. */
const ARP_STEPS: Record<DrumStyle, readonly [readonly [number[], number[]], readonly [number[], number[]], readonly [number[], number[]]]> =
  {
    pop: [
      [
        [0, 8],
        [0, 8, 12],
      ],
      [
        [0, 2, 4, 6, 8, 10, 12, 14],
        [0, 2, 4, 6, 8, 10, 12, 14, 15],
      ],
      [
        [0, 2, 3, 4, 6, 8, 10, 11, 12, 14],
        [0, 2, 4, 6, 8, 10, 11, 12, 13, 14, 15],
      ],
    ],
    disco: [
      [
        [2, 10],
        [2, 10, 14],
      ],
      [
        [2, 4, 6, 10, 12, 14],
        [2, 4, 6, 10, 12, 13, 14, 15],
      ],
      [
        [0, 2, 3, 6, 7, 10, 11, 14, 15],
        [0, 2, 3, 6, 7, 10, 12, 13, 14, 15],
      ],
    ],
    soft: [
      [
        [0, 8],
        [0, 8, 12],
      ],
      [
        [0, 4, 6, 8, 12, 14],
        [0, 4, 6, 8, 12, 13, 14],
      ],
      [
        [0, 2, 4, 6, 8, 10, 12, 14],
        [0, 2, 4, 6, 8, 10, 12, 13, 14, 15],
      ],
    ],
    latin: [
      [
        [0, 6, 12],
        [0, 6, 12, 14],
      ],
      [
        [0, 3, 6, 8, 11, 14],
        [0, 3, 6, 8, 11, 13, 14, 15],
      ],
      [
        [0, 3, 4, 6, 8, 11, 12, 14],
        [0, 3, 6, 8, 10, 11, 12, 13, 14, 15],
      ],
    ],
    east: [
      [[0], [0, 10]],
      [
        [0, 4, 8, 12],
        [0, 4, 8, 12, 14],
      ],
      [
        [0, 2, 4, 6, 8, 10, 12, 14],
        [0, 2, 4, 6, 8, 10, 12, 14, 15],
      ],
    ],
  };

export interface ArpRecipe extends Register {
  seed: number;
  /** The shape of each of the four bars (the fourth also gets a run into the next lap). */
  shapes: readonly [Shape, Shape, Shape, Shape];
  /** Longest note, in steps. */
  maxD?: number;
  /** Velocity added to everything. */
  vel?: number;
}

export function arp(r: ArpRecipe): RobotPatterns {
  return perStyle((style) =>
    [0, 1, 2].map((lv) => {
      const [body, fill] = ARP_STEPS[style][lv] as [number[], number[]];
      const bars: Ev[][] = [0, 1, 2, 3].map((b) => {
        const steps = b === 3 ? fill : body;
        const ds = gaps(steps, r.maxD ?? 4);
        const seq = SHAPES[r.shapes[b] as Shape];
        const lift = b === 2 ? 1 : 0;
        return steps.map((s, i) => {
          const runStart = steps.length - 4;
          const inRun = b === 3 && lv > 0 && i >= runStart;
          const o = inRun ? i - runStart + 1 : (seq[(i + r.seed) % seq.length] as number) + lift;
          const v = (inRun ? ([5, 6, 8, 9][i - runStart] ?? 6) : accent(s, style)) + (r.vel ?? 0);
          return { s, d: ds[i] as number, v, o };
        });
      });
      return render(style, r, bars, true);
    }),
  ) as unknown as RobotPatterns;
}

// ---------------------------------------------------------------------------------------------
// Lead lines: a walk over the ladder in four bars: call, answer, call again, ending.
// ---------------------------------------------------------------------------------------------

const LEAD_CELLS: Record<DrumStyle, readonly (readonly number[])[]> = {
  pop: [
    [0, 2, 4, 8, 10, 12],
    [0, 4, 6, 8, 12, 14],
    [0, 3, 4, 8, 11, 12],
    [2, 4, 6, 8, 10, 14],
  ],
  disco: [
    [2, 4, 6, 10, 12, 14],
    [2, 6, 8, 10, 14],
    [0, 2, 6, 10, 12],
    [2, 3, 6, 10, 11, 14],
  ],
  soft: [
    [0, 4, 8, 12],
    [0, 6, 8, 12],
    [0, 4, 6, 10, 12],
    [2, 6, 8, 14],
  ],
  latin: [
    [0, 3, 6, 8, 11, 14],
    [0, 3, 4, 8, 11],
    [2, 3, 6, 10, 11, 14],
    [0, 6, 8, 11, 12, 14],
  ],
  east: [
    [0, 4, 8, 12],
    [0, 4, 6, 10, 12],
    [0, 2, 4, 8, 12],
    [0, 6, 8, 12, 14],
  ],
};

export interface LeadRecipe extends Register {
  seed: number;
  /** Longest note, in steps. */
  maxD?: number;
  /** Use the slow cells of the calm feel in every song. */
  slow?: boolean;
  vel?: number;
}

function cellFor(level: number, cell: readonly number[]): number[] {
  if (level === 0) return [cell[0] as number, cell.find((s) => s >= 8) ?? 8];
  if (level === 1) return [...cell];
  const out = new Set(cell);
  cell.forEach((s, i) => {
    if (i % 2 === 1 && s + 1 < 16 && !out.has(s + 1)) out.add(s + 1);
  });
  return [...out].sort((a, b) => a - b);
}

export function lead(r: LeadRecipe): RobotPatterns {
  return perStyle((style) =>
    [0, 1, 2].map((lv) => {
      const rand = rng(r.seed * 7919 + STYLES.indexOf(style) * 104729);
      const cells = (r.slow ? LEAD_CELLS.soft : LEAD_CELLS[style]).map((c) => cellFor(lv, c));
      const pickCell = (): number[] => cells[Math.floor(rand() * cells.length)] as number[];
      const walk = (steps: number[], from: number): number[] => {
        const offs: number[] = [];
        let o = from;
        for (const _s of steps) {
          const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(rand() * 7)] as number;
          o = Math.max(-5, Math.min(6, o + move + (o > 4 ? -1 : o < -3 ? 1 : 0)));
          offs.push(o);
        }
        return offs;
      };
      const make = (steps: number[], offs: number[], last: boolean): Ev[] => {
        const ds = gaps(steps, r.maxD ?? 6);
        return steps.map((s, i) => ({
          s,
          d: last && i === steps.length - 1 ? Math.min(4, 16 - s) : (ds[i] as number),
          v: accent(s, style) + (r.vel ?? 0) + (lv === 2 && s % 2 === 1 ? -1 : 0),
          o: offs[i] as number,
        }));
      };
      const s0 = pickCell();
      const o0 = walk(s0, Math.floor(rand() * 3));
      const s1 = pickCell();
      const o1 = walk(s1, 1);
      const s2 = s0;
      const o2 = o0.map((o, i) => (i >= o0.length - 2 ? o + (rand() < 0.5 ? 1 : -1) : o));
      let s3 = pickCell();
      if (JSON.stringify(s3) === JSON.stringify(s0)) s3 = cells[(cells.indexOf(s0) + 1) % cells.length] as number[];
      const o3 = walk(s3, 0);
      o3[o3.length - 1] = -1;
      const bars = [make(s0, o0, false), make(s1, o1, false), make(s2, o2, false), make(s3, o3, true)];
      if (lv === 2) {
        // a quick run into the next lap
        const last = bars[3] as Ev[];
        const end = last[last.length - 1] as Ev;
        if (end.s <= 11) {
          end.d = Math.min(end.d, 12 - end.s);
          for (const e of [13, 14, 15]) last.push({ s: e, d: 1, v: 5 + (e - 12), o: e - 14 });
        }
      }
      return render(style, r, bars, false);
    }),
  ) as unknown as RobotPatterns;
}

// ---------------------------------------------------------------------------------------------
// Single notes written out by hand: a few long, calm notes (the gong, the bowed bass)
// ---------------------------------------------------------------------------------------------

export function notes(r: Register, table: Record<DrumStyle, readonly [readonly Ev[][], readonly Ev[][], readonly Ev[][]]>): RobotPatterns {
  return perStyle((style) => table[style].map((bars) => render(style, r, bars, true))) as unknown as RobotPatterns;
}

// ---------------------------------------------------------------------------------------------
// Accompaniment: strums, rolls, oompah, organ stabs. Events name the voice they play.
// ---------------------------------------------------------------------------------------------

/** [step, what, length, velocity] — `what` is `w` (triad), `y` (four-note chord), `v0`…`j3` (one voice) or `b0`…`b4` (bass). */
export type CompEv = readonly [number, string, number, number];

const FILL_TAIL: readonly CompEv[] = [
  [12, 'w', 1, 6],
  [13, 'v1', 1, 5],
  [14, 'w', 1, 8],
  [15, 'v2', 1, 9],
];

const tokenOf = ([s, what, d, v]: CompEv): string => `${s}${what}${d > 1 ? `:${Math.min(d, 16 - s)}` : ''}@${v}`;

/** The three levels of one body bar: the beats only (easy), the part (medium), with ghost strokes (busy). */
function compLevels(
  body: readonly CompEv[],
  tail: readonly CompEv[],
  ghostCap: number,
  ghostWhat: string,
): [CompEv[][], CompEv[][], CompEv[][]] {
  const easy = body
    .filter((e) => e[0] % 8 === 0)
    .map((e): CompEv => [e[0], e[1][0] === 'b' || e[1][0] === 'v' || e[1][0] === 'j' ? e[1] : e[1], 8, e[3]]);
  const l1: CompEv[] = easy.length ? easy : [[0, 'w', 8, 6]];
  const used = new Set(body.map((e) => e[0]));
  const ghosts: CompEv[] = [];
  for (let s = 1; s < 16 && ghosts.length < ghostCap; s += 2) if (!used.has(s)) ghosts.push([s, ghostWhat, 1, 3]);
  const l3 = [...body, ...ghosts];
  const var1 = (b: readonly CompEv[]): CompEv[] => b.filter((_, i) => i !== 1);
  const withFill = (b: readonly CompEv[]): CompEv[] => [...b.filter((e) => e[0] < 12), ...tail];
  return [
    [l1, l1, l1, l1.map((e, i): CompEv => (i === 1 ? [e[0], e[1], e[2], e[3] + 1] : e))],
    [[...body], var1(body), [...body], withFill(body)],
    [l3, var1(l3), l3, withFill(l3)],
  ];
}

export interface CompOptions {
  /** The notes that roll into the next lap, in place of the last beat of the fourth bar. */
  tail?: readonly CompEv[];
  /** Most ghost strokes a busy bar adds (each is one note). */
  ghosts?: number;
  /** What a ghost stroke plays (a single voice of the chord by default). */
  ghostWhat?: string;
}

export function comp(table: Record<DrumStyle, readonly CompEv[]>, opts: CompOptions = {}): RobotPatterns {
  return perStyle((style) => {
    const lv = compLevels(table[style], opts.tail ?? FILL_TAIL, opts.ghosts ?? 2, opts.ghostWhat ?? 'v1');
    return lv.map((bars) =>
      bars
        .map((b) =>
          [...b]
            .sort((x, y) => x[0] - y[0])
            .map(tokenOf)
            .join(' '),
        )
        .join(' | '),
    );
  }) as unknown as RobotPatterns;
}

// ---------------------------------------------------------------------------------------------
// Percussion: a bar is sixteen characters.  A strong, a normal, g ghost, u alternate, o other, . rest.
// ---------------------------------------------------------------------------------------------

export interface PercRecipe {
  /** The drum letter each character plays (`K S H M P W B X R A C`). */
  kinds: Partial<Record<'A' | 'a' | 'g' | 'u' | 'o', string>>;
  /** Chord tone and octave for each character, where a world instrument can play it at a pitch. */
  tune?: Partial<Record<'A' | 'a' | 'g' | 'u' | 'o', readonly [number, number]>>;
  /** One body bar (16 characters) for each feel. */
  body: Record<DrumStyle, string>;
  /** Where the busy level adds ghost strokes. */
  dense?: 'even' | 'odd' | 'quarter' | 'none';
  /** The last four characters of the fill bar. */
  tail?: string;
  /** Added to every velocity. */
  vel?: number;
}

const PERC_VEL: Record<string, number> = { A: 8, a: 5, g: 3, u: 6, o: 7 };

export function perc(r: PercRecipe): RobotPatterns {
  const tail = r.tail ?? 'gaaA';
  const dense = r.dense ?? 'even';
  const tokenFor = (c: string, s: number): string | null => {
    const kind = r.kinds[c as 'A'];
    if (!kind) return null;
    const t = r.tune?.[c as 'A'];
    const tuned = t ? `~${t[0]}` : '';
    const oct = t ? octSuffix(t[1]) : '';
    return `${s}${kind}${tuned}${oct}@${Math.max(1, Math.min(9, (PERC_VEL[c] as number) + (r.vel ?? 0)))}`;
  };
  const bar = (chars: string): string =>
    [...chars]
      .map((c, s) => (c === '.' ? null : tokenFor(c, s)))
      .filter(Boolean)
      .join(' ');
  return perStyle((style) => {
    const body = r.body[style];
    const strong = [...body].map((c) => (c === 'A' ? 'A' : '.')).join('');
    const l1 = strong.includes('A') ? strong : `A${strong.slice(1)}`;
    const fillWith = (b: string, mode: string): string =>
      [...b]
        .map((c, i) => {
          if (c !== '.') return c;
          if (mode === 'even' && i % 2 === 0) return 'g';
          if (mode === 'odd' && i % 2 === 1) return 'g';
          if (mode === 'quarter' && i % 4 === 2) return 'g';
          return '.';
        })
        .join('');
    // The busy level adds ghost strokes the way the recipe likes; if the bar has no room there, anywhere else.
    const thick = (b: string): string => {
      for (const mode of dense === 'none' ? [] : [dense, 'quarter', 'even', 'odd']) {
        const t = fillWith(b, mode);
        if (t !== b) return t;
      }
      return b;
    };
    const vary = (b: string): string => (b[14] === '.' ? `${b.slice(0, 14)}g${b[15]}` : b);
    const withTail = (b: string, t: string): string => b.slice(0, 12) + t;
    const l2 = body;
    const l3 = thick(body);
    const easyTail = '..aA';
    return [
      [l1, l1, l1, withTail(l1, easyTail)],
      [l2, vary(l2), l2, withTail(l2, tail)],
      [l3, vary(l3), l3, withTail(l3, tail)],
    ].map((bars) => bars.map(bar).join(' | '));
  }) as unknown as RobotPatterns;
}

export type { Trio };
