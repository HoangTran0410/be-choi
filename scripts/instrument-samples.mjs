/**
 * Build the recorded instruments: download CC0 recordings, cut and level them, encode small
 * mono AAC files into public/instruments/, and write what the engine needs to find them.
 *
 *   node scripts/instrument-samples.mjs              build everything
 *   node scripts/instrument-samples.mjs inst:harp    only these sets (keys as in SETS below)
 *   node scripts/instrument-samples.mjs --list       the sets and where each comes from
 *
 * Writes:
 *   public/instruments/*.m4a            what the app plays
 *   public/instruments/CREDITS.md       source, author, licence and cut of every file
 *   src/core/samplesManifest.ts         which files make up which instrument, and their pitch
 *
 * Raw downloads go to INSTRUMENT_CACHE (default ~/.cache/be-choi-instruments), never the repo, so
 * a rebuild only fetches what is new. Needs ffmpeg.
 *
 * Levels: every file is levelled on its own to the house level on the same A-weighted 300 ms
 * measure scripts/loudness.mjs uses (see SAMPLE_DB), then the app only has to multiply by `vel`.
 * The loudness scripts keep measuring the synth, which is what plays when a file is missing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INTENT_DB, TARGET_DB } from './lib/loudness-common.mjs';
import {
  SR,
  crossfadeLoop,
  decode,
  endOf,
  findLoop,
  hzToMidi,
  momentaryDb,
  onsetOf,
  peakOf,
  pitchOf,
  splitNotes,
  wav,
} from './lib/instrument-dsp.mjs';
import { CACHE, LIBS, fetchFreesound, fetchLib, tree } from './lib/instrument-sources.mjs';

const OUT = 'public/instruments';
const MANIFEST = 'src/core/samplesManifest.ts';
const BITRATE = process.env.INSTRUMENT_BITRATE ?? '48k';
/**
 * Where a file is levelled to. The house level is TARGET_DB *after* the master chain, whose
 * make-up gain is +3 dB (MAKEUP in audio.ts); a file goes in 3 dB under it.
 */
const SAMPLE_DB = TARGET_DB - 3;
/** No file peaks above this after levelling (the master limiter sits at -1.5 dB). */
const PEAK_MAX = 0.9;

// ---------------------------------------------------------------- what to build

const IDIO = 'Idiophones/Struck Idiophones';
const MEMB = 'Membranophones/Struck Membranophones';
const midiTargets = (...m) => m;

/**
 * One set per engine sound. `kind`:
 *   pitched  one recording per root note; the engine plays the nearest and repitches it
 *   hits     a few takes of the same sound, one picked at random each time (never the same twice)
 * `pick` says where the recordings are; `len` caps each cut in seconds; `held` makes a sustained
 * sound that is looped while the note is held; `maxShift` is how far (semitones) a root may be
 * repitched before the engine would rather use the synth (`edgeShift`: the same for a note beyond
 * the lowest / highest root, so adding roots inside a range does not narrow it); `follow` (hits only) is how much of
 * the asked-for pitch a hit takes on (0 = none: a snare does not have a pitch).
 */
