/**
 * Build the looping backgrounds for Bé tạo cảnh (src/games/ambience).
 *
 * The recordings come from iFocus (github.com/HoangTran0410/ifocus), a focus
 * timer by the same author with a big ambient-sound mixer. Those files are long
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

const REPO = 'https://raw.githubusercontent.com/HoangTran0410/ifocus/main/public/assets';
const OUT_DIR = 'public/ambience';
const CACHE = 'node_modules/.cache/be-choi-ambience';
const MANIFEST = 'src/games/ambience/files.ts';
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
 * Loop id -> iFocus file, and where in it to start (most open with a fade-in or
 * a microphone being set down). `len` caps the loop for an even texture.
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

const todo = Object.entries(SOURCES).filter(([id]) =>
  only.length ? only.includes(id) : force || !existsSync(join(OUT_DIR, `${id}.m4a`)),
);

// ---- find the beat of each, where there is one ----
// Decoded to wav first: some iFocus ".mp3" files are really AAC, which the Python
// side cannot open by itself.
const probes = [];
for (const [id, src] of todo) {
  const raw = await download(src.file);
  const from = Math.min(src.from, Math.max(0, duration(raw) - LOOP_S - FADE_S));
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
  const raw = await download(src.file);
  const total = duration(raw);
  const from = Math.min(src.from, Math.max(0, total - LOOP_S - FADE_S));
  const beat = beats[id]?.len ?? null;
  // A recording shorter than a loop (the railway clack is under four seconds) is
  // looped whole, with a seam fade to match its length.
  const len = beat ?? Math.min(src.len ?? LOOP_S, total - from - FADE_S * 0.25);
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
  ffmpeg(['-i', raw, '-filter_complex', graph, '-map', '[out]', '-ar', '44100', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out]);
  const how = beat ? `beat ${beats[id].period}s` : src.len ? 'texture' : 'long';
  console.log(`${id.padEnd(14)} ${len.toFixed(2).padStart(6)} s loop (${how}) from ${from}s of ${src.file}`);
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
console.log(`\n${built.length}/${Object.keys(SOURCES).length} loops in ${OUT_DIR}.`);
