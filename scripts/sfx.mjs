/**
 * Build the recorded voices behind `audio.fx()`: the animals every game uses,
 * plus the few machines that should sound like the real thing (a fire engine's
 * siren, a car horn, a train whistle).
 *
 * These used to be cut from Wikimedia Commons field recordings, and they sounded
 * like it: wind, distance, a tractor two fields over, the wrong half of a call.
 * They now come from the same place as Bấm nghe tiếng — clean CC0 recordings on
 * Freesound, picked and cut by an audio model (scripts/lib/freesound.mjs) — with
 * a few different recordings per voice so twenty taps are twenty slightly
 * different cats.
 *
 *   node scripts/sfx.mjs            build what is missing
 *   node scripts/sfx.mjs moo pig    rebuild just these
 *   node scripts/sfx.mjs --force    rebuild everything
 *
 * Any voice with no files here keeps its synthesized version (see playFx in
 * src/core/audio.ts), so a failed build is a downgrade, never silence.
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, creditRow, encode, pick, withMeta } from './lib/freesound.mjs';

const OUT_DIR = 'public/sfx';
const MANIFEST = 'src/core/sfx.ts';
const CREDITS = join(OUT_DIR, 'CREDITS.md');
const PICKS = join(CACHE, 'sfx-picks.json');
/** Different recordings per voice, when there are that many good ones. */
const TAKES = 3;

/** Keyed by FxKind (see Source in scripts/lib/freesound.mjs). */
const SOURCES = {
  meow: { q: ['cat meow', 'kitten meow'], prompt: 'a cat meowing', len: 1.8 },
  bark: { q: ['dog bark', 'dog barking'], prompt: 'a dog barking woof woof', len: 1.8 },
  quack: { q: ['duck quack', 'duck quacking'], prompt: 'a duck quacking', len: 1.8 },
  moo: { q: ['cow moo', 'cow mooing'], prompt: 'a cow mooing', len: 2.5 },
  chirp: { q: ['bird chirp', 'bird tweet'], prompt: 'a small bird chirping tweet tweet', len: 2 },
  roar: { q: ['lion roar', 'lion'], prompt: 'a lion roaring', len: 2.5 },
  frog: { q: ['frog croak', 'frog ribbit'], prompt: 'a frog croaking ribbit', len: 2 },
  pig: { q: ['pig oink', 'pig grunt'], prompt: 'a pig oinking and grunting', len: 2 },
  owl: { q: ['owl hoot', 'owl hooting'], prompt: 'an owl hooting', len: 2.5 },
  elephant: { q: ['elephant trumpet', 'elephant'], prompt: 'an elephant trumpeting', len: 2.5 },
  sheep: { q: ['sheep baa', 'sheep bleat'], prompt: 'a sheep bleating baa', len: 2 },
  cricket: { q: ['cricket chirping', 'cricket'], prompt: 'a cricket chirping', len: 2 },
  cluck: { q: ['chicken cluck', 'hen clucking'], prompt: 'a hen clucking', len: 2 },
  horse: {
    q: ['horse neigh', 'horse whinny', 'horse neighing', 'horse'],
    prompt: 'a horse neighing and whinnying',
    len: 2.5,
  },
  goat: { q: ['goat bleat', 'goat', 'goat baa', 'goat meh'], prompt: 'a goat bleating', len: 2 },
  monkey: { q: ['monkey', 'monkey chatter'], prompt: 'a monkey screeching ooh ooh aah aah', len: 2.5 },
  growl: { q: ['bear growl', 'bear roar'], prompt: 'a bear growling', len: 2.5 },
  squeak: { q: ['mouse squeak', 'mouse squeaking', 'rat squeak'], prompt: 'a little mouse squeaking', len: 1.5 },
  parrot: { q: ['parrot squawk', 'parrot'], prompt: 'a parrot squawking', len: 2 },
  penguin: { q: ['penguin', 'penguin call', 'penguins'], prompt: 'a penguin braying and squawking', len: 2.5 },
  siren: {
    q: ['fire truck siren', 'fire engine siren', 'fire engine', 'siren wail'],
    prompt: 'a fire engine siren wailing',
    len: 3,
  },
  horn: { q: ['car horn', 'car horn honk'], prompt: 'a car horn honking beep beep', len: 1.5 },
  train: {
    q: ['steam train whistle', 'train whistle', 'steam train', 'steam locomotive'],
    prompt: 'a steam train whistling and chugging choo choo',
    len: 3,
  },
  tractor: { q: ['tractor', 'tractor engine'], prompt: 'a tractor engine running', len: 2.5 },
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
for (const id of only) if (!SOURCES[id]) throw new Error(`unknown voice: ${id}`);

const kinds = Object.keys(SOURCES);
const takesOf = (kind) => readdirSync(OUT_DIR).filter((f) => new RegExp(`^${kind}-\\d+\\.m4a$`).test(f));
const todo = kinds.filter((k) => (only.length ? only.includes(k) : force || takesOf(k).length === 0));

const picks = existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, 'utf8')) : {};
const sources = Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, { ...s, takes: TAKES }]));
Object.assign(picks, await pick(sources, todo, 'sfx'));
writeFileSync(PICKS, JSON.stringify(picks, null, 1));

