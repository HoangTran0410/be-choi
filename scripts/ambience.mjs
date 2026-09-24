/**
 * Build the looping backgrounds for Bé tạo cảnh (src/games/ambience).
 *
 * Most recordings come from iFocus (github.com/HoangTran0410/ifocus), a focus
 * timer by the same author with a big ambient-sound mixer. What iFocus does not
 * have (a purring cat, a farmyard, a carnival) is found among the CC0 uploads on
 * Freesound by scripts/lib/freesound.mjs, which plays the candidates to an audio
 * model and keeps the recording, and the stretch of it, that is most clearly
 * that scene. Either way the files are long
 * (two to ten minutes, stereo, up to 19 MB each) — far too much for a phone to
 * download, let alone decode, several at once. So each one is cut down to the
 * shortest mono loop that still sounds like the whole thing, and made seamless:
 *
 *   - anything with a beat (a clock, a train on the rails, a cricket) is measured
 *     by scripts/lib/find_loop.py and cut to a whole number of its periods — a few
 *     seconds instead of thirty copies of the same tick-tock;
 *   - an even texture (rain, wind, a fan, noise) needs only `len` seconds, since
 *     one stretch of rain is much like the next;
 *   - everything else (birds, a street, a kitchen) keeps a long loop so the same
 *     bird does not sing the same phrase every few seconds.
 *
 * The tail of each cut is crossfaded into its head, so when the loop wraps round
 * the sound carries straight on instead of clicking or stopping for breath.
 *
 *   node scripts/ambience.mjs            build what is missing
 *   node scripts/ambience.mjs rain owl   rebuild just these
 *   node scripts/ambience.mjs --force    rebuild everything
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pick, withMeta } from './lib/freesound.mjs';

const REPO = 'https://raw.githubusercontent.com/HoangTran0410/ifocus/main/public/assets';
const OUT_DIR = 'public/ambience';
const CACHE = 'node_modules/.cache/be-choi-ambience';
const MANIFEST = 'src/games/ambience/files.ts';
const CREDITS = join(OUT_DIR, 'CREDITS.md');
/** Which Freesound recording each loop was cut from, kept between runs for the credits. */
const PICKS = join(CACHE, 'freesound-picks.json');
/** Seconds of loop, unless it has a beat or a shorter `len`. Long enough that a bird does not sing the same phrase every few seconds. */
const LOOP_S = 30;
/** Seconds of crossfade at the seam. */
const FADE_S = 3;
/** A loop cut on its own beat lines up with itself: a short blend hides the join. */
const BEAT_FADE_S = 0.08;
/** How much of each recording the beat finder listens to. */
const PROBE_S = 100;
/** Textures: this much rain, wind or hum is as good as thirty seconds of it. */
const TEXTURE_S = 12;
/** Backgrounds sit well under the house level: they are a bed, not an event. */
const TARGET_LUFS = -26;

/**
 * Loop id -> where it comes from. `len` caps the loop for an even texture;
 * `beat: false` keeps a tune whole instead of cutting it to its beat.
 *
 *   { file, from }         an iFocus file, and where in it to start (most open
 *                          with a fade-in or a microphone being set down);
 *   { freesound: { q, prompt } }
 *                          Freesound searches, best first, and what the model is
 *                          asked to hear; it also picks where to start.
 */
