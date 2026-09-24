/**
 * The shelves of Xem nhạc: calm music and slow scenery on YouTube, borrowed
 * from iFocus (its "Recommended - No Copyright Music" list and its Scene >
 * Video backgrounds), plus whatever a parent pastes in, and the one fiddly bit
 * of the game — turning whatever a parent pastes into something we can embed.
 */

/** Something YouTube can play: a video, a playlist, or a video inside a playlist. */
export interface YouTubeRef {
  /** 11-character video id. */
  video?: string;
  /** Playlist id (`PL…`, `OL…`, `RD…` …). */
  list?: string;
}

export interface Video {
  /** YouTube video id; also the card's thumbnail. */
  id: string;
  /** Shown when the thumbnail cannot load (offline) and as the card's name. */
  emoji: string;
  /** Vietnamese name for the parent reading over the child's shoulder. */
  title: string;
}

export interface Shelf {
  id: string;
  /** Tab button face. */
  icon: string;
  name: string;
  videos: readonly Video[];
}

export const SHELVES: readonly Shelf[] = [
  {
    // iFocus "Recommended - No Copyright Music".
    id: 'calm',
    icon: '🎵',
    name: 'Nhạc êm',
    videos: [
      { id: 'DSWYAclv2I8', emoji: '🌅', title: 'Chân trời vàng' },
      { id: 'rKi3oL2UDew', emoji: '🌇', title: 'Chiều tím' },
      { id: 'zde7oFYW4Zg', emoji: '🏙️', title: 'Thành phố mơ' },
      { id: 'w4oLP7fa9Vk', emoji: '🍃', title: 'Gió nhẹ' },
      { id: 'BWNx0VQJjMY', emoji: '🌙', title: 'Ánh trăng' },
      { id: '1t1Rp9Nx--M', emoji: '🌃', title: 'Phố đêm' },
      { id: 'hCtwi8XkB4o', emoji: '🌦️', title: 'Mưa nhẹ' },
      { id: 'tzhKxUxsIJs', emoji: '⛵', title: 'Bến cảng' },
      { id: 'VwiHerRkCvk', emoji: '🔥', title: 'Bếp lửa' },
      { id: 'Abc-M-X3jmQ', emoji: '🌌', title: 'Cực quang' },
      { id: '4yiEbIeCOA4', emoji: '🌄', title: 'Buổi sáng' },
      { id: 'F44Va0ErrFQ', emoji: '👣', title: 'Bước chân nhẹ' },
      { id: 'hw4-LDKcDmU', emoji: '🐚', title: 'Biển hát ru' },
      { id: 'NHXqL4MRpbM', emoji: '🐦', title: 'Bình minh' },
    ],
  },
  // The rest are iFocus's Scene > Video backgrounds, sorted by what is on screen.
  {
    id: 'lofi',
    icon: '🎧',
    name: 'Lofi',
    videos: [
      { id: 'jfKfPfyJRdk', emoji: '📚', title: 'Cô bé Lofi' },
      { id: 'q8nPaqfRm_c', emoji: '🚆', title: 'Tàu Nhật Bản' },
      { id: '-Xh4BNbxpI8', emoji: '🌆', title: 'Thành phố đêm' },
      { id: '4UOOcSfkbQQ', emoji: '🚗', title: 'Lái xe lúc hoàng hôn' },
      { id: 'wVKDb9RTkrI', emoji: '🎧', title: 'Lofi The Weeknd' },
      { id: 'mT4g0paZ5gI', emoji: '🎹', title: 'Lofi mộc' },
      { id: '5ZYZ5HeuNsg', emoji: '⛏️', title: 'Nhạc C418' },
      { id: 'kLvZUXtVXQ0', emoji: '🐱', title: 'Mèo tím' },
      { id: 'IfYjuHnAAFU', emoji: '🎤', title: 'Sơn Tùng M-TP' },
    ],
  },
  {
    id: 'rain',
    icon: '🌧️',
    name: 'Mưa rơi',
    videos: [
      { id: 'HXvFSwm-ITo', emoji: '☔', title: 'Ngày mưa' },
      { id: 'JbJ0sYt9Nyk', emoji: '🌧️', title: 'Mưa êm' },
      { id: 'yIQd2Ya0Ziw', emoji: '💧', title: 'Mưa rì rào' },
      { id: '0dcFWLV_OlI', emoji: '⛈️', title: 'Mưa to' },
    ],
  },
  {
    id: 'relax',
    icon: '🐠',
    name: 'Thư giãn',
    videos: [
      { id: '8HDjaAV_12s', emoji: '🏖️', title: 'Bãi biển' },
      { id: 'ZMOjfn-wyOQ', emoji: '🌊', title: 'Biển tím' },
      { id: 'zuCRSwWssVk', emoji: '😌', title: 'Thư giãn' },
      { id: 'XVkADAwOXnU', emoji: '🐠', title: 'Bể cá' },
      { id: 'qgfd-uWTVwg', emoji: '🚶', title: 'Đi dạo' },
      { id: '2AH5t_o7lmg', emoji: '🛣️', title: 'Con đường' },
      { id: 'UYmvFzDuO5k', emoji: '✨', title: 'Cảnh đẹp' },
      { id: 'WHqbqzqeskw', emoji: '🪐', title: 'Vũ trụ' },
      { id: '4qArfv4C2Lg', emoji: '🧧', title: 'Tết' },
    ],
  },
  {
    id: 'views',
    icon: '🏔️',
    name: 'Phong cảnh',
    videos: [
      { id: 'Riqc0t4HA0Q', emoji: '🌲', title: 'Rừng cây cao' },
      { id: 'NGFFNsxQ-Mg', emoji: '🏜️', title: 'Chân trời Sonoma' },
      { id: 'jS3veX19cxk', emoji: '🌾', title: 'Chiều Sonoma' },
      { id: 'OrLMdAT4zIY', emoji: '🌞', title: 'Hoàng hôn' },
      { id: 'oH0npaIHSfA', emoji: '🕌', title: 'Dubai' },
      { id: '6AcnOJcM8oo', emoji: '🏔️', title: 'Himalaya' },
      { id: 'zQVWAfpRvZg', emoji: '🏞️', title: 'Hồ nước' },
      { id: 'CGgj95GhG0k', emoji: '🍵', title: 'Đồi chè' },
    ],
  },
];

