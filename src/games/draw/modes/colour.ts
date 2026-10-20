/**
 * Tô tranh: a colouring page — one of the workshop's pictures as black lines, or a family
 * photo turned into lines — and every colour, pen and the paint bucket to fill it in.
 * The lines sit above the paint (multiply), so colour can never cover them.
 */
import { replay } from '../../../core/dom';
import { toLineArt, type Photo } from '../../../core/photos';
import { PICTURES } from '../../trace/pictures';
import type { Picture } from '../../trace/shapes';
import { drawPicture, loadImage, pictureThumbUrl } from '../art';
import { MIN_STROKES, type ModeController, type ModeEnv } from '../env';
import { pickNextPicture, pictureCount, slow } from '../progress';
import { createSurface } from '../surface';
import { createScope, makeButton, type PanelItem } from '../ui';
import { paintTools } from './paintTools';

/** Give up on a photo that takes longer than this to become lines; the page stays as it was. */
const LINE_ART_TIMEOUT_MS = 10_000;

interface Lines {
  img: HTMLImageElement;
  aspect: number;
}

export function startColour(env: ModeEnv): ModeController {
  const scope = createScope();
  const { ctx } = env;
  const seen = new Set<string>();
  const cache = new Map<string, Lines>();
  let photos: Photo[] = [];
  let pic: Picture | null = null;
  let title = '';
  let job = 0;
  let busy = false;
  let converting = false;

  const surface = createSurface({ ctx, host: env.field, aspect: 1, overlayBlend: 'multiply', onStroke: () => ctx.hint.touch() });
  surface.setTool({ tool: 'bucket' });
  const tools = paintTools(env, surface, scope, { bucket: true, stamps: false });
  const wait = document.createElement('div');
  wait.className = 'dr-wait';
  wait.textContent = '⏳';
  wait.hidden = true;
  env.field.append(wait);
  scope.add(() => wait.remove());

  const unlockedPics = (): Picture[] => PICTURES.slice(0, pictureCount(env.made(), PICTURES.length));

  function showPicture(next: Picture): void {
    job++;
    converting = false;
    wait.hidden = true;
    pic = next;
    title = next.name;
    seen.add(next.id);
    surface.reset(1);
    surface.setOverlay((c, w) => drawPicture(c, next, w, w, { lines: { width: w * 0.03, color: '#3f3f46' } }));
    env.say(slow(`Tô ${next.name}`));
  }

  function showLines(lines: Lines): void {
    pic = null;
    title = 'ảnh của nhà mình';
    surface.reset(lines.aspect);
    surface.setOverlay((c, w, hh) => c.drawImage(lines.img, 0, 0, w, hh));
    env.say('Ảnh của nhà mình. Bé tô màu nhé!');
  }

  function showPhoto(photo: Photo): void {
    const hit = cache.get(photo.id);
    if (hit) {
      job++;
      showLines(hit);
      return;
    }
    const mine = ++job;
    converting = true;
    wait.hidden = false;
    const fail = (): void => {
      if (mine !== job) return;
      converting = false;
      wait.hidden = true;
    };
    const timer = scope.timeout(fail, LINE_ART_TIMEOUT_MS);
    toLineArt(photo.url)
      .then((url) => loadImage(url))
      .then((img) => {
        if (!img) return fail();
        const lines = { img, aspect: img.naturalWidth / Math.max(1, img.naturalHeight) };
        cache.set(photo.id, lines);
        if (mine !== job || !env.alive()) return;
        clearTimeout(timer);
        converting = false;
        wait.hidden = true;
        showLines(lines);
      })
      .catch(fail);
  }

  function nextPicture(): void {
    const list = unlockedPics();
    const id = pickNextPicture(
      list.map((p) => p.id),
      seen,
      pic?.id ?? null,
    );
    const next = list.find((p) => p.id === id);
    if (next) showPicture(next);
  }

  function openPictures(): void {
    ctx.audio.tick();
    const made = env.made();
    const items: PanelItem[] = [];
    for (const photo of photos) {
      items.push({
        id: photo.id,
        label: 'ảnh của nhà mình',
        image: photo.url,
        badge: '📷',
        onPick: () => showPhoto(photo),
      });
    }
    PICTURES.forEach((p, i) => {
      const locked = i >= pictureCount(made, PICTURES.length);
      items.push({
        id: p.id,
        label: p.name,
        image: pictureThumbUrl(p, true),
        locked,
        selected: pic?.id === p.id,
        onPick: () => {
          if (locked) {
            ctx.audio.boing();
            env.say('Vẽ thêm tranh để mở tranh mới nhé!');
            return false;
          }
          showPicture(p);
        },
      });
    });
    env.openPanel(items, { wide: true });
  }

  const pictures = makeButton(scope, { label: 'chọn tranh', content: '🖼️', cls: 'dr-pictures', onTap: openPictures });

  function syncPhotos(list: Photo[]): void {
    photos = list;
    pictures.classList.toggle('has-photos', list.length > 0);
  }
  void ctx.photos.list().then(
    (list) => {
      if (env.alive()) syncPhotos(list);
    },
    () => undefined,
  );
  scope.add(ctx.photos.onChange(syncPhotos));

  function worthKeeping(): boolean {
    return surface.strokes() >= MIN_STROKES && !converting;
  }

  function save(celebrate: boolean): Promise<void> {
    const shot = surface.snapshot();
    const work = shot ? { mode: 'colour' as const, thumb: shot.url, w: shot.w, h: shot.h, title } : null;
    return env.commit(work, { celebrate });
  }

  const done = makeButton(scope, {
    label: 'xong rồi',
    content: '✅',
    cls: 'dr-done',
    onTap: () => {
      if (busy) return;
      if (!worthKeeping()) {
        ctx.audio.tick();
        replay(tools.buttons[0]!, 'anim-wiggle');
        return;
      }
      busy = true;
      void save(true).finally(() => {
        busy = false;
        if (env.alive()) nextPicture();
      });
    },
  });

  env.setHud([env.hubButton(), pictures, done, env.notebookButton()]);
  env.setTools(tools.buttons);
  nextPicture();
  ctx.hint.arm(() => replay(tools.buttons[0]!, 'anim-wiggle'), 15000);

  return {
    flush() {
      if (worthKeeping()) void save(false);
    },
    destroy() {
      job++;
      ctx.hint.clear();
      surface.destroy();
      scope.dispose();
    },
  };
}
