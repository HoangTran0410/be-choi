// Record every line the app speaks with a natural Vietnamese voice, so devices with a poor
// Vietnamese text-to-speech voice (the iPad above all) hear a real-sounding one.
//
//   node scripts/voice-inventory.mjs          # 1. list the lines (scripts/voice-inventory.json)
//   node scripts/voice-clips.mjs [--limit N] [--encode-only]  # 2. render, trim, level and encode them
//
// Output: public/voice/<hash>.m4a + public/voice/manifest.json ({ v, clips: { hash: ms } }).
// The hash is clipHash(voiceKey(text)), the same function src/core/voiceClips.ts uses.
// Raw renders are cached in ~/.cache/be-choi-voice, so a rerun only renders new lines.
// Needs ffmpeg and uv. Voice: VOICE=vi-VN-HoaiMyNeural (default) via edge-tts.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { clipHash, voiceKey } from './lib/voicekey.mjs';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VOICE = process.env.VOICE ?? 'vi-VN-HoaiMyNeural';
const CACHE = join(homedir(), '.cache', 'be-choi-voice', VOICE);
const OUT = join(ROOT, 'public', 'voice');
const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

/** Names (slow rate in the app) are said slower and clearer; talk a little slower than adult speech. */
const NAME_RATE = '-22%';
const TALK_RATE = '-10%';
const PITCH = '+6Hz';
const LUFS = -18;

/**
 * What to actually feed the voice when the line on screen is not how it is said. A bare
 * capital letter is the letter's Vietnamese name (as src/games/letters/logic.ts names it):
 * a voice reading "Ă" alone guesses, a voice reading "á" does not.
 */
const LETTER_NAMES = {
  A: 'a', Ă: 'á', Â: 'ớ', B: 'bê', C: 'xê', D: 'dê', Đ: 'đê', E: 'e', Ê: 'ê', G: 'giê', H: 'hát', I: 'i', K: 'ca',
  L: 'e lờ', M: 'em mờ', N: 'en nờ', O: 'o', Ô: 'ô', Ơ: 'ơ', P: 'pê', Q: 'quy', R: 'e rờ', S: 'ét xì', T: 'tê', U: 'u',
  Ư: 'ư', V: 'vê', X: 'ích xì', Y: 'i dài',
};
function sayAs(text) {
  const t = text.trim();
  return LETTER_NAMES[t] ?? t;
}