const SETS = {
  // ---- the musical notes (Timbre)
  'note:piano': { kind: 'pitched', len: 2.4, maxShift: 4, pick: vcsl('Chordophones/Zithers/Grand Piano, Kawai', /Sustains\/.*_v3_rr1/, midiTargets(45, 50, 54, 58, 62, 66, 70, 74, 80, 84, 90)) },
  'note:xylo': { kind: 'pitched', len: 1.0, maxShift: 4, edgeShift: 7, pick: vcsl(`${IDIO}/Xylophone`, /Medium Mallets\/.*_ff_01_far/, midiTargets(67, 72, 79, 84, 91, 96)) },
  'note:bell': { kind: 'pitched', len: 2.2, pick: vcsl(`${IDIO}/Glockenspiel`, /glock_medium/, midiTargets(67, 72, 79, 84, 91, 96)) },
  'note:guitar': { kind: 'pitched', len: 2.0, maxShift: 4, edgeShift: 9, pick: vcsl('Chordophones/Composite Chordophones/Strumstick', /Finger\/.*_vl2_rr1/, midiTargets(50, 55, 59, 64, 69, 73, 78, 81)) },
  'note:flute': { kind: 'pitched', held: true, db: 5, len: 3.0, pick: vsco('Woodwinds/Flute/', /expvib\/.*_v1_1\.wav$/, midiTargets(48, 57, 64, 72, 81)) },
  'note:trumpet': { kind: 'pitched', held: true, len: 2.4, pick: vsco('Brass/Trumpet/', /\/sus\/.*_v1_rr1/, midiTargets(46, 53, 58, 62, 69)) },
  'note:violin': { kind: 'pitched', held: true, len: 3.0, pick: vsco('Strings/Solo Violin/', /Arco Vib\/.*_f\.wav$/, midiTargets(55, 64, 71, 79, 88)) },
  'note:sax': { kind: 'pitched', held: true, len: 2.6, pick: vcsl('Aerophones/Reed Aerophones/Tenor Saxophone', /Non-Vibrato\/.*_vl3_rr1/, midiTargets(44, 51, 58, 64, 72)) },
  'note:bass': { kind: 'pitched', len: 1.6, maxShift: 5, fmin: 30, pick: vsco('Strings/Solo Contrabass/', /Pizz\/.*_v1_rr1/, midiTargets(28, 33, 38, 43, 47)) },
  // ---- the drum kit (DrumKind)
  'drum:kick': { kind: 'hits', len: 0.7, pick: vsco('Percussion/', /^Percussion\/BDrumNewhit_v[345]_rr[12]_Sum/) },
  'drum:snare': { kind: 'hits', len: 0.45, pick: vsco('Percussion/', /^Percussion\/Snare2-HitSN_v[57]_rr[12]_Sum/) },
  'drum:hat': { kind: 'hits', len: 0.3, pick: vcsl('Idiophones/Struck Idiophones/Hi-Hat Cymbal', /HiHat_(Close|HitC_v3)_rr[12]_Mid/) },
  'drum:tom': { kind: 'hits', len: 0.8, follow: 0.4, pick: vcsl(`${MEMB}/Tom 1`, /TomH_HitM_v[34]_rr[12]_Mid/) },
  'drum:clap': { kind: 'hits', len: 0.4, pick: vcsl(`${IDIO}/Claps`, /Clap_rr[1-4]/) },
  'drum:cowbell': { kind: 'hits', len: 0.6, pick: vsco('Percussion/', /^Percussion\/Cowbell1_Hit_v[34]_rr[12]_Sum/) },
  'drum:shaker': { kind: 'hits', len: 0.3, pick: vcsl(`${IDIO}/Shaker, Small`, /Mid_ShakerDouble_(Down|Up)_rr[12]/) },
  'drum:wood': { kind: 'hits', len: 0.4, pick: vcsl(`${IDIO}/Woodblock`, /wood_click_f_rr[12]|wood_click_mp|wood_click_ff/) },
  'drum:ride': { kind: 'hits', len: 1.8, pick: vsco('Percussion/', /^Percussion\/susCymb1-hitstick_(mp|f)_rr[12]/) },
  'drum:triangle': { kind: 'hits', len: 1.6, pick: vsco('Percussion/', /^Percussion\/Triangle3-Hit_v[12]_rr[12]_Sum/) },
  'drum:crash': { kind: 'hits', len: 2.2, pick: vsco('Percussion/', /^Percussion\/cymbal-crash1_(mf|mp)_rr[12]/) },
  // ---- the world instruments
  'inst:marimba': { kind: 'pitched', len: 2.0, pick: vcsl(`${IDIO}/Marimba`, /_med_01/, midiTargets(41, 48, 55, 60, 67, 72, 79, 84)) },
  'inst:vibraphone': { kind: 'pitched', len: 2.8, pick: vcsl(`${IDIO}/Vibraphone`, /Soft Mallets\/.*_v2_rr1/, midiTargets(53, 60, 67, 72, 79, 84)) },
  'inst:steelpan': {
    kind: 'pitched',
    len: 2.0,
    pick: freesoundNotes(855774, 'steel tongue drum notes', [0, 2, 4, 6, 8, 11]),
  },
  'inst:handpan': {
    kind: 'pitched',
    len: 2.4,
    pick: freesoundNotes(497849, 'steel drum', [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  },
  'inst:djembe': {
    kind: 'hits',
    db: -5, // loud hits that the limiter would otherwise squash
    len: 0.9,
    follow: 0.3,
    pick: [fs(659911, 'djembe bass'), fs(21902, 'djembe bass'), fs(659910, 'djembe slap'), fs(21906, 'djembe')],
  },
  'inst:gong': { kind: 'hits', len: 4.2, follow: 0.5, pick: vcsl(`${IDIO}/Gong 1`, /gong_(mf|f|2_f)\.wav$/) },
  'inst:harp': { kind: 'pitched', len: 2.4, pick: vcsl('Chordophones/Composite Chordophones/Concert Harp', /_mf1\.wav$/, midiTargets(43, 55, 60, 67, 72, 79, 88)) },
  'inst:ukulele': {
    kind: 'pitched',
    len: 2.0,
    maxShift: 4,
    edgeShift: 9,
    pick: [
      fs(648362, 'ukulele note'), // C4
      fs(723353, 'zhankster ukulele'), // E4
      fs(723356, 'ukulele note'), // G4
      fs(723350, 'zhankster ukulele'), // B4
      fs(726801, 'guitar single note'), // C#5
      fs(727042, 'Ukulele OS'), // E5
    ],
  },
  'inst:banjo': {
    kind: 'pitched',
    len: 1.8,
    maxShift: 9,
    pick: [fs(254943, 'banjo note', 0), fs(653771, 'banjo note'), fs(9036, 'banjo pluck', 3)],
  },
  'inst:kalimba': { kind: 'pitched', len: 2.0, pick: vcsl('Idiophones/Plucked Idiophones/Kalimba, Kenya', /./, midiTargets(47, 54, 59, 66, 71, 78)) },
  'inst:organ': { kind: 'pitched', held: true, len: 3.0, pick: vcsl('Aerophones/Edge-blown Aerophones/Pipe Organ', /Loud\/Rode_Man3Open/, midiTargets(48, 55, 60, 67, 72, 79)) },
  'inst:accordion': {
    kind: 'pitched',
    held: true,
    len: 3.0,
    maxShift: 4.2, // the top root (88.08) must still reach C6 (84)
    pick: [
      fs(333854, 'accordeon'), // E3
      fs(560785, 'accordion single note sustained'), // Bb3
      fs(333723, 'hammondman'), // F#4
      fs(333718, 'accordion C'), // C5
      fs(333725, 'accordion G'), // G5
      fs(333722, 'accordion E'), // E6
    ],
  },
  'inst:harmonica': { kind: 'pitched', held: true, len: 2.4, pick: vcsl('Aerophones/Free Aerophones/Harmonica-Hohner-Special20-C', /Sustains\/Normal\/Hohner-Special20_Normal_[A-G]\d\.wav$/, midiTargets(60, 64, 67, 72, 76, 79, 84)) },
  'inst:panflute': {
    kind: 'pitched',
    held: true,
    len: 3.0,
    maxShift: 9,
    pick: [fs(427080, 'zanka note'), fs(696, 'panpipes', 0), fs(696, 'panpipes', 1), fs(345222, 'panpipes')],
  },
  'inst:maracas': { kind: 'hits', len: 0.35, pick: vcsl(`${IDIO}/Shaker, Large`, /LShaker_(Hit|Shake1D)_rr/) },
  'inst:tambourine': { kind: 'hits', len: 0.8, pick: vcsl(`${IDIO}/Tambourine 1`, /Tamb1_(Hit_v[12]|Shake)_rr1/) },
  'inst:chimes': { kind: 'pitched', len: 2.6, pick: vcsl(`${IDIO}/Hand Chimes`, /./, midiTargets(72, 79, 84, 88, 91)) },
  'inst:castanets': { kind: 'hits', len: 0.45, pick: [fs(496599, 'castanets'), fs(496600, 'castanets attack'), fs(774639, 'castanets', 0)] },
};

/** Where a set's recordings are. Each returns a list of { lib | fs, ... } sources (resolved lazily). */
function vcsl(dir, re, targets) {
  return { lib: 'vcsl', dir, re, targets };
}
function vsco(dir, re, targets) {
  return { lib: 'vsco', dir, re, targets };
}
function fs(id, q, seg) {
  return { fs: id, q, seg };
}
function freesoundNotes(id, q, segs) {
  return segs.map((seg) => fs(id, q, seg));
}

const NOTE_RE = /(?<![A-Za-z])([A-G])(#?)(-?\d)(?!\d)/g;
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** The note a file's name gives (C4 = 60), or null: only used to tell files of one note apart. */
function nameMidi(name) {
  const m = [...name.split('/').pop().matchAll(NOTE_RE)].pop();
  return m ? 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] ? 1 : 0) : null;
}

/** Expand a set's `pick` into concrete sources. */
async function resolve(key, set) {
  const out = [];
  if (Array.isArray(set.pick)) return set.pick.map((p) => ({ ...p }));
  const { lib, dir, re, targets } = set.pick;
  const files = (await tree(lib)).filter((p) => p.includes(dir) && re.test(p));
  if (!files.length) throw new Error(`nothing in ${lib}:${dir} matches ${re}`);
  if (!targets) return files.sort().map((path) => ({ lib, path }));
  const byNote = new Map();
  for (const path of files.sort()) {
    const m = nameMidi(path);
    if (m !== null && !byNote.has(m)) byNote.set(m, path);
  }
  // The names cannot be trusted for the octave (they differ from library to library, and within
  // one: a marimba is written an octave under where it sounds, a glockenspiel two), so the roots
  // are chosen by what each candidate measures.
  const pool = [];
  for (const path of byNote.values()) {
    const x = decode(await fetchLib(lib, path));
    const start = onsetOf(x);
    const p = pitchOf(x.subarray(start, start + Math.round(set.len * SR)), set.fmin ?? 55);
    if (p.hz > 0 && p.clarity > 0.8) pool.push({ lib, path, nominal: hzToMidi(p.hz) });
    else console.warn(`  ${key}: no clear pitch in ${path.split('/').pop()}, not a candidate`);
  }
  const used = new Set();
  for (const t of targets) {
    let best = null;
    for (const c of pool) if (!used.has(c) && (best === null || Math.abs(c.nominal - t) < Math.abs(best.nominal - t))) best = c;
    if (best === null || Math.abs(best.nominal - t) > 7) continue;
    used.add(best);
    out.push(best);
  }
  return out.sort((a, b) => a.nominal - b.nominal);
}

// ---------------------------------------------------------------- cutting

/** One recording -> a levelled cut: { pcm, midi, loop, credit }. */
async function cut(key, set, src) {
  let path, credit;
  if (src.fs) {
    const got = await fetchFreesound(src.fs, src.q);
    path = got.path;
    credit = { source: `Freesound #${src.fs}`, title: got.meta.title, author: got.meta.user, license: 'CC0 1.0', url: got.meta.url };
  } else {
    path = await fetchLib(src.lib, src.path);
    const lib = LIBS[src.lib];
    credit = { source: lib.name, title: src.path, author: lib.author, license: lib.license, url: lib.url };
  }
  let x = decode(path);
  let from = 0;
  if (src.seg !== undefined) {
    const cuts = splitNotes(x);
    const c = cuts[src.seg];
    if (!c) throw new Error(`${key}: ${credit.title} has ${cuts.length} notes, not ${src.seg + 1}`);
    x = x.subarray(c[0], c[1]);
    from = c[0] / SR;
  }
  const start = Math.max(0, onsetOf(x) - Math.round(SR * 0.004));
  x = x.subarray(start, start + Math.round(set.len * SR));
  x = x.subarray(0, endOf(x));
  x = Float32Array.from(x);
  const trimmedFrom = from + start / SR;

  let midi = null;
  let loop = null;
  if (set.kind === 'pitched') {
    const p = pitchOf(x, set.fmin ?? 55);
    const nominal = src.nominal ?? null;
    if (p.hz > 0 && p.clarity > 0.8) {
      midi = hzToMidi(p.hz);
      if (nominal !== null && Math.abs(midi - nominal) > 0.6) {
        console.warn(`  ${key}: ${credit.title} is named ${nominal} but measures ${midi.toFixed(2)}; using the measurement`);
      }
    } else if (nominal !== null) {
      midi = nominal;
      console.warn(`  ${key}: no clear pitch in ${credit.title}; using its name (${nominal})`);
    } else throw new Error(`${key}: cannot tell the pitch of ${credit.title}`);
    if (set.held) {
      loop = findLoop(x, p.hz);
      if (loop) {
        crossfadeLoop(x, loop[0], loop[1]);
        x = x.subarray(0, loop[1]);
      }
    }
  }
  // Soft edges: no click on the way in; on the way out unless the file loops.
  const fadeIn = Math.round(SR * (set.kind === 'hits' ? 0.0008 : 0.004));
  for (let i = 0; i < fadeIn && i < x.length; i++) x[i] *= i / fadeIn;
  if (!loop) {
    const fadeOut = Math.min(x.length >> 1, Math.round(SR * (set.kind === 'hits' ? 0.04 : 0.12)));
    for (let i = 0; i < fadeOut; i++) x[x.length - 1 - i] *= i / fadeOut;
  }
  // Level: house level on the loudness script's measure, never past the peak ceiling.
  const want = SAMPLE_DB + (INTENT_DB[key] ?? 0) + (set.db ?? 0);
  let g = 10 ** ((want - momentaryDb(x)) / 20);
  const peak = peakOf(x) * g;
  if (peak > PEAK_MAX) g *= PEAK_MAX / peak;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return { pcm: x, midi, loop, credit, trim: [trimmedFrom, trimmedFrom + x.length / SR], gainDb: 20 * Math.log10(g) };
}

function encode(pcm, file) {
  const tmp = join(CACHE, 'tmp.wav');
  writeFileSync(tmp, wav(pcm));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-ac', '1', '-ar', String(SR), '-c:a', 'aac', '-b:a', BITRATE, '-movflags', '+faststart', file], { stdio: 'ignore' });
}

// ---------------------------------------------------------------- main

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const [k, s] of Object.entries(SETS)) console.log(k.padEnd(16), s.kind, s.held ? 'held' : '', JSON.stringify(s.pick).slice(0, 110));
  process.exit(0);
}
const only = args.filter((a) => !a.startsWith('--'));
const keys = Object.keys(SETS).filter((k) => !only.length || only.includes(k));
mkdirSync(OUT, { recursive: true });