const SOURCES = {
  rain: { file: 'rain.mp3', from: 10, len: TEXTURE_S },
  'heavy-rain': { file: 'heavy-rain.mp3', from: 10, len: TEXTURE_S },
  thunder: { file: 'thunder.mp3', from: 20 },
  wind: { file: 'winds.mp3', from: 10, len: TEXTURE_S },
  campfire: { file: 'campfire.mp3', from: 4 },
  firework: { file: 'firework.mp3', from: 10 },
  ocean: { file: 'ocean-waves.mp3', from: 20 },
  river: { file: 'river-flow.mp3', from: 10, len: TEXTURE_S },
  underwater: { file: 'underwater.mp3', from: 2, len: TEXTURE_S },
  bubble: { file: 'bubble.mp3', from: 5, len: TEXTURE_S },
  whale: { file: 'whale.mp3', from: 2 },
  bird: { file: 'bird.mp3', from: 10 },
  'morning-bird': { file: 'morning-bird.mp3', from: 10 },
  cricket: { file: 'cricket.mp3', from: 10 },
  frog: { file: 'frog.mp3', from: 10 },
  owl: { file: 'owl.mp3', from: 10 },
  chicken: { file: 'chicken.mp3', from: 0 },
  jungle: { file: 'night-jungle.mp3', from: 10 },
  chime: { file: 'wind-chime.mp3', from: 0 },
  clock: { file: 'old-clock.mp3', from: 5 },
  fan: { file: 'ceiling-fan.mp3', from: 0, len: TEXTURE_S },
  book: { file: 'book-page-turn.mp3', from: 10 },
  kitchen: { file: 'kitchen.mp3', from: 10 },
  sleep: { file: 'soft-brown-noise.mp3', from: 30, len: TEXTURE_S },
  city: { file: 'city-traffic.mp3', from: 10 },
  train: { file: 'railway.mp3', from: 0 },
  airplane: { file: 'airplane.mp3', from: 10 },
  tractor: { file: 'tractor.mp3', from: 20 },
  restaurant: { file: 'restaurant.mp3', from: 10 },
  countryside: { file: 'countryside.mp3', from: 5 },
  waterfall: { file: 'waterflow.mp3', from: 20, len: TEXTURE_S },
  drawing: { file: 'pencil-drawing.mp3', from: 5 },
  typing: { file: 'keyboard-soft.mp3', from: 5 },
  coffee: { file: 'coffee.mp3', from: 15 },
  temple: { file: 'indian-temple.mp3', from: 5 },
  snow: {
    freesound: {
      q: ['winter wind snow', 'snowy winter ambience', 'sleigh bells wind'],
      prompt: 'gentle winter wind with distant sleigh bells, calm and quiet',
    },
    len: TEXTURE_S,
  },
  seagull: {
    freesound: {
      q: ['seagulls harbour', 'seagulls beach ambience', 'gulls seaside'],
      prompt: 'seagulls calling at a seaside harbour',
    },
  },
  bees: {
    freesound: {
      q: ['bees buzzing flowers', 'bees garden', 'beehive buzzing'],
      prompt: 'bees buzzing in a summer flower garden',
    },
  },
  cat: {
    freesound: {
      q: ['cat purring', 'cat purr close', 'purring'],
      prompt: 'a cat purring close up',
    },
    // A purr is a texture, and the long uploads of one have the cat meowing in them.
    len: TEXTURE_S,
  },
  farm: {
    freesound: {
      q: ['farm ambience animals', 'farmyard cows sheep chickens', 'barnyard ambience'],
      prompt: 'a farmyard with cows mooing, sheep bleating and chickens clucking',
    },
  },
  rainforest: {
    freesound: {
      // Not "monkeys": that finds howler monkeys, which roar.
      q: ['rainforest ambience birds', 'tropical jungle birds daytime', 'amazon rainforest ambience'],
      prompt: 'a tropical rainforest with exotic birds calling',
    },
  },
  musicbox: {
    freesound: {
      // Not plain "music box": that finds broken, detuned ones as well.
      q: ['music box lullaby', 'music box melody', 'music box waltz'],
      prompt: 'a music box playing a gentle melody',
    },
    beat: false,
  },
  heartbeat: {
    freesound: {
      // Not "heart beat calm": that finds a hospital monitor beeping along.
      q: ['slow heartbeat', 'quiet heartbeat', 'heartbeat loop'],
      prompt: 'a calm slow human heartbeat, lub-dub, and nothing else',
    },
  },
  bath: {
    freesound: {
      q: ['bathtub water splashing', 'bath water splash', 'bath bubbles'],
      prompt: 'water splashing playfully in a bathtub',
    },
    len: TEXTURE_S,
  },
  playground: {
    freesound: {
      q: ['playground children playing', 'kids playing laughing park', 'children playground ambience'],
      prompt: 'children playing and laughing at a playground',
    },
  },
  carnival: {
    freesound: {
      q: ['carousel organ', 'fairground ambience', 'merry go round music'],
      prompt: 'a fairground carnival with a merry-go-round organ playing',
    },
  },
  space: {
    freesound: {
      // Soft synth pads rather than "sci-fi": those are black holes and alarms.
      q: ['ambient synth pad', 'dreamy ambient pad', 'space ambience calm'],
      prompt: 'calm ambient space drone, soft and dreamy',
    },
    len: TEXTURE_S,
  },
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
for (const id of only) if (!SOURCES[id]) throw new Error(`unknown loop: ${id}`);

mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const run = (cmd, a) => execFileSync(cmd, a, { encoding: 'utf8' });
const ffmpeg = (a) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
const duration = (f) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim());

