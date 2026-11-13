/**
 * Build the sounds for Bấm nghe tiếng (src/games/soundbook): clean, close,
 * unmistakable recordings per picture, found, recognised (CLAP + AudioSet AST) and
 * cut by scripts/lib/freesound.mjs. Animals, vehicles and things get several
 * different recordings (`<id>-<n>.m4a`); the game never plays one twice in a row.
 *
 *   node scripts/soundbook.mjs            build what is missing
 *   node scripts/soundbook.mjs cow pig    rebuild just these
 *   node scripts/soundbook.mjs --force    rebuild everything
 *
 * An item in PINS skips the search and uses exactly that recording and cut —
 * for when a person has listened and the model's choice was not the best one.
 */
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, cached, creditRow, encode, pick, VOICES, withMeta } from './lib/freesound.mjs';

const OUT_DIR = 'public/sounds';
const MANIFEST = 'src/games/soundbook/sounds.ts';
const CREDITS = join(OUT_DIR, 'CREDITS.md');
const PICKS = join(CACHE, 'soundbook-picks.json');

/**
 * Animals, vehicles and things: the voice they are looked for as (VOICES in
 * scripts/lib/freesound.mjs) and the longest cut in seconds. Each gets TAKES
 * different recordings, so pressing the same picture twenty times is not twenty
 * copies of one moo.
 */
const VOICED = {
  // farm
  cow: 2.5,
  pig: 2,
  sheep: 2,
  goat: 2,
  rooster: 2.5,
  hen: 2,
  chick: 2,
  duck: 1.8,
  horse: 2.5,
  dog: 1.8,
  cat: 1.8,
  donkey: 2.5,
  // wild
  lion: 2.5,
  elephant: 2.5,
  monkey: 2.5,
  wolf: 2.5,
  bear: 2.5,
  frog: 2,
  owl: 2.5,
  bird: 2,
  snake: 2,
  parrot: 2,
  dolphin: 2.5,
  bee: 2,
  // vehicles: sirens, trains and the like keep their longer cut
  firetruck: 3,
  ambulance: 3,
  police: 3,
  car: 1.5,
  train: 3,
  airplane: 3,
  helicopter: 2.5,
  motorbike: 2.5,
  bicycle: 1.8,
  ship: 3,
  tractor: 2.5,
  rocket: 3,
  // things
  alarm: 2.5,
  clock: 2.5,
  phone: 2.5,
  doorbell: 2.5,
  knock: 1.8,
  toilet: 2.5,
  kettle: 2.5,
  balloon: 1,
  hammer: 2,
  camera: 1,
  scissors: 1.8,
  keys: 1.8,
};
/** Different recordings per item above. */
const TAKES = 4;

/** Everything else in the book: one recording each (see Source in scripts/lib/freesound.mjs). */
const SINGLE = {
  // people
  giggle: { q: ['baby laugh', 'baby laughing'], prompt: 'a baby laughing', len: 2.5 },
  cry: { q: ['baby cry', 'baby crying'], prompt: 'a baby crying', len: 2.5 },
  sneeze: { q: ['sneeze', 'sneezing'], prompt: 'a person sneezing achoo', len: 1.5 },
  snore: { q: ['snore', 'snoring'], prompt: 'a person snoring', len: 3.5 },
  clap: { q: ['applause small', 'hand clapping'], prompt: 'people clapping hands applause', len: 2.5 },
  kiss: { q: ['kiss', 'kiss smack'], prompt: 'a kiss smack sound', len: 1, minLen: 0.3 },
  yawn: { q: ['yawn', 'yawning'], prompt: 'a person yawning', len: 2.5 },
  cough: { q: ['cough', 'coughing'], prompt: 'a person coughing', len: 1.8 },
  laugh: { q: ['kids laughing', 'children laughing'], prompt: 'children laughing', len: 2.5 },
  footsteps: { q: ['footsteps', 'footsteps wood'], prompt: 'footsteps walking', len: 2.5 },
  eat: { q: ['apple bite crunch', 'eating crunch'], prompt: 'biting and crunching an apple', len: 2 },
  whistle: { q: ['whistling tune', 'human whistle'], prompt: 'a person whistling a tune', len: 2.5 },
  // nature
  rain: { ambience: true, q: ['rain', 'rain on window'], prompt: 'rain falling', len: 3 },
  thunder: { ambience: true, q: ['thunder', 'thunder clap', 'thunder crack', 'thunderstorm'], prompt: 'thunder rumbling', len: 3.5 },
  wind: { ambience: true, q: ['wind howling', 'wind blowing', 'wind whistling', 'strong wind'], prompt: 'strong wind blowing', len: 3 },
  waves: { ambience: true, q: ['ocean waves', 'sea waves'], prompt: 'ocean waves crashing on a beach', len: 3.5 },
  fire: { ambience: true, q: ['campfire crackling', 'fire crackling'], prompt: 'a campfire crackling', len: 3 },
  drip: { q: ['water drip', 'water drop'], prompt: 'water dripping drip drop', len: 2 },
  stream: { ambience: true, q: ['stream water', 'brook'], prompt: 'a babbling brook, flowing water', len: 3 },
};