/** Every ready-made video, across shelves. */
export function allVideos(): Video[] {
  return SHELVES.flatMap((s) => s.videos);
}

// ---- links ----

const VIDEO_ID = /^[\w-]{11}$/;
const LIST_ID = /^[\w-]{10,64}$/;
/** Paths whose next segment is the video id: `/shorts/<id>`, `/embed/<id>` … */
const ID_PATHS = new Set(['shorts', 'embed', 'live', 'v', 'e']);

function isYouTubeHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtube-nocookie.com' || h.endsWith('.youtube-nocookie.com');
}

/**
 * What a pasted link points at, or null when it is not YouTube.
 *
 * Parents paste whatever their phone's share sheet hands them: `youtu.be`
 * short links with `?si=` trackers, `m.` and `music.` hosts, Shorts, live
 * streams, embed links, sometimes a whole "Watch this: https://…" sentence, and
 * now and then just the bare id. All of those should work.
 */
export function parseYouTube(input: string): YouTubeRef | null {
  const text = input.trim();
  if (VIDEO_ID.test(text)) return { video: text };

  // The first thing that looks like a link, so share-sheet text around it does not matter.
  const found = text.match(/(?<![\w.-])(?:https?:\/\/)?(?:[\w-]+\.)*(?:youtube(?:-nocookie)?\.com|youtu\.be)\/\S*/i)?.[0];
  if (!found) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(found) ? found : `https://${found}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let video: string | undefined;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    video = parts[0];
  } else if (isYouTubeHost(host)) {
    if (parts[0] === 'watch') video = url.searchParams.get('v') ?? undefined;
    else if (parts[0] && ID_PATHS.has(parts[0])) video = parts[1];
  } else {
    return null;
  }

  const ref: YouTubeRef = {};
  if (video && VIDEO_ID.test(video)) ref.video = video;
  const list = url.searchParams.get('list');
  // The length rule also turns away `WL` (Watch later) and `LL` (Liked): private to one account, they never embed.
  if (list && LIST_ID.test(list)) ref.list = list;
  return ref.video || ref.list ? ref : null;
}

/** One key per thing-that-plays, so the same video pasted twice is kept once. */
export function refKey(ref: YouTubeRef): string {
  return `${ref.video ?? ''}|${ref.list ?? ''}`;
}

/** The link YouTube itself would share, for oEmbed. */
export function watchUrl(ref: YouTubeRef): string {
  if (!ref.video) return `https://www.youtube.com/playlist?list=${ref.list ?? ''}`;
  return `https://www.youtube.com/watch?v=${ref.video}${ref.list ? `&list=${ref.list}` : ''}`;
}

