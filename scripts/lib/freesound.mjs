/**
 * Shared by scripts/sfx.mjs and scripts/soundbook.mjs: find clean CC0 recordings
 * on Freesound, let an audio model pick the clearest cut of each, encode it.
 *
 *   1. search Freesound (CC0 only) with a few phrasings per sound,
 *   2. download the preview of the first dozen short results,
 *   3. have scripts/lib/pick_sounds.py play each one to CLAP, an audio-text
 *      model, and keep the recording — and the cut of it — that is most clearly
 *      *this* sound and not its neighbour, and clean rather than windy,
 *   4. level and encode the winners.
 *
 * Needs ffmpeg and uv (the model runs in its own throwaway Python environment).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const CACHE = 'node_modules/.cache/be-choi-freesound';
/** Candidates downloaded per sound. More is slower and rarely better. */
const PER_ITEM = 30;
/** Result pages read per search phrasing (about 15 recordings a page). */
const PAGES = 2;
/** Titles that mean the recording is not the real thing: people doing it, loops, music beds. */
const BAD_TITLE =
  /\b(music|song|remix|loop|beat|synth\w*|voice|speech|imitat\w*|mimic\w*|human|vocal\w*|talk\w*|cartoon|toy|plush|ringtone|sample pack)\b/i;
/** Longer uploads are ambiences, not one sound — except for the weather, which is an ambience. */
const MAX_SOURCE_S = 30;
const MAX_AMBIENCE_S = 90;
/** Where every clip is levelled to; the engine brings the group to the house level. */
const TARGET_LUFS = -20;
const UA = 'Mozilla/5.0 (be-choi sound builder; toddler game, offline audio)';

/**
 * One sound to find. `q` are Freesound searches, best first; `prompt` is what
 * the model is asked to recognise; `len` caps the cut in seconds (a siren needs
 * longer than a quack to be a siren); `ambience` lets in long recordings, since
 * rain is never uploaded as a two-second clip; `takes` asks for several
 * different recordings instead of one; `minLen` lowers the length under which a
 * cut counts as a fragment (0.9 s), for sounds that really are a blip.
 *
 * `title` is a regex the Freesound title must match (a recording called "rhino" is
 * not an elephant), `ast` names the AudioSet classes the classifier must hear, and
 * `alike` lists other items that count as the right answer (one siren for another).
 *
 * @typedef {{ q: string[], prompt: string, len: number, ambience?: boolean, takes?: number, minLen?: number, title?: RegExp, ast?: string[], alike?: string[], trust?: boolean }} Source
 * @typedef {{ id: string, start: number, end: number, score: number, path: string, user?: string, title?: string }} Take
 */

/**
 * The voices behind both builds (scripts/sfx.mjs and scripts/soundbook.mjs), so
 * a "cow" is looked for, recognised and rejected the same way in both. `title`
 * is what a real recording is called; `ast` the AudioSet classes the classifier
 * must hear in it (none where AudioSet has no such class: elephants, bears,
 * monkeys, dolphins, penguins — those lean on the title and on CLAP picking the
 * right animal out of a lineup that includes rhinos, whales and didgeridoos).
 *
 * @type {Record<string, Omit<Source, 'len'>>}
 */