async function download(file) {
  const local = join(CACHE, file);
  if (existsSync(local)) return local;
  const res = await fetch(`${REPO}/${file}`);
  if (!res.ok) throw new Error(`${res.status} fetching ${file}`);
  writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  return local;
}

const todo = Object.entries(SOURCES).filter(([id]) => (only.length ? only.includes(id) : force || !existsSync(join(OUT_DIR, `${id}.m4a`))));

// ---- choose the Freesound recordings ----
// Every Freesound scene goes to the model together, even when only one is being
// rebuilt: each clip is judged by how much more it is *this* scene than any of
// the others, so the others have to be there to be compared with.
const picks = existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, 'utf8')) : {};
const fsSources = Object.fromEntries(
  Object.entries(SOURCES)
    .filter(([, src]) => src.freesound)
    .map(([id, src]) => {
      const len = src.len ?? LOOP_S;
      // A short upload is not a background: a cut much shorter than the loop loses
      // score, so the model looks for a recording long enough to be one.
      return [id, { ...src.freesound, len, minLen: len * 0.8, ambience: true }];
    }),
);
const fsTodo = todo.filter(([, src]) => src.freesound).map(([id]) => id);
if (fsTodo.length) {
  for (const [id, takes] of Object.entries(await pick(fsSources, fsTodo, 'ambience'))) if (takes[0]) picks[id] = takes[0];
  writeFileSync(PICKS, JSON.stringify(picks, null, 1));
}

/** The recording a loop is cut from, where to start, and what to call it in the log. */
async function source(id, src) {
  if (!src.freesound) return { raw: await download(src.file), start: src.from, name: src.file };
  const p = picks[id];
  if (!p) throw new Error(`${id}: nothing usable on Freesound`);
  return { raw: p.path, start: p.start, name: `freesound #${p.id}` };
}

/**
 * Start late enough in the recording to skip its fade-in, early enough that a
 * whole loop and its seam still fit. Where the model chose the start, it is kept
 * even if the loop has to be shorter: what came before it was judged and passed
 * over (a meow before the purr, the winding of a music box).
 */
function startIn(src, start, total) {
  if (src.freesound) return start;
  return Math.min(start, Math.max(0, total - (src.len ?? LOOP_S) - FADE_S));
}

// ---- find the beat of each, where there is one ----
// Decoded to wav first: some iFocus ".mp3" files are really AAC, which the Python
// side cannot open by itself. A texture is not asked: the swell of a drone can
// look like a beat to the finder, and three seconds of it heard over and over is
// not a drone any more. Nor is a tune (`beat: false`): its notes fall on a beat,
// but five notes of a lullaby round and round are not the lullaby.
const probes = [];
for (const [id, src] of todo) {
  if (src.len || src.beat === false) continue;
  const { raw, start } = await source(id, src);
  const from = startIn(src, start, duration(raw));
  const wav = join(CACHE, `${id}-probe.wav`);
  ffmpeg(['-ss', String(from), '-t', String(PROBE_S), '-i', raw, '-ac', '1', '-ar', '22050', wav]);
  probes.push({ id, path: wav, from: 0 });
}
const beats = {};
if (probes.length) {
  const job = join(CACHE, 'loops-job.json');
  const out = join(CACHE, 'loops.json');
  writeFileSync(job, JSON.stringify({ items: probes }));
  execFileSync('uv', ['run', '-q', 'scripts/lib/find_loop.py', job, out], { stdio: 'inherit' });
  Object.assign(beats, JSON.parse(readFileSync(out, 'utf8')));
}

