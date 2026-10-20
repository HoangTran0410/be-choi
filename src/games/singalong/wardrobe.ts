import { h } from '../../core/dom';
import type { Photo } from '../../core/photos';
import { makeTappable } from '../../core/tap';
import type { GameContext } from '../../core/types';
import { CHARACTERS, HATS, STAGES } from './catalog';
import type { ProgressStore } from './progress';

export interface WardrobeOptions {
  parent: HTMLElement;
  progress: ProgressStore;
  photos: readonly Photo[];
  /** The singer, the stage or the hat changed. */
  onChange(): void;
  /** What to say when a locked gift is tapped. */
  onLocked(need: number, have: number): void;
}

/**
 * The dressing room: pick the singer's face (a character or a photo of somebody
 * the child loves), a hat and a stage. Gifts not yet won are shown dimmed with
 * their ticket price; touching one only tells the child what is needed.
 */
export function openWardrobe(ctx: Pick<GameContext, 'onCleanup' | 'audio'>, o: WardrobeOptions): () => void {
  const tickets = o.progress.get().tickets;
  const cell = (emoji: string, label: string, on: boolean, need: number, pick: () => void, photo?: string): HTMLButtonElement => {
    const locked = need > tickets;
    const btn = h(
      'button',
      { class: `sa-wd-cell${on ? ' sa-wd-on' : ''}${locked ? ' sa-wd-locked' : ''}`, type: 'button', 'aria-label': label },
      photo ? h('span', { class: 'sa-wd-photo', style: `background-image:url("${photo}")` }) : h('span', { class: 'sa-wd-emoji' }, emoji),
      locked ? h('span', { class: 'sa-wd-lock' }, `🔒${need}`) : null,
    );
    makeTappable(btn, () => {
      if (locked) {
        ctx.audio.boing();
        o.onLocked(need, tickets);
        return;
      }
      ctx.audio.pop(1.2);
      pick();
      render();
      o.onChange();
    });
    return btn;
  };

  const body = h('div', { class: 'sa-wd-body' });
  const close = h('button', { class: 'btn-round sa-wd-close', type: 'button', 'aria-label': 'Xong' }, '✅');
  const root = h('div', { class: 'sa-wd', role: 'dialog', 'aria-label': 'Phòng thay đồ' }, body, close);
  o.parent.append(root);

  function section(title: string, ...cells: HTMLElement[]): HTMLElement {
    return h('section', { class: 'sa-wd-sec' }, h('h3', { class: 'sa-wd-h' }, title), h('div', { class: 'sa-wd-grid' }, ...cells));
  }

  function render(): void {
    const p = o.progress.get();
    body.replaceChildren(
      section(
        'Ca sĩ là ai?',
        ...o.photos.map((ph) =>
          cell('', 'Ảnh người thân', p.face === `photo:${ph.id}`, 0, () => o.progress.setFace(`photo:${ph.id}`), ph.url),
        ),
        ...CHARACTERS.map((c) => cell(c.emoji, c.name, p.face === `char:${c.id}`, 0, () => o.progress.setFace(`char:${c.id}`))),
      ),
      section('Đội gì nào?', ...HATS.map((x) => cell(x.emoji, x.name, p.hat === x.id, x.at, () => o.progress.setHat(x.id)))),
      section('Sân khấu', ...STAGES.map((s) => cell(s.emoji, s.name, p.stage === s.id, s.at, () => o.progress.setStage(s.id)))),
    );
  }
  render();

  let open = true;
  const dispose = (): void => {
    if (!open) return;
    open = false;
    root.remove();
  };
  makeTappable(
    close,
    () => {
      ctx.audio.tick();
      dispose();
    },
    { ctx },
  );
  ctx.onCleanup(dispose);
  return dispose;
}
