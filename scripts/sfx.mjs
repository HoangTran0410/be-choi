/**
 * Build the animal voices from real recordings.
 *
 * The synthesized animals were never convincing — a sawtooth through a formant
 * filter is a good impression of a kazoo, not of a cat. This downloads freely
 * licensed field recordings from Wikimedia Commons, cuts the individual calls out
 * of them, levels them, and writes small mono AAC files into `public/sfx/`.
 *
 *   node scripts/sfx.mjs            build everything that is missing
 *   node scripts/sfx.mjs --force    re-download and rebuild from scratch
 *
 * Sources are listed by hand below rather than searched for, because search
 * cannot tell a cat from a person saying "meow" — and Commons is full of both.
 * Every entry has been listened to. Licences are recorded in public/sfx/CREDITS.md.
 *
 * The engine falls back to the synth for any voice with no files here, so a
 * failed download degrades to the old sound rather than to silence.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

/** At most this many variants per animal, so one tap never sounds like a loop. */
const MAX_VARIANTS = 4;
/** A single call, in seconds. Long enough for a moo, short enough to stay a sound effect. */
const MAX_LEN = 1.6;
const MIN_LEN = 0.18;
/**
 * A call has to stand this far above the loudest moment of the recording before
 * it counts as the animal rather than as wind, traffic or the next field over.
 * Measured per file, because a studio moo and a windy hillside bleat have
 * nothing in common but the format.
 */
const HEADROOM_DB = 18;
/** …but never cut closer than this to the recording's own noise floor. */
const ABOVE_FLOOR_DB = 8;
/** A gap this long, below the threshold, separates two calls. */
const SILENCE_GAP = 0.22;
/** Rumble — wind, traffic, handling — lives below this and only confuses the detector. */
const RUMBLE_HZ = 180;
/** A clip whose loudest moment is not this far above its own average is just noise. */
const MIN_CONTRAST_DB = 9;
/** Where each slice is levelled to. Matches the synth's house level (see loudness.mjs). */
const TARGET_LUFS = -20;
const OUT_DIR = 'public/sfx';
const CACHE = 'node_modules/.cache/be-choi-sfx';
const MANIFEST = 'src/core/sfx.ts';
const CREDITS = join(OUT_DIR, 'CREDITS.md');

/**
 * Curated sources, best licence first. `skip` drops a leading chunk that is not
 * the animal (an announcement, a person setting up the microphone).
 */
const SOURCES = {
  meow: [
    { file: 'Meow of a pleading cat.oga', license: 'Public domain', by: 'Cyberdyne1', want: 2 },
    { file: 'Maullido de gata hembra joven.ogg', license: 'CC0', by: 'Marcos-Cristian', want: 1 },
    { file: 'Meow of a Siamese cat - freemaster2.wav', license: 'CC0', by: 'freemaster2 (Freesound)', want: 1 },
  ],
  bark: [
    { file: 'Barking of a dog.ogg', license: 'CC BY-SA 3.0', by: 'Juandev', want: 2 },
    { file: 'Barking of a dog 2.ogg', license: 'CC BY-SA 3.0', by: 'Juandev', want: 2 },
  ],
  quack: [
    { file: 'Mallard (Anas platyrhynchos) (W1CDR0001518 BD17).ogg', license: 'CC BY-SA 3.0', by: 'British Library / Wildlife Sounds', want: 4 },
  ],
  moo: [
    { file: 'Sound Ideas, COW - SINGLE MOO, ANIMAL 02.wav', license: 'Public domain', by: 'Sound Ideas', want: 1 },
    { file: 'Single Cow Moo.ogg', license: 'CC BY-SA 4.0', by: 'DavidJCobb', want: 1 },
    { file: 'Mudchute cow 1.ogg', license: 'CC BY-SA 3.0', by: 'Kaihsu Tai', want: 1 },
  ],
  chirp: [
    { file: 'Budgerigar chirping.ogg', license: 'Public domain', by: 'Rudolf Ritter', want: 2 },
    { file: '30goldfinch.ogg', license: 'Public domain', by: 'US National Park Service', want: 2 },
  ],
  roar: [
    { file: 'Lion raring-sound1TamilNadu178.ogg', license: 'Public domain', by: 'Rakeshkdogra', want: 3 },
  ],
  frog: [
    { file: 'Single Frog Croak.oga', license: 'CC BY-SA 4.0', by: 'DavidJCobb', want: 2 },
    { file: 'Wood Frogs calling in spring.ogg', license: 'CC BY-SA 3.0', by: 'Jarek Tuszyński', want: 2 },
  ],
  pig: [
    { file: 'Mudchute pig 1.ogg', license: 'CC BY-SA 3.0', by: 'Kaihsu Tai', want: 2 },
    { file: 'Pig grunt - Erdie.ogg', license: 'CC BY 3.0', by: 'Erdie', want: 2 },
  ],
  owl: [
    { file: 'Bubo virginianus - Great Horned Owl XC450919.mp3', license: 'CC BY-SA 4.0', by: 'Bruce Lagerquist (xeno-canto)', want: 3 },
    { file: 'Short-eared Owl.ogg', license: 'CC BY-SA 3.0', by: 'Jarek Tuszyński', want: 1 },
  ],
  elephant: [
    { file: 'Elephant voice - trumpeting.ogg', license: 'CC0', by: 'Tanguy Cadeau', want: 3 },
  ],
  sheep: [
    { file: 'Sheep bleat.ogg', license: 'CC0', by: 'Nomad-27', want: 1 },
    { file: 'Sheep bleating.ogg', license: 'Public domain', by: 'Ryan Hodnett', want: 2 },
    { file: 'Herd of goats bleating.ogg', license: 'Public domain', by: 'Ryan Hodnett', want: 2 },
  ],
  cricket: [
    { file: 'Field cricket Gryllus pennsylvanicus.ogg', license: 'CC BY-SA 3.0', by: 'Lisa Rainsong', want: 2 },
    { file: 'Cricket Gryllus bimaculatus Chirps.oga', license: 'CC BY-SA 4.0', by: 'Kaldari', want: 2 },
  ],
};