const STATE = join(CACHE, 'build-state.json');
const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
/** Manifest entries and credits from earlier partial runs are kept, so `inst:harp` alone does not drop the rest. */
const manifest = prev?.manifest ?? {};
const credits = prev?.credits ?? {};
const failed = [];

for (const key of keys) {
  const set = SETS[key];
  try {
    const srcs = await resolve(key, set);
    // Re-encoding replaces the set's old files.
    const stem = key.replace(':', '-');
    for (const f of readdirSync(OUT)) if (f.startsWith(`${stem}-`) && f.endsWith('.m4a')) rmSync(join(OUT, f));
    const files = [];
    const rows = [];
    let i = 0;
    for (const src of srcs) {
      let c;
      try {
        c = await cut(key, set, src);
      } catch (err) {
        console.warn(`  ${key}: skipped a source: ${err.message}`);
        continue;
      }
      const name = `${stem}-${set.kind === 'pitched' ? String(Math.round(c.midi)).padStart(3, '0') : i}.m4a`;
      if (files.some((f) => f.f === name)) continue; // two recordings of one note: keep the first
      encode(c.pcm, join(OUT, name));
      const entry = { f: name, dur: Number((c.pcm.length / SR).toFixed(3)) };
      if (c.midi !== null) entry.midi = Number(c.midi.toFixed(2));
      if (c.loop) entry.loop = [Number((c.loop[0] / SR).toFixed(3)), Number((c.loop[1] / SR).toFixed(3))];
      files.push(entry);
      rows.push({ f: name, ...c.credit, trim: c.trim, gainDb: c.gainDb });
      i++;
    }
    if (!files.length) throw new Error('no usable recording');
    manifest[key] = { kind: set.kind, ...(set.held ? { held: true } : {}), ...(set.maxShift ? { maxShift: set.maxShift } : {}), ...(set.edgeShift ? { edgeShift: set.edgeShift } : {}), ...(set.follow ? { follow: set.follow } : {}), files };
    credits[key] = rows;
    const bytes = files.reduce((n, f) => n + statSync(join(OUT, f.f)).size, 0);
    console.log(`${key.padEnd(16)} ${files.length} files ${(bytes / 1024).toFixed(0)} KB${set.held ? ' held' : ''}  ${files.map((f) => f.midi ?? '').join(' ')}`);
  } catch (err) {
    failed.push(key);
    delete manifest[key];
    delete credits[key];
    console.error(`${key}: FAILED ${err.message}`);
  }
}

