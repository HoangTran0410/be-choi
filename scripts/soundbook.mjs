/**
 * Build the sounds for Bấm nghe tiếng (src/games/soundbook): one clean, close,
 * unmistakable recording per picture, found and cut by scripts/lib/freesound.mjs.
 *
 *   node scripts/soundbook.mjs            build what is missing
 *   node scripts/soundbook.mjs cow pig    rebuild just these
 *   node scripts/soundbook.mjs --force    rebuild everything
 *
 * An item in PINS skips the search and uses exactly that recording and cut —
 * for when a person has listened and the model's choice was not the best one.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, cached, creditRow, encode, pick, withMeta } from './lib/freesound.mjs';

const OUT_DIR = 'public/sounds';
const MANIFEST = 'src/games/soundbook/sounds.ts';
const CREDITS = join(OUT_DIR, 'CREDITS.md');
const PICKS = join(CACHE, 'soundbook-picks.json');

/** Every item in the book (see Source in scripts/lib/freesound.mjs). */
const SOURCES = {
  // farm
  cow: { q: ['cow moo', 'cow mooing'], prompt: 'a cow mooing', len: 2.5 },
  pig: { q: ['pig oink', 'pig grunt'], prompt: 'a pig oinking and grunting', len: 2 },
  sheep: { q: ['sheep baa', 'sheep bleat'], prompt: 'a sheep bleating baa', len: 2 },
  goat: { q: ['goat bleat', 'goat', 'goat baa', 'goat meh'], prompt: 'a goat bleating', len: 2 },
  rooster: { q: ['rooster crow', 'rooster'], prompt: 'a rooster crowing cock-a-doodle-doo', len: 3 },
  hen: { q: ['chicken cluck', 'hen clucking'], prompt: 'a hen clucking', len: 2 },
  chick: { q: ['chick peep', 'baby chicks'], prompt: 'baby chicks peeping', len: 2 },
  duck: { q: ['duck quack', 'duck quacking'], prompt: 'a duck quacking', len: 1.8 },
  horse: { q: ['horse neigh', 'horse whinny', 'horse neighing', 'horse'], prompt: 'a horse neighing and whinnying', len: 2.5 },
  dog: { q: ['dog bark', 'dog barking'], prompt: 'a dog barking woof woof', len: 1.8 },
  cat: { q: ['cat meow', 'kitten meow'], prompt: 'a cat meowing', len: 1.8 },
  donkey: { q: ['donkey bray', 'donkey'], prompt: 'a donkey braying hee-haw', len: 3 },
  // wild
  lion: { q: ['lion roar', 'lion'], prompt: 'a lion roaring', len: 2.5 },
  elephant: { q: ['elephant trumpet', 'elephant'], prompt: 'an elephant trumpeting', len: 2.5 },
  monkey: { q: ['monkey', 'monkey chatter'], prompt: 'a monkey screeching ooh ooh aah aah', len: 2.5 },
  wolf: { q: ['wolf howl', 'wolf howling'], prompt: 'a wolf howling', len: 3.5 },
  bear: { q: ['bear growl', 'bear roar'], prompt: 'a bear growling', len: 2.5 },
  frog: { q: ['frog croak', 'frog ribbit'], prompt: 'a frog croaking ribbit', len: 2 },
  owl: { q: ['owl hoot', 'owl hooting'], prompt: 'an owl hooting', len: 2.5 },
  bird: { q: ['bird chirp', 'bird tweet'], prompt: 'a small bird chirping tweet tweet', len: 2 },
  snake: { q: ['snake hiss', 'hiss'], prompt: 'a snake hissing', len: 2 },
  parrot: { q: ['parrot squawk', 'parrot'], prompt: 'a parrot squawking', len: 2 },
  dolphin: { q: ['dolphin', 'dolphin click', 'dolphin whistle', 'dolphin sounds'], prompt: 'a dolphin clicking and whistling', len: 2.5 },
  bee: { q: ['bee buzz', 'bee buzzing'], prompt: 'a bee buzzing', len: 2 },
  // vehicles
  firetruck: { q: ['fire truck siren', 'fire engine siren', 'fire engine', 'siren wail'], prompt: 'a fire engine siren wailing', len: 3.5 },
  ambulance: { q: ['ambulance siren', 'ambulance'], prompt: 'an ambulance siren', len: 3.5 },
  police: { q: ['police siren', 'police car siren'], prompt: 'a police car siren', len: 3.5 },
  car: { q: ['car horn', 'car horn honk'], prompt: 'a car horn honking beep beep', len: 1.8 },
  train: {
    q: ['steam train whistle', 'train whistle', 'steam train', 'steam locomotive'],
    prompt: 'a steam train whistling and chugging choo choo',
    len: 3,
  },
  airplane: {
    q: ['airplane flyby', 'jet plane', 'airplane take off', 'plane passing'],
    prompt: 'a jet airplane engine roaring as it flies past',
    len: 3.5,
  },
  helicopter: { q: ['helicopter', 'helicopter flyby'], prompt: 'a helicopter with spinning rotor blades', len: 3 },
  motorbike: { q: ['motorcycle rev', 'motorbike'], prompt: 'a motorcycle engine revving vroom', len: 3 },
  bicycle: { q: ['bicycle bell', 'bike bell'], prompt: 'a bicycle bell ringing ring ring', len: 1.8 },
  ship: { q: ['ship horn', 'boat horn'], prompt: 'a big ship horn', len: 3 },
  tractor: { q: ['tractor', 'tractor engine'], prompt: 'a tractor engine running', len: 3 },
  rocket: { q: ['rocket launch', 'rocket'], prompt: 'a rocket launching whoosh', len: 3.5 },
  // things
  alarm: { q: ['alarm clock ring', 'alarm clock bell'], prompt: 'an alarm clock bell ringing', len: 2.5 },
  clock: { q: ['clock ticking', 'clock tick tock'], prompt: 'a clock ticking tick tock', len: 2.5 },
  phone: { q: ['old telephone ring', 'telephone ring'], prompt: 'an old telephone ringing', len: 2.5 },
  doorbell: { q: ['doorbell ding dong', 'doorbell'], prompt: 'a doorbell ding dong', len: 2.5 },
  knock: { q: ['door knock', 'knocking on door'], prompt: 'knocking on a wooden door', len: 1.8, minLen: 0.5 },
  toilet: { q: ['toilet flush', 'toilet flushing'], prompt: 'a toilet flushing', len: 3.5 },
  kettle: { q: ['kettle whistle', 'whistling kettle'], prompt: 'a whistling tea kettle', len: 3 },
  balloon: { q: ['balloon pop', 'balloon burst'], prompt: 'a balloon popping', len: 1, minLen: 0.25 },
  hammer: { q: ['hammer nail', 'hammering'], prompt: 'a hammer hitting a nail', len: 2 },
  camera: { q: ['camera shutter', 'camera click'], prompt: 'a camera shutter click', len: 1, minLen: 0.25 },
  scissors: { q: ['scissors cutting paper', 'scissors'], prompt: 'scissors cutting paper snip snip', len: 1.8 },
  keys: { q: ['keys jingle', 'keys'], prompt: 'a bunch of keys jingling', len: 1.8 },
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

/** Pinned picks after a human listened: `{ id: <Freesound id>, start, end }` in seconds. */
const PINS = {};

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
for (const id of only) if (!SOURCES[id]) throw new Error(`unknown item: ${id}`);

const ids = Object.keys(SOURCES);
const todo = ids.filter((id) => (only.length ? only.includes(id) : force || !existsSync(join(OUT_DIR, `${id}.m4a`))));

/** What each built file was cut from, kept between runs for the credits. */
const picks = existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, 'utf8')) : {};
const fresh = await pick(
  SOURCES,
  todo.filter((id) => !PINS[id]),
  'soundbook',
);
for (const [id, takes] of Object.entries(fresh)) if (takes[0]) picks[id] = takes[0];
for (const [id, pin] of Object.entries(PINS)) picks[id] = withMeta({ ...pin, path: cached(pin.id) });
writeFileSync(PICKS, JSON.stringify(picks, null, 1));

for (const id of todo) {
  if (picks[id]) encode(picks[id], join(OUT_DIR, `${id}.m4a`));
  else console.warn(`  ${id}: nothing usable`);
}

// ---- manifest ----
const built = ids.filter((id) => existsSync(join(OUT_DIR, `${id}.m4a`)));
writeFileSync(
  MANIFEST,
  `/**
 * Which items of the book have a recording, as \`public/sounds/<id>.m4a\`.
 *
 * Generated by \`node scripts/soundbook.mjs\`. Do not edit by hand.
 */
export const SOUND_IDS: ReadonlySet<string> = new Set([
${built.map((id) => `  '${id}',`).join('\n')}
]);

/** Where one item's recording lives, relative to the app root. */
export function soundUrl(id: string): string {
  return \`sounds/\${id}.m4a\`;
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
${built
  .filter((id) => picks[id])
  .map((id) => creditRow(id, withMeta(picks[id])))
  .join('\n')}
`,
);
console.log(`\n${built.length}/${ids.length} sounds in ${OUT_DIR}.`);