const force = process.argv.includes('--force');
const UA = 'be-choi-sfx/1.0 (https://github.com/; toddler game, offline audio)';

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
/** ffmpeg writes its analysis to stderr and exits 0; capture both. */
function ffProbe(args) {
  try {
    return execFileSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
}

mkdirSync(CACHE, { recursive: true });
if (force) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

/** The real download URL for a Commons file title. */
async function commonsUrl(title) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries({
    action: 'query',
    format: 'json',
    formatversion: '2',
    titles: `File:${title}`,
    prop: 'imageinfo',
    iiprop: 'url',
  })) url.searchParams.set(k, v);
  const data = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  return data?.query?.pages?.[0]?.imageinfo?.[0]?.url ?? null;
}

async function download(title) {
  const local = join(CACHE, basename(title).replace(/[^\w.\-]/g, '_'));
  if (existsSync(local) && !force) return local;
  const url = await commonsUrl(title);
  if (!url) throw new Error(`not on Commons: ${title}`);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} fetching ${title}`);
  writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  return local;
}

/** Peak and mean level of a file, or of one span of it, in dBFS. */
function levels(wav, span) {
  const cut = span ? ['-ss', String(span.from), '-t', String(span.to - span.from)] : [];
  const log = ffProbe(['-i', wav, ...cut, '-af', `highpass=f=${RUMBLE_HZ},volumedetect`, '-f', 'null', '-']);
  return {
    peak: Number(/max_volume: ([\d.-]+) dB/.exec(log)?.[1] ?? -99),
    mean: Number(/mean_volume: ([\d.-]+) dB/.exec(log)?.[1] ?? -99),
  };
}

/**
 * Where the calls are, on this particular recording's terms. A fixed threshold
 * finds nothing in a noisy field recording — the level never drops that far — so
 * the threshold is set from the file's own peak and noise floor.
 */
function threshold(wav) {
  const { peak, mean } = levels(wav);
  return Math.max(peak - HEADROOM_DB, mean + ABOVE_FLOOR_DB);
}

/** Spans of sound in `wav`, from ffmpeg's silence detector. */
function calls(wav, silenceDb) {
  const log = ffProbe([
    '-i', wav,
    '-af', `highpass=f=${RUMBLE_HZ},silencedetect=noise=${silenceDb.toFixed(1)}dB:d=${SILENCE_GAP}`,
    '-f', 'null', '-',
  ]);
  const total = Number(/Duration: (\d+):(\d+):([\d.]+)/.exec(log)?.slice(1).reduce((a, b, i) => a + Number(b) * [3600, 60, 1][i], 0) ?? 0);
  const starts = [...log.matchAll(/silence_start: ([\d.-]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  // Sound lives between the end of one silence and the start of the next.
  const spans = [];
  let cursor = starts[0] !== undefined && starts[0] <= 0.02 ? (ends[0] ?? 0) : 0;
  for (const start of starts) {
    if (start > cursor + MIN_LEN) spans.push({ from: cursor, to: Math.min(start + 0.08, cursor + MAX_LEN) });
    const next = ends.find((e) => e > start);
    if (next === undefined) break;
    cursor = next;
  }
  if (total > 0 && cursor < total - MIN_LEN) spans.push({ from: cursor, to: Math.min(total, cursor + MAX_LEN) });
  return spans.length > 0 ? spans : [{ from: 0, to: Math.min(total || MAX_LEN, MAX_LEN) }];
}

/** Loudest first: a field recording's best call is rarely its first. */
function byLoudness(wav, spans) {
  return spans
    .map((span) => {
      const log = ffProbe(['-i', wav, '-ss', String(span.from), '-t', String(span.to - span.from), '-af', 'volumedetect', '-f', 'null', '-']);
      return { ...span, peak: Number(/max_volume: ([\d.-]+) dB/.exec(log)?.[1] ?? -99) };
    })
    .sort((a, b) => b.peak - a.peak);
}

const manifest = {};
const credits = [];
let built = 0;

for (const [kind, sources] of Object.entries(SOURCES)) {
  let index = 0;
  for (const source of sources) {
    let raw;
    try {
      raw = await download(source.file);
    } catch (err) {
      console.warn(`  skip ${kind}: ${err.message}`);
      continue;
    }
    // One mono working copy, so every later step reads the same thing.
    const work = join(CACHE, `${kind}-work.wav`);
    ff(['-y', '-i', raw, '-ac', '1', '-ar', '32000', '-vn', work]);
    const silenceDb = threshold(work);
    const spans = byLoudness(work, calls(work, silenceDb)).slice(0, source.want);
    for (const span of spans) {
      if (index >= MAX_VARIANTS) break;
      const out = join(OUT_DIR, `${kind}-${index}.m4a`);
      const len = Math.max(MIN_LEN, span.to - span.from);
      ff([
        '-y',
        '-ss', String(span.from),
        '-t', String(len),
        '-i', work,
        '-af', [
          // Cut the rumble the animal is not making, then close in on the call from
          // both ends, level it, and take the edges off so it never clicks.
          `highpass=f=${RUMBLE_HZ}`,
          `silenceremove=start_periods=1:start_threshold=${silenceDb.toFixed(1)}dB:start_silence=0.02:` +
            `stop_periods=-1:stop_threshold=${silenceDb.toFixed(1)}dB:stop_silence=0.12`,
          `loudnorm=I=${TARGET_LUFS}:TP=-2:LRA=11`,
          // loudnorm estimates its true peak in one pass; the limiter makes sure.
          'alimiter=limit=0.89:level=disabled',
          'afade=t=in:st=0:d=0.012',
          `afade=t=out:st=${Math.max(0, len - 0.06).toFixed(3)}:d=0.06`,
        ].join(','),
        '-ac', '1',
        '-ar', '32000',
        '-c:a', 'aac',
        '-b:a', '48k',
        '-movflags', '+faststart',
        out,
      ]);
      manifest[kind] = (manifest[kind] ?? 0) + 1;
      index++;
      built++;
    }
    if (spans.length > 0) credits.push({ kind, ...source });
  }
  console.log(`${kind.padEnd(10)} ${manifest[kind] ?? 0} variants`);
}

// ---- manifest the engine reads ----
const entries = Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b));
writeFileSync(
  MANIFEST,
  `import type { FxKind } from './audio';