writeFileSync(STATE, JSON.stringify({ manifest, credits }));

// ---- manifest
const ordered = Object.keys(SETS).filter((k) => manifest[k]);
const ts = `/**
 * Which recordings make up which instrument, and the pitch of each one.
 *
 * Generated by \`node scripts/instrument-samples.mjs\`. Do not edit by hand.
 * An instrument absent from here (or whose files will not load) plays the synth.
 */
import type { SampleSet } from './samples';

export const SAMPLE_SETS: Readonly<Record<string, SampleSet>> = ${JSON.stringify(Object.fromEntries(ordered.map((k) => [k, manifest[k]])), null, 2)};
`;
writeFileSync(MANIFEST, ts);

// ---- credits
const md = [
  '# Instrument recordings',
  '',
  'Every file in this folder is a cut of a recording released under CC0 1.0 (public domain dedication).',
  'No attribution is required; it is given here anyway. Generated by `scripts/instrument-samples.mjs`;',
  'do not edit by hand. "Trim" is the part of the source recording that was kept, in seconds; every',
  'file was also levelled and encoded to mono AAC.',
  '',
  'Libraries:',
  ...Object.values(LIBS).map((l) => `- ${l.name} (${l.license}): ${l.url}`),
  '- Freesound, CC0 recordings only: https://freesound.org',
  '',
  '| File | Source | Recording | Author | Licence | Trim (s) |',
  '|---|---|---|---|---|---|',
];
for (const k of ordered) {
  for (const r of credits[k]) {
    const rec = r.url?.includes('freesound') ? `[${r.title}](${r.url})` : String(r.title).replace(/\|/g, '/');
    md.push(`| ${r.f} | ${r.source} | ${rec} | ${r.author} | ${r.license} | ${r.trim[0].toFixed(2)}–${r.trim[1].toFixed(2)} |`);
  }
}
writeFileSync(join(OUT, 'CREDITS.md'), md.join('\n') + '\n');

const total = readdirSync(OUT)
  .filter((f) => f.endsWith('.m4a'))
  .reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
console.log(`\n${ordered.length}/${Object.keys(SETS).length} sets, ${(total / 1024 / 1024).toFixed(2)} MB in ${OUT}${failed.length ? `; FAILED: ${failed.join(', ')}` : ''}`);
if (failed.length) process.exit(1);