export const VOICES = {
  cat: {
    q: ['cat meow', 'kitten meow', 'cat meowing', 'domestic cat meow'],
    prompt: 'a cat meowing',
    title: /cat|kitten|meow|kitty/i,
    ast: ['Meow'],
  },
  dog: {
    q: ['dog bark', 'dog barking', 'single dog bark', 'puppy bark'],
    prompt: 'a dog barking woof woof',
    title: /dog|bark|puppy|woof|hound/i,
    ast: ['Bark', 'Dog'],
  },
  duck: {
    q: ['duck quack', 'duck quacking', 'mallard quack', 'duck'],
    prompt: 'a duck quacking',
    title: /duck|quack|mallard/i,
    ast: ['Quack', 'Duck'],
  },
  cow: {
    q: ['cow moo', 'cow mooing', 'cow', 'calf moo'],
    prompt: 'a cow mooing',
    title: /cow|moo|cattle|calf|bull|ox\b/i,
    ast: ['Moo', 'Cattle, bovinae'],
  },
  bird: {
    q: ['bird chirp', 'bird tweet', 'sparrow chirp', 'small bird singing'],
    prompt: 'a small bird chirping tweet tweet',
    title: /bird|chirp|tweet|sparrow|finch|robin|canary|wren|tit\b|warbler/i,
    ast: ['Chirp, tweet', 'Bird vocalization, bird call, bird song', 'Bird'],
  },
  lion: {
    q: ['lion roar', 'lion roaring', 'lion', 'big cat roar', 'lions roaring', 'african lion', 'lion growl', 'tiger roar'],
    prompt: 'a lion roaring',
    title: /lion|big cat|tiger|leo\b/i,
    ast: ['Roar', 'Roaring cats (lions, tigers)'],
  },
  frog: {
    q: ['frog croak', 'frog ribbit', 'frog', 'tree frog'],
    prompt: 'a frog croaking ribbit',
    title: /frog|toad|ribbit|croak/i,
    ast: ['Frog', 'Croak'],
  },
  pig: {
    q: ['pig oink', 'pig grunt', 'pig', 'piglet squeal'],
    prompt: 'a pig oinking and grunting',
    title: /pig|oink|swine|hog\b|piglet|boar/i,
    ast: ['Pig', 'Oink'],
  },
  owl: { q: ['owl hoot', 'owl hooting', 'owl', 'tawny owl'], prompt: 'an owl hooting', title: /owl|hoot/i, ast: ['Owl', 'Hoot'] },
  elephant: {
    q: ['elephant trumpet', 'elephant trumpeting', 'elephant', 'african elephant', 'asian elephant'],
    prompt: 'an elephant trumpeting',
    title: /eleph|elefant/i,
  },
  sheep: {
    q: ['sheep baa', 'sheep bleat', 'sheep', 'lamb bleat'],
    prompt: 'a sheep bleating baa',
    title: /sheep|lamb|baa|\bewe\b|\bram\b/i,
    ast: ['Sheep', 'Bleat'],
    alike: ['goat'],
  },
  cricket: {
    q: ['cricket chirping', 'cricket', 'crickets', 'field cricket'],
    prompt: 'a cricket chirping',
    title: /cricket/i,
    ast: ['Cricket', 'Insect'],
  },
  hen: {
    q: ['chicken cluck', 'hen clucking', 'chicken', 'hen'],
    prompt: 'a hen clucking',
    title: /chicken|\bhens?\b|cluck/i,
    ast: ['Cluck', 'Chicken, rooster'],
  },
  horse: {
    q: ['horse neigh', 'horse whinny', 'horse neighing', 'horse'],
    prompt: 'a horse neighing and whinnying',
    title: /horse|neigh|whinny|stallion|\bmare\b|pony/i,
    ast: ['Neigh, whinny', 'Horse'],
  },
  goat: {
    q: ['goat bleat', 'goat', 'goat baa', 'goat scream'],
    prompt: 'a goat bleating',
    title: /goat/i,
    ast: ['Goat', 'Bleat'],
    alike: ['sheep'],
  },
  monkey: {
    q: ['monkey', 'monkey chatter', 'monkey screech', 'chimpanzee', 'gibbon', 'howler monkey', 'monkey call', 'capuchin monkey'],
    prompt: 'a monkey screeching ooh ooh aah aah',
    title: /monkey|chimp|gibbon|macaque|baboon|primate|\bape\b/i,
  },
  bear: {
    q: ['bear growl', 'bear roar', 'grizzly bear', 'bear', 'black bear growl', 'brown bear roar', 'bear snarl', 'polar bear'],
    prompt: 'a bear growling',
    title: /\bbears?\b|grizzly|polar bear/i,
  },
  mouse: {
    q: [
      'mouse squeak',
      'mouse squeaking',
      'rat squeak',
      'mice',
      'mouse',
      'rat squeaking',
      'hamster squeak',
      'mice squeaking',
      'rodent squeak',
      'mouse squeal',
      'rat chatter',
    ],
    prompt: 'a little mouse squeaking',
    title: /mouse|mice|\brats?\b|hamster|squeak|rodent|squeal/i,
    ast: ['Mouse', 'Rodents, rats, mice'],
  },
  parrot: {
    q: ['parrot squawk', 'parrot', 'macaw', 'cockatoo', 'parrot screech', 'parrots', 'budgie', 'african grey parrot', 'lorikeet'],
    prompt: 'a parrot squawking',
    title: /parrot|macaw|cockatoo|parakeet|budgie|cockatiel|lorikeet|african grey/i,
    ast: ['Squawk', 'Bird', 'Bird vocalization, bird call, bird song'],
  },
  penguin: {
    q: ['penguin', 'penguin calling', 'penguin call', 'penguins', 'emperor penguin', 'king penguin', 'penguin colony', 'penguin squawk'],
    prompt: 'a penguin braying and squawking',
    title: /penguin|pinguin|pingouin/i,
  },
  rooster: {
    q: ['rooster crow', 'rooster', 'rooster crowing'],
    prompt: 'a rooster crowing cock-a-doodle-doo',
    title: /rooster|cockerel|\bcock\b|crow/i,
    ast: ['Crowing, cock-a-doodle-doo', 'Chicken, rooster'],
  },
  chick: {
    q: ['chick peep', 'baby chicks', 'chick', 'chicks peeping'],
    prompt: 'baby chicks peeping',
    title: /chick|peep/i,
    ast: ['Chirp, tweet', 'Bird', 'Chicken, rooster', 'Bird vocalization, bird call, bird song'],
  },
  donkey: {
    q: ['donkey bray', 'donkey', 'donkey braying', 'donkey hee haw', 'donkeys'],
    prompt: 'a donkey braying hee-haw',
    title: /donkey|\bass\b|burro|bray/i,
  },
  wolf: {
    q: ['wolf howl', 'wolf howling', 'wolf', 'wolves howling'],
    prompt: 'a wolf howling',
    title: /wolf|wolves|howl/i,
    ast: ['Howl', 'Canidae, dogs, wolves'],
  },
  snake: {
    q: ['snake hiss', 'hiss', 'snake', 'rattlesnake'],
    prompt: 'a snake hissing',
    title: /snake|hiss|rattle/i,
    ast: ['Hiss', 'Snake', 'Rattle'],
  },
  dolphin: {
    q: [
      'dolphin',
      'dolphin click',
      'dolphin whistle',
      'dolphin sounds',
      'dolphins',
      'bottlenose dolphin',
      'dolphin chirp',
      'dolphin squeak',
    ],
    prompt: 'a dolphin clicking and whistling',
    title: /dolphin|delfin|dauphin/i,
    trust: true,
  },
  bee: {
    q: ['bee buzz', 'bee buzzing', 'bee', 'bumblebee'],
    prompt: 'a bee buzzing',
    title: /\bbees?\b|bumble|wasp|buzz/i,
    ast: ['Bee, wasp, etc.', 'Buzz', 'Insect', 'Fly, housefly'],
  },
  // vehicles
  firetruck: {
    q: ['fire truck siren', 'fire engine siren', 'fire engine', 'fire truck'],
    prompt: 'a fire engine siren wailing',
    title: /siren|fire (truck|engine|brigade|department)|firetruck/i,
    ast: ['Emergency vehicle', 'Fire engine, fire truck (siren)', 'Police car (siren)', 'Ambulance (siren)', 'Siren'],
    alike: ['ambulance', 'police'],
  },
  ambulance: {
    q: ['ambulance siren', 'ambulance', 'ambulance passing'],
    prompt: 'an ambulance siren',
    title: /ambulance|siren/i,
    ast: ['Emergency vehicle', 'Fire engine, fire truck (siren)', 'Police car (siren)', 'Ambulance (siren)', 'Siren'],
    alike: ['firetruck', 'police'],
  },
  police: {
    q: ['police siren', 'police car siren', 'police car', 'police car passing'],
    prompt: 'a police car siren',
    title: /police|siren|\bcop/i,
    ast: ['Emergency vehicle', 'Fire engine, fire truck (siren)', 'Police car (siren)', 'Ambulance (siren)', 'Siren'],
    alike: ['firetruck', 'ambulance'],
  },
  car: {
    q: ['car horn', 'car horn honk', 'car honk', 'car horn beep'],
    prompt: 'a car horn honking beep beep',
    title: /horn|honk|beep/i,
    ast: ['Vehicle horn, car horn, honking', 'Toot', 'Car', 'Air horn, truck horn'],
  },
  train: {
    q: ['steam train whistle', 'train whistle', 'steam train', 'steam locomotive', 'train horn'],
    prompt: 'a steam train whistling and chugging choo choo',
    title: /train|locomotive|steam|loco\b/i,
    ast: [
      'Train',
      'Train whistle',
      'Train horn',
      'Rail transport',
      'Railroad car, train wagon',
      'Steam whistle',
      'Whistle',
      'Steam',
      'Vehicle horn, car horn, honking',
    ],
  },
  airplane: {
    q: ['airplane flyby', 'jet plane', 'airplane take off', 'plane passing', 'jet flyover'],
    prompt: 'a jet airplane engine roaring as it flies past',
    title: /plane|jet|aircraft|airliner|fly-?by|fly-?over|take-?off|boeing|airbus/i,
    ast: ['Aircraft', 'Aircraft engine', 'Jet engine', 'Fixed-wing aircraft, airplane'],
  },
  helicopter: {
    q: ['helicopter', 'helicopter flyby', 'helicopter hovering'],
    prompt: 'a helicopter with spinning rotor blades',
    title: /helicopter|chopper|\bheli/i,
    ast: ['Helicopter', 'Aircraft'],
  },
  motorbike: {
    q: ['motorcycle rev', 'motorbike', 'motorcycle engine', 'motorcycle'],
    prompt: 'a motorcycle engine revving vroom',
    title: /motor(bike|cycle)|moped|scooter|harley|\bbike/i,
    ast: ['Motorcycle', 'Engine', 'Accelerating, revving, vroom'],
  },
  bicycle: {
    q: ['bicycle bell', 'bike bell', 'bicycle bell ring'],
    prompt: 'a bicycle bell ringing ring ring',
    title: /bicycle|\bbike|bell/i,
    ast: ['Bicycle bell', 'Bell', 'Jingle bell'],
  },
  ship: {
    q: ['ship horn', 'boat horn', 'ship foghorn', 'ferry horn'],
    prompt: 'a big ship horn',
    title: /ship|boat|ferry|horn|foghorn|tug\b/i,
    ast: ['Foghorn', 'Ship', 'Boat, Water vehicle', 'Air horn, truck horn'],
  },
  tractor: {
    q: ['tractor', 'tractor engine', 'tractor idle', 'tractor starting', 'tractor diesel', 'old tractor'],
    prompt: 'a tractor engine running',
    title: /tractor/i,
    ast: ['Engine', 'Heavy engine (low frequency)', 'Medium engine (mid frequency)', 'Idling', 'Truck'],
  },
  rocket: {
    q: ['rocket launch', 'rocket', 'rocket engine', 'rocket liftoff'],
    prompt: 'a rocket launching whoosh',
    title: /rocket|launch|lift-?off/i,
    ast: ['Jet engine', 'Whoosh, swoosh, swish', 'Explosion', 'Aircraft'],
  },
  // things
  alarm: {
    q: ['alarm clock ring', 'alarm clock bell', 'alarm clock', 'alarm clock ringing'],
    prompt: 'an alarm clock bell ringing',
    title: /alarm|clock/i,
    ast: ['Alarm clock', 'Alarm'],
  },
  clock: {
    q: ['clock ticking', 'clock tick tock', 'ticking clock', 'wall clock tick'],
    prompt: 'a clock ticking tick tock',
    title: /clock|tick|watch/i,
    ast: ['Tick', 'Tick-tock', 'Clock'],
  },
  phone: {
    q: ['old telephone ring', 'telephone ring', 'rotary phone ring', 'landline phone ring'],
    prompt: 'an old telephone ringing',
    title: /phone|telephone|\bring/i,
    ast: ['Telephone bell ringing', 'Telephone', 'Ringtone'],
  },
  doorbell: {
    q: ['doorbell ding dong', 'doorbell', 'door bell'],
    prompt: 'a doorbell ding dong',
    title: /door ?bell|ding|chime/i,
    ast: ['Doorbell', 'Ding-dong'],
  },
  knock: {
    q: ['door knock', 'knocking on door', 'knock on wood door'],
    prompt: 'knocking on a wooden door',
    title: /knock/i,
    ast: ['Knock'],
    minLen: 0.5,
  },
  toilet: { q: ['toilet flush', 'toilet flushing'], prompt: 'a toilet flushing', title: /toilet|flush/i, ast: ['Toilet flush'] },
  kettle: {
    q: ['kettle whistle', 'whistling kettle', 'kettle boiling whistle', 'tea kettle'],
    prompt: 'a whistling tea kettle',
    title: /kettle/i,
  },
  balloon: {
    q: ['balloon pop', 'balloon burst', 'balloon popping'],
    prompt: 'a balloon popping',
    title: /balloon/i,
    ast: ['Burst, pop', 'Explosion'],
    minLen: 0.25,
  },
  hammer: { q: ['hammer nail', 'hammering', 'hammer'], prompt: 'a hammer hitting a nail', title: /hammer|nail/i, ast: ['Hammer'] },
  camera: {
    q: ['camera shutter', 'camera click', 'camera shutter click', 'dslr shutter'],
    prompt: 'a camera shutter click',
    title: /camera|shutter/i,
    ast: ['Camera', 'Single-lens reflex camera'],
    minLen: 0.25,
  },
  scissors: {
    q: ['scissors cutting paper', 'scissors', 'scissors snip'],
    prompt: 'scissors cutting paper snip snip',
    title: /scissor|snip|shears/i,
    ast: ['Scissors'],
  },
  keys: {
    q: ['keys jingle', 'keys', 'keychain', 'key jingle'],
    prompt: 'a bunch of keys jingling',
    title: /\bkeys?\b|keychain/i,
    ast: ['Keys jangling', 'Chink, clink', 'Jingle, tinkle'],
  },
};