/**
 * How many recorded takes there are of each animal, as \`public/sfx/<kind>-<n>.m4a\`.
 *
 * Several takes per animal so that a child pressing the same button twenty times
 * does not hear the same sample twenty times. Anything missing here keeps its
 * synthesized voice, so this file shrinking is a downgrade, never a breakage.
 *
 * Generated by \`node scripts/sfx.mjs\`. Do not edit by hand.
 */
export const SFX_TAKES: Readonly<Partial<Record<FxKind, number>>> = {
${entries.map(([k, n]) => `  ${k}: ${n},`).join('\n')}
};

/** Where one take lives, relative to the app root. */
export function sfxUrl(kind: FxKind, take: number): string {
  return \`sfx/\${kind}-\${take}.m4a\`;
}
`,
  'utf8',
);

// ---- attribution ----
const seen = new Set();
const lines = credits
  .filter((c) => !seen.has(`${c.kind}/${c.file}`) && seen.add(`${c.kind}/${c.file}`))
  .map((c) => `| ${c.kind} | [${c.file}](https://commons.wikimedia.org/wiki/File:${encodeURIComponent(c.file.replace(/ /g, '_'))}) | ${c.by} | ${c.license} |`);
writeFileSync(
  CREDITS,
  `# Tiếng con vật

Các file trong thư mục này được cắt ra từ bản thu thật trên Wikimedia Commons, rồi
chuẩn hoá âm lượng và encode lại bằng \`node scripts/sfx.mjs\`. Bản gốc và giấy phép:

| Âm | File gốc | Tác giả | Giấy phép |
|---|---|---|---|
${lines.join('\n')}

Các đoạn đã cắt giữ nguyên giấy phép của bản gốc. Bản CC BY-SA thì đoạn cắt cũng là
CC BY-SA cùng phiên bản.
`,
  'utf8',
);

console.log(`\n${built} clips in ${OUT_DIR}. Wrote ${MANIFEST} and ${CREDITS}.`);
const missing = Object.keys(SOURCES).filter((k) => !manifest[k]);
if (missing.length > 0) console.log(`still on the synth: ${missing.join(', ')}`);