for (const [id, src] of todo) {
  const out = join(OUT_DIR, `${id}.m4a`);
  const { raw, start, name } = await source(id, src);
  const total = duration(raw);
  const from = startIn(src, start, total);
  const beat = beats[id]?.len ?? null;
  // A recording shorter than a loop (the railway clack is under four seconds) is
  // looped whole, with a seam fade to match its length. A Freesound upload can be
  // only a little longer than the loop: it is cut shorter so that the seam's
  // tail (a quarter of the loop at most) is still there to fade in over the head.
  const room = total - from;
  const fits = src.freesound ? Math.max(room - FADE_S, room / 1.25) : room - FADE_S * 0.25;
  const len = beat ?? Math.min(src.len ?? LOOP_S, fits);
  const fade = beat ? BEAT_FADE_S : Math.min(FADE_S, len / 4);
  // head: the loop body; tail: what came right after it, faded out and laid over
  // the head's fade-in, so the end of the loop runs straight into its start.
  const graph = [
    `[0:a]aformat=channel_layouts=mono,highpass=f=60,atrim=${from}:${from + len + fade},asetpts=PTS-STARTPTS,asplit=3[a][b][c]`,
    `[a]atrim=0:${fade},asetpts=PTS-STARTPTS,afade=t=in:d=${fade}[head]`,
    `[b]atrim=${fade}:${len},asetpts=PTS-STARTPTS[body]`,
    `[c]atrim=${len}:${len + fade},asetpts=PTS-STARTPTS,afade=t=out:d=${fade}[tail]`,
    `[head][tail]amix=inputs=2:normalize=0:duration=first[seam]`,
    `[seam][body]concat=n=2:v=0:a=1,loudnorm=I=${TARGET_LUFS}:TP=-3:LRA=15,alimiter=limit=0.8:level=disabled[out]`,
  ].join(';');
  ffmpeg([
    '-i',
    raw,
    '-filter_complex',
    graph,
    '-map',
    '[out]',
    '-ar',
    '44100',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-movflags',
    '+faststart',
    out,
  ]);
  const how = beat ? `beat ${beats[id].period}s` : src.len ? 'texture' : 'long';
  console.log(`${id.padEnd(14)} ${len.toFixed(2).padStart(6)} s loop (${how}) from ${from}s of ${name}`);
}

const built = Object.keys(SOURCES).filter((id) => existsSync(join(OUT_DIR, `${id}.m4a`)));
writeFileSync(
  MANIFEST,
  `/**
 * Which loops have been built, as \`public/ambience/<id>.m4a\`.
 *
 * Generated by \`node scripts/ambience.mjs\`. Do not edit by hand.
 */
export const LOOP_IDS: ReadonlySet<string> = new Set([
${built.map((id) => `  '${id}',`).join('\n')}
]);

/** Where one loop lives, relative to the app root. */
export function loopUrl(id: string): string {
  return \`ambience/\${id}.m4a\`;
}
`,
);

// ---- credits ----
const fsBuilt = built.filter((id) => SOURCES[id].freesound && picks[id]);
const row = (id) => {
  const t = withMeta(picks[id]);
  return `| ${id} | [${t.title ?? `#${t.id}`}](https://freesound.org/s/${t.id}/) | ${t.user ?? ''} |`;
};
writeFileSync(
  CREDITS,
  `# Âm thanh nền của trò Bé tạo cảnh

Cắt từ bộ âm thanh nền của [iFocus](https://github.com/HoangTran0410/ifocus) (\`public/assets/*.mp3\`),
thành vòng lặp 30 giây liền mạch bằng \`node scripts/ambience.mjs\`. Nguồn gốc và giấy phép của từng
file gốc theo iFocus.

## Freesound

Những cảnh iFocus không có được cắt từ các bản ghi **CC0** (public domain) trên
[Freesound](https://freesound.org), chọn bằng cùng script. CC0 không bắt buộc ghi công; bảng
này để biết mỗi vòng lặp từ đâu ra và thay được khi cần.

| Cảnh | Bản gốc | Người thu |
|---|---|---|
${fsBuilt.map(row).join('\n')}
`,
);
console.log(`\n${built.length}/${Object.keys(SOURCES).length} loops in ${OUT_DIR}.`);