mkdirSync(join(CACHE, 'src'), { recursive: true });
const META = join(CACHE, 'meta.json');
/** Freesound id -> who recorded it and what they called it, for the credits. */
const meta = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ff = (a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...a], { encoding: 'utf8' });

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

/** Short CC0 results for one search, in Freesound's relevance order. */
async function search(q, maxS, page = 1) {
  const key = join(CACHE, `search-${q.replace(/\W+/g, '_')}${maxS === MAX_SOURCE_S ? '' : `-${maxS}`}${page > 1 ? `-p${page}` : ''}.json`);
  if (existsSync(key)) return JSON.parse(readFileSync(key, 'utf8'));
  const url = new URL('https://freesound.org/search/');
  url.searchParams.set('q', q);
  if (page > 1) url.searchParams.set('page', String(page));
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
  if (!existsSync(local)) {
    const res = await get(c.mp3);
    if (!res.ok) throw new Error(`${res.status} fetching ${c.mp3}`);
    writeFileSync(local, Buffer.from(await res.arrayBuffer()));
    await sleep(200);
  }
  meta[c.id] = { user: c.user, title: c.title };
  return local;
}

/** The local path of a recording already in the cache, for pinned picks. */
export function cached(freesoundId) {
  const path = join(CACHE, 'src', `${freesoundId}.mp3`);
  if (!existsSync(path)) throw new Error(`recording ${freesoundId} is not in ${CACHE}`);
  return path;
}

