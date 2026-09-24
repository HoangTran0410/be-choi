import { describe, it, expect } from 'vitest';
import {
  CUSTOM_MAX,
  DEFAULT_TITLE,
  SHELVES,
  addCustom,
  allVideos,
  embedUrl,
  oembedUrl,
  parseSaved,
  parseYouTube,
  refKey,
  removeCustom,
  renameCustom,
  titleFromOembed,
  watchUrl,
  type CustomVideo,
} from './logic';

const ID = 'dQw4w9WgXcQ';
const LIST = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';

describe('the shelves', () => {
  it('carry every iFocus video once, each a real YouTube id with a name and a picture', () => {
    const all = allVideos();
    expect(all.length).toBe(44);
    expect(new Set(all.map((v) => v.id)).size).toBe(all.length);
    for (const v of all) {
      expect(v.id).toMatch(/^[\w-]{11}$/);
      expect(v.title.trim()).not.toBe('');
      expect(v.emoji.trim()).not.toBe('');
    }
    expect(new Set(SHELVES.map((s) => s.id)).size).toBe(SHELVES.length);
    for (const s of SHELVES) expect(s.videos.length).toBeGreaterThanOrEqual(4);
  });
});

describe('parseYouTube', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&t=42s`],
    [`https://m.youtube.com/watch?feature=share&v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}&si=abc123`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=Xy_z-123&t=10`],
    [`https://www.youtube.com/shorts/${ID}?feature=share`],
    [`https://www.youtube.com/embed/${ID}?autoplay=1`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`https://www.youtube.com/live/${ID}?si=abc`],
    [`https://www.youtube.com/v/${ID}`],
    [`youtube.com/watch?v=${ID}`],
    [`youtu.be/${ID}`],
    [`  https://youtu.be/${ID}  \n`],
    [`Xem cái này nè: https://youtu.be/${ID}?si=abc 😍`],
    [ID],
  ])('finds the video in %s', (input) => {
    expect(parseYouTube(input)).toEqual({ video: ID });
  });

  it('keeps the playlist a video was shared from', () => {
    expect(parseYouTube(`https://www.youtube.com/watch?v=${ID}&list=${LIST}&index=3`)).toEqual({ video: ID, list: LIST });
    expect(parseYouTube(`https://youtu.be/${ID}?list=${LIST}`)).toEqual({ video: ID, list: LIST });
  });

  it('takes a playlist on its own', () => {
    expect(parseYouTube(`https://www.youtube.com/playlist?list=${LIST}`)).toEqual({ list: LIST });
    expect(parseYouTube(`https://music.youtube.com/playlist?list=${LIST}&si=x`)).toEqual({ list: LIST });
  });

  it.each([
    [''],
    ['   '],
    ['hello'],
    ['https://vimeo.com/123456789'],
    [`https://notyoutube.com/watch?v=${ID}`],
    ['https://www.youtube.com/'],
    ['https://www.youtube.com/@somechannel'],
    ['https://www.youtube.com/watch?v=short'],
    ['https://youtu.be/'],
    ['https://www.youtube.com/playlist?list=WL'],
  ])('turns away %j', (input) => {
    expect(parseYouTube(input)).toBeNull();
  });
});

describe('links out', () => {
  it('embeds a single video looping on the no-cookie host, so it never reaches the end screen', () => {
    const url = new URL(embedUrl({ video: ID }));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe(`/embed/${ID}`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ autoplay: '1', rel: '0', playsinline: '1', loop: '1', playlist: ID });
  });

  it('embeds a playlist, with or without a video to start on', () => {
    const both = new URL(embedUrl({ video: ID, list: LIST }));
    expect(both.pathname).toBe(`/embed/${ID}`);
    expect(both.searchParams.get('list')).toBe(LIST);
    expect(both.searchParams.has('loop')).toBe(false);
    const only = new URL(embedUrl({ list: LIST }));
    expect(only.pathname).toBe('/embed/videoseries');
    expect(only.searchParams.get('list')).toBe(LIST);
  });

  it('asks oEmbed about the ordinary watch link', () => {
    expect(watchUrl({ video: ID })).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(watchUrl({ list: LIST })).toBe(`https://www.youtube.com/playlist?list=${LIST}`);
    const url = new URL(oembedUrl({ video: ID }));
    expect(url.searchParams.get('url')).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(url.searchParams.get('format')).toBe('json');
  });

  it('tidies an oEmbed title, and has none for anything else', () => {
    expect(titleFromOembed({ title: '  Baby   Shark \n Dance ' })).toBe('Baby Shark Dance');
    expect(titleFromOembed({ title: 'x'.repeat(200) })!.length).toBe(60);
    expect(titleFromOembed({ title: '' })).toBeNull();
    expect(titleFromOembed({})).toBeNull();
    expect(titleFromOembed(null)).toBeNull();
  });
});

describe('the parent’s own list', () => {
  const a: CustomVideo = { video: 'aaaaaaaaaaa', title: 'A' };
  const b: CustomVideo = { video: 'bbbbbbbbbbb', title: 'B' };

  it('puts the newest first and keeps each video once', () => {
    let list = addCustom([], a);
    list = addCustom(list, b);
    expect(list.map((v) => v.title)).toEqual(['B', 'A']);
    list = addCustom(list, { ...a, title: 'A again' });
    expect(list.map((v) => v.title)).toEqual(['A again', 'B']);
  });

  it('does not lose a real title to a second paste of the same link', () => {
    const list = addCustom([a], { video: a.video, title: DEFAULT_TITLE });
    expect(list).toEqual([a]);
  });

  it('tells a video from the same video inside a playlist', () => {
    const list = addCustom([a], { video: a.video, list: LIST, title: 'In a list' });
    expect(list.length).toBe(2);
  });

  it('forgets the oldest past the cap', () => {
    let list: CustomVideo[] = [];
    for (let i = 0; i < CUSTOM_MAX + 5; i++) list = addCustom(list, { video: `v${String(i).padStart(10, '0')}`, title: `#${i}` });
    expect(list.length).toBe(CUSTOM_MAX);
    expect(list[0]!.title).toBe(`#${CUSTOM_MAX + 4}`);
  });

  it('removes and renames by key', () => {
    const list = [a, b];
    expect(removeCustom(list, refKey(a))).toEqual([b]);
    expect(renameCustom(list, refKey(b), 'Bee')).toEqual([a, { ...b, title: 'Bee' }]);
  });

  it('reads back what it saved, and nothing it would not embed', () => {
    const list = [a, { list: LIST, title: 'Playlist' }, b];
    expect(parseSaved(JSON.stringify(list))).toEqual(list);
    expect(parseSaved(null)).toEqual([]);
    expect(parseSaved('{oops')).toEqual([]);
    expect(parseSaved('{"video":"aaaaaaaaaaa"}')).toEqual([]);
    expect(parseSaved(JSON.stringify([null, 7, { video: 'bad' }, { video: a.video }, { video: a.video, title: 'dup' }]))).toEqual([
      { video: a.video, title: 'dup' },
    ]);
  });
});
