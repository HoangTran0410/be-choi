/**
 * Where the instrument recordings come from, and the cache they are downloaded to.
 *
 * Only CC0 / public-domain sources:
 *   - VCSL, the Versilian Community Sample Library (github.com/sgossner/VCSL): CC0 1.0
 *   - VSCO 2 Community Edition (github.com/sgossner/VSCO-2-CE): CC0 1.0
 *   - Freesound, filtered to "Creative Commons 0" in the search itself, the way
 *     scripts/lib/freesound.mjs does it (its search page, no API key).
 *
 * Raw downloads live OUTSIDE the repo (INSTRUMENT_CACHE, default ~/.cache/be-choi-instruments):
 * the VCSL files are tens of megabytes each and are only ever needed to rebuild.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CACHE = process.env.INSTRUMENT_CACHE ?? join(homedir(), '.cache', 'be-choi-instruments');
mkdirSync(join(CACHE, 'raw'), { recursive: true });
const UA = 'Mozilla/5.0 (be-choi instrument sample builder; offline toddler app)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, as = 'buffer') {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return as === 'text' ? res.text() : as === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
      if (res.status === 404 || attempt >= 3) throw new Error(`${res.status} ${url}`);
    } catch (err) {
      if (attempt >= 3 || /^404|^403/.test(err.message)) throw err;
    }
    await sleep(3000 * (attempt + 1));
  }
}

/** The two GitHub libraries: file tree (cached) and where a file lives. */
export const LIBS = {
  vcsl: {
    repo: 'sgossner/VCSL',
    name: 'Versilian Community Sample Library (VCSL)',
    author: 'Versilian Studios LLC and contributors',
    license: 'CC0 1.0',
    url: 'https://github.com/sgossner/VCSL',
  },
  vsco: {
    repo: 'sgossner/VSCO-2-CE',
    name: 'VSCO 2 Community Edition',
    author: 'Versilian Studios LLC (Sam Gossner) and contributors',
    license: 'CC0 1.0',
    url: 'https://github.com/sgossner/VSCO-2-CE',
  },
};

const trees = {};
export async function tree(lib) {
  if (trees[lib]) return trees[lib];
  const file = join(CACHE, `${lib}-tree.json`);
  if (!existsSync(file)) {
    const t = await get(`https://api.github.com/repos/${LIBS[lib].repo}/git/trees/master?recursive=1`, 'json');
    if (t.truncated) throw new Error(`${lib} tree truncated`);
    writeFileSync(file, JSON.stringify(t));
  }
  trees[lib] = JSON.parse(readFileSync(file, 'utf8'))
    .tree.filter((e) => e.type === 'blob' && /\.(wav|flac)$/i.test(e.path))
    .map((e) => e.path);
  return trees[lib];
}

/** Download (once) a file of a GitHub library; returns the local path. */
export async function fetchLib(lib, path) {
  const local = join(CACHE, 'raw', `${lib}-${path.replace(/[^\w.#-]+/g, '_')}`);
  if (!existsSync(local)) {
    const url = `https://raw.githubusercontent.com/${LIBS[lib].repo}/master/${path.split('/').map(encodeURIComponent).join('/')}`;
    writeFileSync(local, await get(url));
  }
  return local;
}

// ---------------------------------------------------------------- Freesound

const searches = {};
/** CC0 results of a Freesound search (id, user, title, duration, preview mp3). */
async function freesoundSearch(q) {
  if (searches[q]) return searches[q];
  const file = join(CACHE, `fs-search-${q.replace(/\W+/g, '_')}.json`);
  if (existsSync(file)) return (searches[q] = JSON.parse(readFileSync(file, 'utf8')));
  const url = new URL('https://freesound.org/search/');
  url.searchParams.set('q', q);
  url.searchParams.set('f', 'license:"Creative Commons 0"');
  const html = await get(url, 'text');
  const out = [];
  for (const m of html.matchAll(/<div\s+class="bw-player"([\s\S]*?)tabindex/g)) {
    const attr = (k) => new RegExp(`data-${k}="([^"]*)"`).exec(m[1])?.[1];
    out.push({
      id: attr('sound-id'),
      user: attr('username'),
      title: attr('title')?.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"'),
      duration: Number(attr('duration')),
      mp3: attr('mp3')?.replace('-lq.mp3', '-hq.mp3'),
    });
  }
  writeFileSync(file, JSON.stringify(out));
  await sleep(800);
  return (searches[q] = out);
}

/** Look a Freesound id up through the search `q` that lists it, download its preview, return { path, meta }. */
export async function fetchFreesound(id, q) {
  const hit = (await freesoundSearch(q)).find((r) => r.id === String(id));
  if (!hit) throw new Error(`freesound ${id} is not in the CC0 results of "${q}"`);
  const local = join(CACHE, 'raw', `fs-${id}.mp3`);
  if (!existsSync(local)) {
    writeFileSync(local, await get(hit.mp3));
    await sleep(300);
  }
  return { path: local, meta: { user: hit.user, title: hit.title, url: `https://freesound.org/s/${id}/` } };
}

export async function searchFreesound(q) {
  return freesoundSearch(q);
}
