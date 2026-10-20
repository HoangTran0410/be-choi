/**
 * The workshop: one shared frame (a strip of big buttons on each side of the paper) that
 * the four drawing modes, the notebook and the sticker collection all live in. This file
 * owns the screens and what happens when a picture is finished; each mode owns its paper.
 */
import { h } from '../../core/dom';
import type { GameContext } from '../../core/types';
import { PICTURES } from '../trace/pictures';
import { openCollection } from './collection';
import type { ModeController, ModeEnv } from './env';
import { createGallery, type Gallery, type NewWork } from './gallery';
import { buildHub } from './hub';
import { startColour } from './modes/colour';
import { startCopy } from './modes/copy';
import { startFree } from './modes/free';
import { startPractice } from './modes/practice';
import { openNotebook } from './notebook';
import { modeInfo, slow, themeComplete, themeOf, unlocksBetween, type ModeId, type Unlock } from './progress';
import { createScope, makeButton, openPanel, showToast, type Panel, type PanelItem, type Scope } from './ui';

const STARTERS: Record<ModeId, (env: ModeEnv) => ModeController> = {
  practice: startPractice,
  colour: startColour,
  free: startFree,
  copy: startCopy,
};

const UNLOCK_SAY: Record<Unlock['kind'], string> = {
  color: 'Bé có màu mới rồi!',
  brush: 'Bé có bút mới rồi!',
  theme: 'Bé có hình dán mới rồi!',
  picture: 'Bé có tranh mới rồi!',
};

export interface Workshop {
  gallery: Gallery;
}

