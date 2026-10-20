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
  const back = h('button', { class: 'btn-round sa-wd-back', type: 'button', 'aria-label': 'Quay lại' }, '⬅️');
  const close = h('button', { class: 'btn-round sa-wd-close', type: 'button', 'aria-label': 'Xong' }, '✅');
  const root = h('div', { class: 'sa-wd', role: 'dialog', 'aria-label': 'Phòng thay đồ' }, body, back, close);
  o.parent.append(root);

  /** One thing at a time: first which part to change, then the choices for that part only. */
  type Part = 'face' | 'hat' | 'stage';
  let part: Part | null = null;

  function choices(p: Part): HTMLButtonElement[] {
    const cur = o.progress.get();
    if (p === 'face')
      return [
        ...o.photos.map((ph) =>
          cell('', 'Ảnh người thân', cur.face === `photo:${ph.id}`, 0, () => o.progress.setFace(`photo:${ph.id}`), ph.url),
        ),
        ...CHARACTERS.map((c) => cell(c.emoji, c.name, cur.face === `char:${c.id}`, 0, () => o.progress.setFace(`char:${c.id}`))),
      ];
    if (p === 'hat') return HATS.map((x) => cell(x.emoji, x.name, cur.hat === x.id, x.at, () => o.progress.setHat(x.id)));
    return STAGES.map((s) => cell(s.emoji, s.name, cur.stage === s.id, s.at, () => o.progress.setStage(s.id)));
  }

  function render(): void {
    root.dataset.step = part ?? 'parts';
    if (part) {
      body.replaceChildren(h('div', { class: 'sa-wd-grid', 'data-part': part }, ...choices(part)));
      return;
    }
    const cur = o.progress.get();
    const face = o.photos.find((ph) => cur.face === `photo:${ph.id}`);
    const show = (id: Part, emoji: string, label: string, photo?: string): HTMLButtonElement => {
      const btn = h(
        'button',
        { class: 'sa-wd-cat', type: 'button', 'data-part': id, 'aria-label': label },
        photo ? h('span', { class: 'sa-wd-photo', style: `background-image:url("${photo}")` }) : h('span', { class: 'sa-wd-emoji' }, emoji),
      );
      makeTappable(
        btn,
        () => {
          ctx.audio.tick();
          part = id;
          render();
        },
        { ctx },
      );
      return btn;
    };
    const charEmoji = CHARACTERS.find((c) => cur.face === `char:${c.id}`)?.emoji ?? CHARACTERS[0]?.emoji ?? '🧒';
    body.replaceChildren(
      h(
        'div',
        { class: 'sa-wd-parts' },
        show('face', charEmoji, 'Ca sĩ là ai?', face?.url),
        show('hat', HATS.find((x) => x.id === cur.hat)?.emoji ?? '🙂', 'Đội gì nào?'),
        show('stage', STAGES.find((x) => x.id === cur.stage)?.emoji ?? '🎭', 'Sân khấu'),
      ),
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
    back,
    () => {
      ctx.audio.tick();
      part = null;
      render();
    },
    { ctx },
  );
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