/**
 * Find, download and judge. Every sound in `sources` is scored against every
 * other one — they are what each clip is compared with — but only those in
 * `todo` are searched for. Returns id -> the takes chosen, best first.
 *
 * @param {Record<string, Source>} sources
 * @param {string[]} todo
 * @returns {Promise<Record<string, Take[]>>}
 */
export async function pick(sources, todo, tag) {
  const job = [];
  for (const [id, src] of Object.entries(sources)) {
    const candidates = [];
    if (todo.includes(id)) {
      const seen = new Set();
      const lists = [];
      for (const q of src.q)
        for (let page = 1; page <= PAGES; page++) {
          const found = await search(q, src.ambience ? MAX_AMBIENCE_S : MAX_SOURCE_S, page).catch(() => []);
          // The title has to say it is the thing, and not a person doing it.
          lists.push(found.filter((c) => !src.title || (src.title.test(c.title ?? '') && !BAD_TITLE.test(c.title ?? ''))));
        }
      // Interleave the searches so the second phrasing gets a look-in.
      for (let i = 0; candidates.length < PER_ITEM && lists.some((l) => i < l.length); i++) {
        for (const l of lists) {
          const c = l[i];
          if (!c || seen.has(c.id) || candidates.length >= PER_ITEM) continue;
          seen.add(c.id);
          try {
            candidates.push({ id: c.id, path: await download(c) });
          } catch (err) {
            console.warn(`  ${id}: ${err.message}`);
          }
        }
      }
      console.log(`${id.padEnd(12)} ${candidates.length} candidates`);
    }
    job.push({
      id,
      prompt: src.prompt,
      labels: src.ast ?? [],
      alike: src.alike ?? [],
      trust: src.trust ?? false,
      maxLen: src.len,
      minLen: src.minLen,
      takes: src.takes ?? 1,
      candidates,
    });
  }
  writeFileSync(META, JSON.stringify(meta));
  if (!job.some((j) => j.candidates.length > 0)) return {};

  const jobFile = join(CACHE, `${tag}-job.json`);
  const outFile = join(CACHE, `${tag}-picks-new.json`);
  writeFileSync(jobFile, JSON.stringify({ items: job }, null, 1));
  execFileSync('uv', ['run', '-q', 'scripts/lib/pick_sounds.py', jobFile, outFile], { stdio: 'inherit' });
  const picks = JSON.parse(readFileSync(outFile, 'utf8'));
  return Object.fromEntries(Object.entries(picks).map(([id, p]) => [id, p.takes.map(withMeta)]));
}

/** @param {Take} t */
export function withMeta(t) {
  return { ...t, ...meta[t.id] };
}

/** Cut, level and encode one take into a small mono AAC file. */
export function encode(take, out, { rate = 44100, bitrate = '64k' } = {}) {
  const len = take.end - take.start;
  ff([
    '-y',
    '-ss',
    String(take.start),
    '-t',
    String(len),
    '-i',
    take.path,
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
    String(rate),
    '-c:a',
    'aac',
    '-b:a',
    bitrate,
    '-movflags',
    '+faststart',
    out,
  ]);
}

/** A credits table row. */
export function creditRow(label, t) {
  return `| ${label} | [${t.title ?? `#${t.id}`}](https://freesound.org/s/${t.id}/) | ${t.user ?? ''} | ${t.start.toFixed(2)}–${t.end.toFixed(2)} s |`;
}
