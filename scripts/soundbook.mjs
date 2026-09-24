/**
 * Build the sounds for Bấm nghe tiếng (src/games/soundbook).
 *
 * The animal voices in public/sfx came from Wikimedia Commons, and they sound
 * like what they are: field recordings, with wind and a tractor two fields over.
 * A child needs the opposite — one clean, close, unmistakable call. Freesound has
 * far more of those, many of them CC0, so this:
 *
 *   1. searches Freesound (CC0 only) with a few phrasings per item,
 *   2. downloads the preview of the first dozen short results,
 *   3. has scripts/soundbook_pick.py play each one to an audio-text model and keep
 *      the recording, and the cut of it, that is most clearly *this* thing,
 *   4. levels and encodes the winners into public/sounds/<id>.m4a.
 *
 *   node scripts/soundbook.mjs            build what is missing
 *   node scripts/soundbook.mjs cow pig    rebuild just these
 *   node scripts/soundbook.mjs --force    rebuild everything
 *
 * An item with `pin` skips the search and uses exactly that recording and cut —
 * for when a person has listened and the model's choice was not the best one.
 * Every pick, with its runners-up, is written to node_modules/.cache/…/picks.json.
 *
 * Needs ffmpeg and uv (the model runs in its own throwaway Python environment).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'public/sounds';
const CACHE = 'node_modules/.cache/be-choi-soundbook';
const MANIFEST = 'src/games/soundbook/sounds.ts';
const CREDITS = join(OUT_DIR, 'CREDITS.md');
/** Candidates downloaded per item. More is slower and rarely better. */
const PER_ITEM = 12;
/** Longer uploads are ambiences, not one sound — except for the weather, which is an ambience. */
const MAX_SOURCE_S = 30;
const MAX_AMBIENCE_S = 90;
/** Level of every clip. The sfx voices sit here too (see scripts/sfx.mjs). */
const TARGET_LUFS = -20;
const UA = 'Mozilla/5.0 (be-choi soundbook builder; toddler game, offline audio)';

/**
 * Every item in the book. `q` are Freesound searches, best first; `prompt` is
 * what the model is asked to recognise; `len` caps the cut in seconds (a siren
 * needs longer than a quack to be a siren); `ambience` lets in long recordings,
 * since rain is never uploaded as a two-second clip.
 */
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
  knock: { q: ['door knock', 'knocking on door'], prompt: 'knocking on a wooden door', len: 1.8 },
  toilet: { q: ['toilet flush', 'toilet flushing'], prompt: 'a toilet flushing', len: 3.5 },
  kettle: { q: ['kettle whistle', 'whistling kettle'], prompt: 'a whistling tea kettle', len: 3 },
  balloon: { q: ['balloon pop', 'balloon burst'], prompt: 'a balloon popping', len: 1 },
  hammer: { q: ['hammer nail', 'hammering'], prompt: 'a hammer hitting a nail', len: 2 },
  camera: { q: ['camera shutter', 'camera click'], prompt: 'a camera shutter click', len: 1 },
  scissors: { q: ['scissors cutting paper', 'scissors'], prompt: 'scissors cutting paper snip snip', len: 1.8 },
  keys: { q: ['keys jingle', 'keys'], prompt: 'a bunch of keys jingling', len: 1.8 },
  // people
  giggle: { q: ['baby laugh', 'baby laughing'], prompt: 'a baby laughing', len: 2.5 },
  cry: { q: ['baby cry', 'baby crying'], prompt: 'a baby crying', len: 2.5 },
  sneeze: { q: ['sneeze', 'sneezing'], prompt: 'a person sneezing achoo', len: 1.5 },
  snore: { q: ['snore', 'snoring'], prompt: 'a person snoring', len: 3.5 },
  clap: { q: ['applause small', 'hand clapping'], prompt: 'people clapping hands applause', len: 2.5 },
  kiss: { q: ['kiss', 'kiss smack'], prompt: 'a kiss smack sound', len: 1 },
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

mkdirSync(join(CACHE, 'src'), { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ff = (a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...a], { encoding: 'utf8' });

/** Short CC0 results for one search, in Freesound's relevance order. */
/** fetch, retried with a pause: Freesound drops the odd connection when asked for a lot in a row. */
async function get(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok || attempt >= 3) return res;
    } catch (err) {
      if (attempt >= 3) throw err;
    }
    await sleep(5000 * (attempt + 1));
  }
}

async function search(q, maxS = MAX_SOURCE_S) {
  const key = join(CACHE, `search-${q.replace(/\W+/g, '_')}${maxS === MAX_SOURCE_S ? '' : `-${maxS}`}.json`);
  if (existsSync(key)) return JSON.parse(readFileSync(key, 'utf8'));
  const url = new URL('https://freesound.org/search/');
  url.searchParams.set('q', q);
  url.searchParams.set('f', 'license:"Creative Commons 0"');
  const res = await get(url);
  if (!res.ok) throw new Error(`${res.status} searching ${q}`);
  const html = await res.text();
  const out = [];
  for (const m of html.matchAll(/<div\s+class="bw-player"([\s\S]*?)tabindex/g)) {
    const attr = (k) => new RegExp(`data-${k}="([^"]*)"`).exec(m[1])?.[1];
    const duration = Number(attr('duration'));
    if (!(duration > 0.3 && duration <= maxS)) continue;
    out.push({
      id: attr('sound-id'),
      user: attr('username'),
      title: attr('title')
        ?.replace(/&amp;/g, '&')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&quot;/g, '"'),
      duration,
      mp3: attr('mp3')?.replace('-lq.mp3', '-hq.mp3'),
    });
  }
  writeFileSync(key, JSON.stringify(out));
  await sleep(800);
  return out;
}

