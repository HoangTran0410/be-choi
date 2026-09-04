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
import { applyTheme } from './theme';
import '../styles/shell.css';

const PARENT_HOLD_MS = 1500;
/** Browser chrome colour while a night game is open. Matches the top of its sky. */
const NIGHT_CHROME = '#0a1226';

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

  const stage = h('div', {
    class: 'stage',
    // Plain colour first (old browsers), then a mix that darkens the stage when the dark theme is on.
    style: `background:${entry.color};background:color-mix(in srgb, ${entry.color}, var(--stage-mix) var(--stage-mix-pct))`,
  });
  const shell = h(
    'div',
    { class: entry.night ? 'shell shell-night' : 'shell' },
    h('header', { class: 'topbar' }, homeBtn, h('span', { class: 'topbar-title' }, `${entry.icon} ${entry.title}`), parentBtn),
    stage,
  );
  root.replaceChildren(shell);
  if (entry.night) {
    // The bar above the screen belongs to the browser, and on a tablet in
    // full screen it is the only thing left of the app's own colour. Put it
    // back the way the parent asked for it when the game is left.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', NIGHT_CHROME);
    cleanups.push(() => applyTheme(store.settings().theme));
  }

  // Any interaction on the stage counts as activity for the idle hint.
  const touch = () => hint.touch();
  stage.addEventListener('pointerdown', touch, { capture: true });
  cleanups.push(() => stage.removeEventListener('pointerdown', touch, { capture: true }));
  cleanups.push(requestWake());

  const ctx: GameContext = {
    stage,
    audio,
    speak: (text) => speech.speak(text),
    celebrate: () => celebrate(stage, audio, (t) => speech.speak(t), { confetti: store.settings().confetti }),
    hint,
    addStar: () => {
      store.addStar(entry.id);
      const sticker = maybeUnlockSticker(store);
      // Unlocked either way, and waiting in the album. What a parent can turn
      // off is the game stopping to announce it.
      if (sticker && alive && store.settings().stickerPopup) showStickerReveal(sticker, deps);
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
