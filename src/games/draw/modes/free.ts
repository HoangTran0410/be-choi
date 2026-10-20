/**
 * Vẽ tự do: a blank sheet, every pen, colour and sticker. "Xong rồi" puts the sheet in the
 * notebook and hands over a clean one; leaving the workshop keeps a sheet that has enough on it.
 */
import { replay } from '../../../core/dom';
import { MIN_STROKES, type ModeController, type ModeEnv } from '../env';
import { createSurface } from '../surface';
import { createScope, makeButton } from '../ui';
import { paintTools } from './paintTools';

export function startFree(env: ModeEnv): ModeController {
  const scope = createScope();
  const { ctx } = env;
  let busy = false;

  const surface = createSurface({
    ctx,
    host: env.field,
    onStamp: (emoji) => env.collect(emoji),
    onStroke: () => ctx.hint.touch(),
  });
  const tools = paintTools(env, surface, scope, { stamps: true, bucket: false });

  function worthKeeping(): boolean {
    return surface.strokes() >= MIN_STROKES;
  }

  function save(celebrate: boolean): Promise<void> {
    const shot = surface.snapshot();
    const work = shot ? { mode: 'free' as const, thumb: shot.url, w: shot.w, h: shot.h } : null;
    surface.clear();
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
        if (env.alive()) env.say('Trang mới nào!');
      });
    },
  });

  env.setHud([env.hubButton(), done, env.notebookButton()]);
  env.setTools(tools.buttons);

  // Nothing is asked of the child; after a long quiet the colour button just wiggles.
  ctx.hint.arm(() => replay(tools.buttons[0]!, 'anim-wiggle'), 15000);

  return {
    flush() {
      if (worthKeeping()) void save(false);
    },
    destroy() {
      ctx.hint.clear();
      surface.destroy();
      scope.dispose();
    },
  };
}