async function download(c) {
  const local = join(CACHE, 'src', `${c.id}.mp3`);
  if (existsSync(local)) return local;
  const res = await get(c.mp3);
  if (!res.ok) throw new Error(`${res.status} fetching ${c.mp3}`);
  writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  await sleep(200);
  return local;
}

const ids = Object.keys(SOURCES);
const todo = ids.filter((id) => (only.length ? only.includes(id) : force || !existsSync(join(OUT_DIR, `${id}.m4a`))));
const meta = new Map(); // freesound id -> {user, title}
const job = [];

for (const id of ids) {
  const src = SOURCES[id];
  const wanted = todo.includes(id) && !PINS[id];
  const candidates = [];
  if (wanted) {
    const seen = new Set();
    // Interleave the searches so the second phrasing gets a look-in.
    const lists = [];
    for (const q of src.q) lists.push(await search(q, src.ambience ? MAX_AMBIENCE_S : MAX_SOURCE_S));
    for (let i = 0; candidates.length < PER_ITEM && lists.some((l) => i < l.length); i++) {
      for (const l of lists) {
        const c = l[i];
        if (!c || seen.has(c.id) || candidates.length >= PER_ITEM) continue;
        seen.add(c.id);
        try {
          candidates.push({ id: c.id, path: await download(c) });
          meta.set(c.id, c);
        } catch (err) {
          console.warn(`  ${id}: ${err.message}`);
        }
      }
    }
    console.log(`${id.padEnd(12)} ${candidates.length} candidates`);
  }
  // Every item goes to the model, candidates or not: the others are what each clip is compared against.
  job.push({ id, prompt: src.prompt, maxLen: src.len, candidates });
}

const jobFile = join(CACHE, 'job.json');
const picksFile = join(CACHE, 'picks.json');
writeFileSync(jobFile, JSON.stringify({ items: job }, null, 1));
if (job.some((j) => j.candidates.length > 0)) {
  execFileSync('uv', ['run', '-q', 'scripts/soundbook_pick.py', jobFile, join(CACHE, 'picks-new.json')], { stdio: 'inherit' });
}
const picks = existsSync(picksFile) ? JSON.parse(readFileSync(picksFile, 'utf8')) : {};
if (existsSync(join(CACHE, 'picks-new.json'))) Object.assign(picks, JSON.parse(readFileSync(join(CACHE, 'picks-new.json'), 'utf8')));
for (const [id, pin] of Object.entries(PINS)) picks[id] = { ...pin, path: join(CACHE, 'src', `${pin.id}.mp3`), pinned: true };
for (const [, p] of Object.entries(picks)) {
  const m = meta.get(p.id);
  if (m) Object.assign(p, { user: m.user, title: m.title });
}
writeFileSync(picksFile, JSON.stringify(picks, null, 2));

for (const id of todo) {
  const p = picks[id];
  if (!p) {
    console.warn(`  ${id}: no pick`);
    continue;
  }
  if (p.pinned && !existsSync(p.path)) throw new Error(`${id}: pinned recording ${p.id} is not in the cache`);
  const len = p.end - p.start;
  ff([
    '-y',
    '-ss',
    String(p.start),
    '-t',
    String(len),
    '-i',
    p.path,
    '-af',
    [
      // Rumble no small speaker can play, then level, then soften the edges so nothing clicks.
      'highpass=f=90',
      `loudnorm=I=${TARGET_LUFS}:TP=-2:LRA=11`,
      'alimiter=limit=0.89:level=disabled',
      'afade=t=in:st=0:d=0.01',
      `afade=t=out:st=${Math.max(0, len - 0.15).toFixed(3)}:d=0.15`,
    ].join(','),
    '-ac',
    '1',
    '-ar',
    '44100',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-movflags',
    '+faststart',
    join(OUT_DIR, `${id}.m4a`),
  ]);
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
const rows = built
  .map((id) => [id, picks[id]])
  .filter(([, p]) => p)
  .map(
    ([id, p]) =>
      `| ${id} | [${p.title ?? `#${p.id}`}](https://freesound.org/s/${p.id}/) | ${p.user ?? ''} | ${p.start.toFixed(2)}–${p.end.toFixed(2)} s |`,
  );
writeFileSync(
  CREDITS,
  `# Âm thanh của trò Bấm nghe tiếng

Cắt từ các bản ghi **CC0** (public domain) trên [Freesound](https://freesound.org), chọn
và cắt bằng \`node scripts/soundbook.mjs\`. CC0 không bắt buộc ghi công; bảng này để biết
mỗi tiếng từ đâu ra và thay được khi cần.

| Âm | Bản gốc | Người thu | Đoạn cắt |
|---|---|---|---|
${rows.join('\n')}
`,
);
console.log(`\n${built.length}/${ids.length} sounds in ${OUT_DIR}.`);
