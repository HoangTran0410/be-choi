import { h } from '../core/dom';
import type { AppDeps } from './deps';
import { giftAvailable, markGiftOpened } from './dailyGift';
import { maybeUnlockSticker, showStickerReveal } from './rewards';
import { STARS_CHANGED } from './parentPanel';
import type { GameEntry } from './registry';

const GIFT_STAR_ID = 'daily-gift';
const GREETING = 'Chào bé! Bé muốn chơi gì nào?';

/** Greeted already since the app was opened (module lives as long as the page). */
let greeted = false;

export const MASCOT_LINES = ['Bé ơi, mình chơi nhé!', 'Hi hi, nhột quá!', 'Bé xem hôm nay có gì vui nè!', 'Bé thích chơi gì nào?'] as const;

/** Test helper. */
export function resetMascotGreeting(): void {
  greeted = false;
}

/**
 * The 🐣 on the home screen: greets once per app open, answers a tap with a wiggle, a blip and a
 * short line, and holds a 🎁 on the first visit of each day. Never speaks over other speech on its own.
 */
export function createMascot(deps: AppDeps, todays: () => GameEntry[], pointAt: (id: string) => void): { el: HTMLElement; dispose: () => void } {
  const face = h('span', { class: 'mascot-face', 'aria-hidden': 'true' }, '🐣');
  const gift = h('span', { class: 'mascot-gift', 'aria-hidden': 'true' }, '🎁');
  const el = h('button', { class: 'mascot', 'aria-label': 'Bạn gà con' }, face, gift);
  let line = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let opening = false;

  const syncGift = () => {
    const has = giftAvailable();
    gift.hidden = !has;
    el.classList.toggle('mascot-has-gift', has);
    el.setAttribute('aria-label', has ? 'Bạn gà con, có quà' : 'Bạn gà con');
  };
  syncGift();

  const wiggle = () => {
    face.classList.remove('anim-wiggle');
    void face.offsetWidth;
    face.classList.add('anim-wiggle');
  };

  const openGift = () => {
    opening = true;
    markGiftOpened();
    deps.audio.ding();
    gift.classList.add('mascot-gift-open');
    deps.speech.speak('Quà của bé đây!');
    deps.store.addStar(GIFT_STAR_ID);
    const sticker = maybeUnlockSticker(deps.store);
    if (sticker && deps.store.settings().stickerPopup) showStickerReveal(sticker, deps);
    window.dispatchEvent(new Event(STARS_CHANGED));
    timer = setTimeout(() => {
      opening = false;
      syncGift();
    }, 900);
  };

  el.addEventListener('click', () => {
    if (opening) return;
    wiggle();
    if (giftAvailable()) {
      openGift();
      return;
    }
    deps.audio.pop(1.3);
    const picks = todays();
    const i = line++ % MASCOT_LINES.length;
    if (i === 2 && picks.length) {
      const g = picks[(line >> 2) % picks.length]!;
      deps.speech.speak(`Bé thử chơi ${g.title} nhé!`);
      pointAt(g.id);
    } else {
      deps.speech.speak(MASCOT_LINES[i]!);
    }
  });

  // Greeting: once per app open, never over speech that is already going.
  if (!greeted) {
    greeted = true;
    timer = setTimeout(() => {
      if (!(deps.speech.speaking?.() ?? false)) {
        deps.speech.speak(GREETING);
        wiggle();
      }
    }, 500);
  }

  return {
    el,
    dispose: () => {
      if (timer) clearTimeout(timer);
    },
  };
}
