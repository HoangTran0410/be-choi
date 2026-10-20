import type { GameContext } from '../../core/types';
import type { Gallery, NewWork } from './gallery';
import type { Panel, PanelItem, Scope } from './ui';

/** What the workshop gives each drawing mode to work with. */
export interface ModeEnv {
  ctx: GameContext;
  gallery: Gallery;
  /** The free space between the two toolbars; a mode puts its paper here. */
  field: HTMLElement;
  /** The whole workshop, for panels that cover everything. */
  root: HTMLElement;
  /** Undone when the mode ends. */
  scope: Scope;
  /** Replace the buttons in the top (portrait) / left (landscape) strip. */
  setHud(buttons: HTMLElement[]): void;
  /** Replace the buttons in the bottom (portrait) / right (landscape) strip. */
  setTools(buttons: HTMLElement[]): void;
  /** Open a grid panel; any panel already open is closed first. */
  openPanel(items: readonly PanelItem[], opts?: { wide?: boolean; sixes?: boolean; onClose?: () => void }): Panel;
  /** The hub, notebook and collection buttons every mode's HUD shares. */
  hubButton(): HTMLElement;
  notebookButton(): HTMLElement;
  /** Speak slowly: "Màu… đỏ." */
  say(text: string): void;
  /** Pictures finished so far (what unlocks are worked out from). */
  made(): number;
  /**
   * A picture is done: put it in the book, give a star, cheer, and announce what it unlocked.
   * `work` is null when the page could not be turned into a picture (the star still counts).
   * Resolves after the cheering.
   */
  commit(work: NewWork | null, opts?: { celebrate?: boolean }): Promise<void>;
  /** A stamp was used: collects it, and rewards a finished set. */
  collect(emoji: string): void;
  /** Still in the game (false once the child has left). */
  alive(): boolean;
}

export interface ModeController {
  /** Save the page if the child has drawn enough on it (called when leaving). */
  flush(): void;
  destroy(): void;
}

/** Strokes a page needs before it is worth keeping. */
export const MIN_STROKES = 3;
