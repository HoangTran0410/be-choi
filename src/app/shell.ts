import { celebrate } from '../core/celebrate';
import { h } from '../core/dom';
import { createHint } from '../core/hint';
import { onHold } from '../core/hold';
import type { GameContext } from '../core/types';
import { requestWake } from '../core/wake';
import type { AppDeps } from './deps';
import { openParentPanel } from './parentPanel';
import { maybeUnlockSticker, showStickerReveal } from './rewards';
import type { GameEntry } from './registry';
import { hrefFor } from './router';
import '../styles/shell.css';

const PARENT_HOLD_MS = 1500;

/**
 * Game shell: top bar (home, title, parent gate) plus the stage. Loads the game
 * module, builds its `GameContext`, and tears everything down on unmount.
 */
export function mountShell(root: HTMLElement, entry: GameEntry, deps: AppDeps): () => void {
  const { audio, speech, store } = deps;
  let alive = true;
  const cleanups: Array<() => void> = [];
  const hint = createHint();

  const homeBtn = h(
    'button',
    {
      class: 'btn-round home',
      'aria-label': 'Về trang chính',
      onClick: () => {
        audio.tick();
        location.hash = hrefFor({ name: 'home' });
      },
    },
    '🏠',
  );
  const parentBtn = h('button', { class: 'btn-round parent', 'aria-label': 'Phụ huynh (giữ)' }, '👪');
  cleanups.push(
    onHold(parentBtn, PARENT_HOLD_MS, () => {
      audio.tick();
      openParentPanel(deps);
    }),
  );

  const stage = h('div', { class: 'stage', style: `background:${entry.color}` });
  const shell = h(
    'div',
    { class: 'shell' },
    h(
      'header',
      { class: 'topbar' },
      homeBtn,
      h('span', { class: 'topbar-title' }, `${entry.icon} ${entry.title}`),
      parentBtn,
    ),
    stage,
  );
  root.replaceChildren(shell);

  // Any interaction on the stage counts as activity for the idle hint.
  const touch = () => hint.touch();
  stage.addEventListener('pointerdown', touch, { capture: true });
  cleanups.push(() => stage.removeEventListener('pointerdown', touch, { capture: true }));
  cleanups.push(requestWake());

  const ctx: GameContext = {
    stage,
    audio,
    speak: (text) => speech.speak(text),
    celebrate: () => celebrate(stage, audio, (t) => speech.speak(t)),
    hint,
    addStar: () => {
      store.addStar(entry.id);
      const sticker = maybeUnlockSticker(store);
      if (sticker && alive) showStickerReveal(sticker, deps);
    },
    onCleanup: (fn) => cleanups.push(fn),
    photos: deps.photos,
    stickers: () => store.stickers(),
  };

  audio.tick();
  speech.speak(entry.intro);

  entry
    .load()
    .then((mod) => {
      if (!alive) return;
      mod.default.start(ctx);
    })
    .catch((err: unknown) => {
      console.error(`Không tải được game ${entry.id}`, err);
      if (alive) stage.append(h('p', { class: 'stage-error' }, '😢 Không mở được trò chơi này.'));
    });

  return () => {
    alive = false;
    hint.clear();
    speech.cancel();
    for (const fn of cleanups.reverse()) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
    root.replaceChildren();
  };
}