/**
 * The player page. The no-cookie host so a toddler's viewing does not end up
 * shaping anyone's recommendations; `rel=0` so the suggestions that do appear
 * are from the same channel; and a single video loops (the `playlist=<itself>`
 * trick iFocus uses) so it never reaches the end screen, whose wall of other
 * thumbnails is exactly what a small finger would press next.
 */
export function embedUrl(ref: YouTubeRef): string {
  const q = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1', playsinline: '1' });
  if (!ref.video) {
    q.set('list', ref.list ?? '');
    return `https://www.youtube-nocookie.com/embed/videoseries?${q}`;
  }
  if (ref.list) q.set('list', ref.list);
  else {
    q.set('loop', '1');
    q.set('playlist', ref.video);
  }
  return `https://www.youtube-nocookie.com/embed/${ref.video}?${q}`;
}

export function thumbUrl(video: string): string {
  return `https://i.ytimg.com/vi/${video}/mqdefault.jpg`;
}

export function oembedUrl(ref: YouTubeRef): string {
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl(ref))}&format=json`;
}

const TITLE_MAX = 60;

/** The title out of an oEmbed reply, tidied for a small card; null when there is none. */
export function titleFromOembed(data: unknown): string | null {
  const raw = (data as { title?: unknown } | null)?.title;
  if (typeof raw !== 'string') return null;
  const title = raw.replace(/\s+/g, ' ').trim();
  if (!title) return null;
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1).trimEnd()}…` : title;
}

// ---- the parent's own videos ----

export interface CustomVideo extends YouTubeRef {
  title: string;
}

/** More than a shelf's worth is a list nobody scrolls; the oldest fall off the end. */
export const CUSTOM_MAX = 30;
export const DEFAULT_TITLE = 'Video của bé';

/** Newest first; adding one that is already there moves it to the front (keeping a better title). */
export function addCustom(list: readonly CustomVideo[], item: CustomVideo, max = CUSTOM_MAX): CustomVideo[] {
  const key = refKey(item);
  const old = list.find((v) => refKey(v) === key);
  const title = item.title === DEFAULT_TITLE && old ? old.title : item.title;
  return [{ ...pick(item), title }, ...list.filter((v) => refKey(v) !== key)].slice(0, max);
}

export function removeCustom(list: readonly CustomVideo[], key: string): CustomVideo[] {
  return list.filter((v) => refKey(v) !== key);
}

/** Give the video under `key` a real name, once oEmbed has one. */
export function renameCustom(list: readonly CustomVideo[], key: string, title: string): CustomVideo[] {
  return list.map((v) => (refKey(v) === key ? { ...v, title } : v));
}

function pick(v: CustomVideo): CustomVideo {
  const out: CustomVideo = { title: v.title };
  if (v.video) out.video = v.video;
  if (v.list) out.list = v.list;
  return out;
}

/**
 * The saved list, from whatever is in storage. It was written by an older
 * build, or edited by hand, or is simply junk: anything that would not embed is
 * dropped rather than trusted.
 */
export function parseSaved(raw: string | null): CustomVideo[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  let out: CustomVideo[] = [];
  for (const d of data.slice().reverse()) {
    if (!d || typeof d !== 'object') continue;
    const { video, list, title } = d as Record<string, unknown>;
    const item: CustomVideo = { title: typeof title === 'string' && title.trim() ? title.trim().slice(0, TITLE_MAX) : DEFAULT_TITLE };
    if (typeof video === 'string' && VIDEO_ID.test(video)) item.video = video;
    if (typeof list === 'string' && LIST_ID.test(list)) item.list = list;
    if (item.video || item.list) out = addCustom(out, item);
  }
  return out;
}