/** Every item in the book, with how many recordings it gets. */
const SOURCES = {
  ...Object.fromEntries(Object.entries(VOICED).map(([id, len]) => [id, { ...VOICES[id], len, takes: TAKES }])),
  ...SINGLE,
};

/** Pinned picks after a human listened: `{ id: <Freesound id>, start, end }` in seconds. */
const PINS = {};

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
for (const id of only) if (!SOURCES[id]) throw new Error(`unknown item: ${id}`);

const ids = Object.keys(SOURCES);
const takesOf = (id) => readdirSync(OUT_DIR).filter((f) => new RegExp(`^${id}-\\d+\\.m4a$`).test(f));

// Before there were variants every item was `<id>.m4a`: it becomes take 0 until it is rebuilt.
for (const id of ids) {
  const old = join(OUT_DIR, `${id}.m4a`);
  if (existsSync(old) && takesOf(id).length === 0) renameSync(old, join(OUT_DIR, `${id}-0.m4a`));
}

const todo = ids.filter((id) => (only.length ? only.includes(id) : force ? Boolean(SOURCES[id].takes) : takesOf(id).length === 0));

/** What each built file was cut from, kept between runs for the credits: id -> takes. */
const picks = existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, 'utf8')) : {};
for (const [id, p] of Object.entries(picks)) if (!Array.isArray(p)) picks[id] = [p];
const fresh = await pick(
  SOURCES,
  todo.filter((id) => !PINS[id]),
  'soundbook',
);
const rebuilt = new Set();
for (const [id, takes] of Object.entries(fresh)) {
  // Only recordings the models agreed on (see pick_sounds.py). An item with none keeps what it had.
  const good = takes.filter((t) => t.ok);
  if (good.length === 0) console.warn(`  ${id}: nothing passed recognition, keeping the old files`);
  else {
    picks[id] = good;
    rebuilt.add(id);
  }
}
for (const [id, pin] of Object.entries(PINS)) {
  picks[id] = [withMeta({ ...pin, path: cached(pin.id) })];
  rebuilt.add(id);
}
writeFileSync(PICKS, JSON.stringify(picks, null, 1));

for (const id of todo.filter((i) => rebuilt.has(i))) {
  for (const f of takesOf(id)) rmSync(join(OUT_DIR, f));
  picks[id].forEach((take, i) => encode(take, join(OUT_DIR, `${id}-${i}.m4a`), { rate: 32000, bitrate: '40k' }));
}
// Leftovers of items no longer in the book.
for (const f of readdirSync(OUT_DIR)) {
  if (!f.endsWith('.m4a')) continue;
  const id = /^(\w+?)(?:-\d+)?\.m4a$/.exec(f)?.[1];
  if (!id || !SOURCES[id]) rmSync(join(OUT_DIR, f));
}

// ---- manifest ----
const counts = ids.map((id) => [id, takesOf(id).length]).filter(([, n]) => n > 0);
writeFileSync(
  MANIFEST,
  `/**
 * How many recordings each item of the book has, as \`public/sounds/<id>-<n>.m4a\`.
 * Several for an animal, a vehicle or a thing, so pressing the same picture twenty
 * times is not twenty copies of one sound; the engine never plays one twice in a row.
 *
 * Generated by \`node scripts/soundbook.mjs\`. Do not edit by hand.
 */
export const SOUND_TAKES: Readonly<Record<string, number>> = {
${counts.map(([id, n]) => `  ${id}: ${n},`).join('\n')}
};

/** Items that have a recording at all. */
export const SOUND_IDS: ReadonlySet<string> = new Set(Object.keys(SOUND_TAKES));

/** Where one of an item's recordings lives, relative to the app root. */
export function soundUrl(id: string, take = 0): string {
  return \`sounds/\${id}-\${take}.m4a\`;
}
`,
);

// ---- credits ----
writeFileSync(
  CREDITS,
  `# Âm thanh của trò Bấm nghe tiếng

Cắt từ các bản ghi **CC0** (public domain) trên [Freesound](https://freesound.org), chọn
và cắt bằng \`node scripts/soundbook.mjs\`. CC0 không bắt buộc ghi công; bảng này để biết
mỗi tiếng từ đâu ra và thay được khi cần.

| Âm | Bản gốc | Người thu | Đoạn cắt |
|---|---|---|---|
${counts.flatMap(([id]) => (picks[id] ?? []).slice(0, takesOf(id).length).map((t, i) => creditRow(`${id}-${i}`, withMeta(t)))).join('\n')}
`,
);
const total = counts.reduce((a, [, n]) => a + n, 0);
console.log(`\n${counts.length}/${ids.length} items, ${total} recordings in ${OUT_DIR}.`);