for (const kind of todo) {
  for (const f of takesOf(kind)) rmSync(join(OUT_DIR, f));
  (picks[kind] ?? []).forEach((take, i) => encode(take, join(OUT_DIR, `${kind}-${i}.m4a`), { rate: 32000, bitrate: '48k' }));
}
// Files of voices no longer in the list would be loaded for nothing.
for (const f of readdirSync(OUT_DIR)) {
  const kind = /^(\w+)-\d+\.m4a$/.exec(f)?.[1];
  if (kind && !SOURCES[kind]) rmSync(join(OUT_DIR, f));
}

// ---- manifest the engine reads ----
const counts = kinds.map((k) => [k, takesOf(k).length]).filter(([, n]) => n > 0);
counts.sort(([a], [b]) => a.localeCompare(b));
writeFileSync(
  MANIFEST,
  `import type { FxKind } from './audio';

/**
 * How many recorded takes there are of each voice, as \`public/sfx/<kind>-<n>.m4a\`.
 *
 * Several takes per voice so that a child pressing the same button twenty times
 * does not hear the same sample twenty times. Anything missing here keeps its
 * synthesized voice, so this file shrinking is a downgrade, never a breakage.
 *
 * Generated by \`node scripts/sfx.mjs\`. Do not edit by hand.
 */
export const SFX_TAKES: Readonly<Partial<Record<FxKind, number>>> = {
${counts.map(([k, n]) => `  ${k}: ${n},`).join('\n')}
};

/** Where one take lives, relative to the app root. */
export function sfxUrl(kind: FxKind, take: number): string {
  return \`sfx/\${kind}-\${take}.m4a\`;
}
`,
  'utf8',
);

// ---- credits ----
writeFileSync(
  CREDITS,
  `# Tiếng con vật và tiếng xe

Cắt từ các bản ghi **CC0** (public domain) trên [Freesound](https://freesound.org), chọn
và cắt bằng \`node scripts/sfx.mjs\`. CC0 không bắt buộc ghi công; bảng này để biết mỗi
tiếng từ đâu ra và thay được khi cần.

| Âm | Bản gốc | Người thu | Đoạn cắt |
|---|---|---|---|
${counts.flatMap(([k]) => (picks[k] ?? []).map((t, i) => creditRow(`${k}-${i}`, withMeta(t)))).join('\n')}
`,
  'utf8',
);

const total = counts.reduce((a, [, n]) => a + n, 0);
console.log(`\n${total} clips in ${OUT_DIR}. Wrote ${MANIFEST} and ${CREDITS}.`);
const missing = kinds.filter((k) => !counts.some(([c]) => c === k));
if (missing.length > 0) console.log(`still on the synth: ${missing.join(', ')}`);