export function createWorkshop(ctx: GameContext, gallery: Gallery = createGallery()): Workshop {
  const life = createScope();
  let alive = true;

  const hud = h('div', { class: 'dr-hud' });
  const field = h('div', { class: 'dr-field' });
  const tools = h('div', { class: 'dr-tools' });
  const root = h('div', { class: 'dr at-hub' }, hud, field, tools);
  ctx.stage.append(root);

  const say = (text: string): void => ctx.speak(text);

  /* ----------------------------------------------------------- wallpaper */
  function applyWallpaper(): void {
    const wall = gallery.wallpaper();
    root.classList.toggle('has-wall', !!wall);
    if (wall) root.style.setProperty('--dr-wall', `url("${wall.thumb}")`);
    else root.style.removeProperty('--dr-wall');
  }
  applyWallpaper();
  life.add(gallery.onChange(applyWallpaper));

  /* -------------------------------------------------------------- panels */
  let panel: Panel | null = null;
  function showPanel(items: readonly PanelItem[], opts: { wide?: boolean; sixes?: boolean; onClose?: () => void } = {}): Panel {
    panel?.close();
    const p: Panel = openPanel(root, items, {
      wide: opts.wide,
      sixes: opts.sixes,
      onClose: () => {
        if (panel === p) panel = null;
        opts.onClose?.();
      },
    });
    panel = p;
    return p;
  }

  /* ------------------------------------------------------------- finishing */
  function toast(unlocks: Unlock[]): void {
    if (!unlocks.length || !alive) return;
    showToast(
      root,
      life,
      unlocks.map((u) => ({ icon: u.icon, color: u.hex })),
    );
    say(UNLOCK_SAY[unlocks[0]!.kind]);
  }

  async function commit(work: NewWork | null, opts: { celebrate?: boolean } = {}): Promise<void> {
    const before = gallery.made();
    if (work) gallery.add(work);
    else if (opts.celebrate === false) return;
    const unlocks = work ? unlocksBetween(before, gallery.made(), PICTURES) : [];
    ctx.addStar();
    if (opts.celebrate !== false && alive) await ctx.celebrate();
    toast(unlocks);
  }

  function collect(emoji: string): void {
    if (!gallery.collect(emoji)) return;
    ctx.audio.note(880, 0.12);
    const theme = themeOf(emoji);
    if (theme && themeComplete(theme, gallery.collected()) && !gallery.themesDone().includes(theme.id)) {
      gallery.markThemeDone(theme.id);
      ctx.addStar();
      say('Đủ cả bộ rồi! Giỏi quá!');
      void ctx.celebrate();
    }
  }

  /* --------------------------------------------------------- notebook etc. */
  let closeOverlay: (() => void) | null = null;
  function openBook(): void {
    closeOverlay?.();
    panel?.close();
    const close = openNotebook({ ctx, gallery, root, say }, () => {
      if (closeOverlay === close) closeOverlay = null;
      if (!alive) return;
      refreshHud();
      if (current === null) showHub(true);
    });
    closeOverlay = close;
  }
  function openStickerBook(): void {
    closeOverlay?.();
    const close = openCollection({ ctx, gallery, root, made: () => gallery.made(), say }, () => {
      if (closeOverlay === close) closeOverlay = null;
    });
    closeOverlay = close;
  }

  /* -------------------------------------------------------------- the modes */
  let current: ModeId | null = null;
  let ctrl: ModeController | null = null;
  let modeScope: Scope | null = null;
  let hudButtons: HTMLElement[] = [];

  const countBadge = (): string => String(gallery.list().length);
  function refreshHud(): void {
    for (const b of hudButtons) {
      const c = b.querySelector('.dr-count');
      if (c) c.textContent = countBadge();
    }
  }

  function leaveMode(flush: boolean): void {
    panel?.close();
    if (ctrl) {
      if (flush) ctrl.flush();
      ctrl.destroy();
    }
    modeScope?.dispose();
    ctrl = null;
    modeScope = null;
    current = null;
    hud.replaceChildren();
    tools.replaceChildren();
    field.replaceChildren();
    hudButtons = [];
  }

  function enterMode(id: ModeId): void {
    leaveMode(true);
    closeOverlay?.();
    dropHub();
    root.classList.remove('at-hub');
    root.dataset.mode = id;
    const scope = createScope();
    modeScope = scope;
    current = id;
    const env: ModeEnv = {
      ctx,
      gallery,
      field,
      root,
      scope,
      setHud(buttons) {
        hudButtons = buttons;
        hud.replaceChildren(...buttons);
      },
      setTools(buttons) {
        tools.replaceChildren(...buttons);
      },
      openPanel: showPanel,
      hubButton: () =>
        makeButton(scope, {
          label: 'về xưởng vẽ',
          content: '🎨',
          cls: 'dr-hub-btn',
          onTap: () => {
            ctx.audio.tick();
            showHub();
          },
        }),
      notebookButton: () => {
        const b = makeButton(scope, {
          label: 'quyển vở của bé',
          content: h('span', { class: 'dr-nb' }, '📒', h('span', { class: 'dr-count', 'aria-hidden': 'true' }, countBadge())),
          cls: 'dr-nb-btn',
          onTap: openBook,
        });
        return b;
      },
      say,
      made: () => gallery.made(),
      commit: (work, o) => commit(work, o).finally(refreshHud),
      collect,
      alive: () => alive && current === id,
    };
    ctrl = STARTERS[id](env);
  }

  /* ------------------------------------------------------------------ hub */
  let hubEl: HTMLElement | null = null;
  let hubScope: Scope | null = null;
  function dropHub(): void {
    hubScope?.dispose();
    hubScope = null;
    hubEl?.remove();
    hubEl = null;
  }
  /** The workshop door. `quiet` skips the spoken welcome (the shell has just said the intro). */
  function showHub(quiet = false): void {
    leaveMode(true);
    closeOverlay?.();
    dropHub();
    hubScope = createScope();
    root.classList.add('at-hub');
    delete root.dataset.mode;
    hubEl = buildHub(hubScope, gallery, {
      mode: (id) => {
        ctx.audio.pop();
        say(modeInfo(id).say);
        enterMode(id);
      },
      notebook: openBook,
      collection: openStickerBook,
    });
    root.append(hubEl);
    ctx.hint.clear();
    ctx.hint.arm(() => hubEl?.querySelector('.dr-door')?.classList.add('anim-wiggle'), 12000);
    if (!quiet) say(slow('Bé muốn vẽ gì nào'));
  }
  showHub(true);

  ctx.onCleanup(() => {
    alive = false;
    ctx.hint.clear();
    // A page that has enough on it is kept without asking.
    leaveMode(true);
    closeOverlay?.();
    dropHub();
    life.dispose();
    root.remove();
  });

  return { gallery };
}
