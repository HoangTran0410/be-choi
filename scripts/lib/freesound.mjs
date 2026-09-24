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
const PER_ITEM = 12;
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
 * @typedef {{ q: string[], prompt: string, len: number, ambience?: boolean, takes?: number, minLen?: number }} Source
 * @typedef {{ id: string, start: number, end: number, score: number, path: string, user?: string, title?: string }} Take
 */

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
async function search(q, maxS) {
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
      for (const q of src.q) lists.push(await search(q, src.ambience ? MAX_AMBIENCE_S : MAX_SOURCE_S));
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
    job.push({ id, prompt: src.prompt, maxLen: src.len, minLen: src.minLen, takes: src.takes ?? 1, candidates });
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