/** Lines worth recording: real Vietnamese words, no printf holes, no symbols-only labels. */
function speakable(text) {
  return /\p{L}/u.test(text) && !/[%$`{}<>·]|\\/.test(text) && !/[\p{Extended_Pictographic}✓✗]/u.test(text) && text.length <= 120;
}

const inv = JSON.parse(readFileSync(join(ROOT, 'scripts', 'voice-inventory.json'), 'utf8'));
const seen = new Map();
for (const p of inv.parts) {
  if (!speakable(p.text)) continue;
  const key = voiceKey(p.text);
  if (!key || seen.has(key)) continue;
  const slow = (p.rates ?? []).some((r) => r <= 0.7);
  seen.set(key, { key, text: sayAs(p.text), hash: clipHash(key), rate: slow ? NAME_RATE : TALK_RATE });
}
// Extra lines: whole sentences ctx.speak() says without splitting, lines only heard in the
// runtime pass, and the fixed fragments of sentences built at run time ("Có" … "quả chuối"),
// which voiceClips.ts stitches together when the whole sentence has no clip.
const NUMBER_WORDS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười', 'mười một', 'mười hai', 'mười ba', 'mười bốn', 'mười lăm', 'mười sáu', 'mười bảy', 'mười tám', 'mười chín', 'hai mươi'];
const extra = [
  ...(inv.wholeSpeak ?? []),
  ...NUMBER_WORDS,
  ...(inv.templatesUnexpanded ?? []).filter((t) => t.tier !== 'maybe').flatMap((t) => t.fragments ?? []),
];
try {
  const log = JSON.parse(readFileSync(join(ROOT, 'scripts', 'voice-runtime-log.json'), 'utf8'));
  for (const u of log) if (u.lang?.startsWith('vi') && u.text) extra.push(u.text);
} catch {
  /* no runtime pass yet */
}
for (const t of extra) {
  const text = t.trim().replace(/^[,·\s]+|[,·\s]+$/gu, '');
  if (!speakable(text)) continue;
  const key = voiceKey(text);
  if (key && !seen.has(key)) seen.set(key, { key, text: sayAs(text), hash: clipHash(key), rate: TALK_RATE });
}
const lines = [...seen.values()].slice(0, limit);
const hashes = new Map();
for (const l of lines) {
  const other = hashes.get(l.hash);
  if (other && other !== l.key) throw new Error(`hash clash: "${other}" / "${l.key}"`);
  hashes.set(l.hash, l.key);
}
console.log(`${lines.length} lines (${inv.parts.length - seen.size} skipped as unspeakable or duplicate)`);

// 1. Render (cached).
mkdirSync(CACHE, { recursive: true });
// Cached by what is actually said and how fast, so a changed pronunciation renders again.
const raw = (l) => join(CACHE, `${clipHash(l.text)}${l.rate === NAME_RATE ? 'n' : 't'}.mp3`);
const jobs = lines.filter((l) => !existsSync(raw(l))).map((l) => ({ text: l.text, out: raw(l), voice: VOICE, rate: l.rate, pitch: PITCH }));
// --encode-only: package what is already rendered (e.g. while a long render is still running).
if (jobs.length && !args.includes('--encode-only')) {
  const jf = join(CACHE, 'jobs.json');
  writeFileSync(jf, JSON.stringify(jobs));
  console.log(`rendering ${jobs.length} new lines with ${VOICE}…`);
  const { stdout, stderr } = await run('uv', ['run', '-q', '--with', 'edge-tts', 'python', '-I', join(ROOT, 'scripts', 'lib', 'edge_tts_batch.py'), jf], {
    maxBuffer: 64 << 20,
    env: { ...process.env, CONC: process.env.CONC ?? '4' },
  });
  console.log(stdout.trim().split('\n').pop());
  if (stderr.trim()) console.warn(stderr.trim().split('\n').slice(-5).join('\n'));
}

// 2. Trim silence, level, encode small mono AAC.
mkdirSync(OUT, { recursive: true });
async function durMs(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Math.round(Number(stdout.trim()) * 1000);
}
async function encode(l) {
  const out = join(OUT, `${l.hash}.m4a`);
  if (!existsSync(raw(l))) return null;
  if (!existsSync(out) || statSync(out).mtimeMs < statSync(raw(l)).mtimeMs) {
    await run('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      raw(l),
      '-af',
      [
        'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03',
        'areverse',
        'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06',
        'areverse',
        'highpass=f=80',
        `loudnorm=I=${LUFS}:TP=-1.5:LRA=11`,
        'afade=t=in:d=0.01',
      ].join(','),
      '-ac',
      '1',
      '-ar',
      '24000',
      '-c:a',
      'aac',
      '-b:a',
      '32k',
      '-movflags',
      '+faststart',
      out,
    ]);
  }
  return [l.hash, await durMs(out)];
}
const clips = {};
let i = 0;
let failed = 0;
async function worker() {
  while (i < lines.length) {
    const l = lines[i++];
    try {
      const r = await encode(l);
      if (r) clips[r[0]] = r[1];
      else failed++;
    } catch (e) {
      failed++;
      console.warn('encode failed:', l.text, String(e).slice(0, 120));
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

// Drop clips no longer in the inventory.
const keep = new Set(Object.keys(clips));
let removed = 0;
for (const f of readdirSync(OUT)) {
  const m = /^([0-9a-f]{8})\.m4a$/.exec(f);
  if (m && !keep.has(m[1])) {
    rmSync(join(OUT, f));
    removed++;
  }
}
const sorted = Object.fromEntries(Object.entries(clips).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ v: 1, voice: VOICE, clips: sorted }) + '\n');
const bytes = readdirSync(OUT).reduce((n, f) => n + readFileSync(join(OUT, f)).length, 0);
console.log(`clips ${keep.size} · missing ${failed} · removed ${removed} · ${(bytes / 1048576).toFixed(1)} MB`);
