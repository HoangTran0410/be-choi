/**
 * "Bộ sưu tập hình dán": every stamp theme as a card of six slots. A stamp the child has
 * used shines in colour; one they have not yet is a dark shape, waiting. Sets they have not
 * opened yet are locked. Touching anything only ever makes a sound.
 */
import { h } from '../../core/dom';
import type { GameContext } from '../../core/types';
import type { Gallery } from './gallery';
import { THEMES, TOTAL_STAMPS, slow, themeComplete } from './progress';
import { createScope, makeButton, onTapRelease } from './ui';

export interface CollectionEnv {
  ctx: GameContext;
  gallery: Gallery;
  root: HTMLElement;
  made(): number;
  say(text: string): void;
}

export function openCollection(env: CollectionEnv, onClose: () => void): () => void {
  const { ctx, gallery } = env;
  const scope = createScope();
  let closed = false;
  const collected = gallery.collected();
  const made = env.made();

  const cards = THEMES.map((t) => {
    const locked = t.at > made;
    const done = themeComplete(t, collected);
    const slots = t.items.map((s) => {
      const have = collected.includes(s.emoji);
      const slot = h('button', { class: `dr-slot${have ? ' have' : ''}`, type: 'button', 'aria-label': have ? s.name : 'hình dán chưa sưu tầm' }, locked ? '🔒' : s.emoji);
      onTapRelease(slot, () => {
        if (locked) {
          ctx.audio.boing();
          return;
        }
        if (have) {
          ctx.audio.pop();
          env.say(slow(s.name));
        } else {
          ctx.audio.tick();
        }
      });
      return slot;
    });
    return h(
      'div',
      { class: `dr-theme${locked ? ' locked' : ''}${done ? ' done' : ''}` },
      h('div', { class: 'dr-theme-head', 'aria-hidden': 'true' }, t.icon, done ? h('span', { class: 'dr-theme-star' }, '⭐') : null),
      h('div', { class: 'dr-theme-slots' }, ...slots),
    );
  });

  const total = collected.filter((e) => THEMES.some((t) => t.items.some((i) => i.emoji === e))).length;
  const head = h('div', { class: 'dr-collect-count', 'aria-label': `${total} trên ${TOTAL_STAMPS} hình dán` }, `🌟 ${total}/${TOTAL_STAMPS}`);
  const wrap = h('div', { class: 'dr-collect' }, h('div', { class: 'dr-collect-list' }, head, ...cards));
  const x = makeButton(scope, { label: 'đóng bộ sưu tập', content: '✕', cls: 'dr-book-close', onTap: close });
  wrap.append(x);
  env.root.append(wrap);
  env.say('Bộ sưu tập hình dán của bé!');

  function close(): void {
    if (closed) return;
    closed = true;
    scope.dispose();
    wrap.remove();
    onClose();
  }
  return close;
}
