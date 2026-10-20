import { h, replay } from '../../core/dom';
import { makeTappable } from '../../core/tap';
import type { ChooseQuestion, Option } from './types';
import { renderVisual } from './visual';

/** What a question screen gives back so the quiz can clean up and nudge. */
export interface AnswerView {
  destroy(): void;
  /** Gently point at the answer (after the child has been stuck a while). */
  hintAnswer(): void;
}

export interface ChooseHandlers {
  onRight(opt: Option, el: HTMLElement): void;
  onWrong(opt: Option, el: HTMLElement): void;
}

/**
 * Pick-one answers: two to four big tiles. Nothing is ever disabled for being wrong:
 * the tile shakes and fades a little, and the child can try any other tile.
 */
export function renderChoose(host: HTMLElement, q: ChooseQuestion, handlers: ChooseHandlers): AnswerView {
  const disposers: Array<() => void> = [];
  const grid = h('div', { class: `lq-opts lq-n${q.options.length}` });
  const tiles = new Map<string, HTMLElement>();
  for (const opt of q.options) {
    const tile = h(
      'button',
      { class: `lq-opt lq-opt-${opt.visual.k}`, type: 'button', 'data-id': opt.id, 'aria-label': opt.name || 'lựa chọn' },
      renderVisual(opt.visual),
    );
    disposers.push(
      makeTappable(
        tile,
        () => (opt.id === q.answerId ? handlers.onRight(opt, tile) : handlers.onWrong(opt, tile)),
        { cooldownMs: 0, feedback: false },
      ),
    );
    tiles.set(opt.id, tile);
    grid.append(tile);
  }
  host.replaceChildren(grid);
  return {
    destroy() {
      for (const d of disposers) d();
      disposers.length = 0;
      grid.remove();
    },
    hintAnswer() {
      const t = tiles.get(q.answerId);
      if (t) replay(t, 'anim-wiggle');
    },
  };
}
