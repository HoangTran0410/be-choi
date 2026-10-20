/** Picture-only icons (no words): the three ways to practise, and a door picture for each mode. */
import type { Mode } from '../trace/modes';
import type { ModeId } from './progress';

export const WAY_ICONS: Record<Mode, string> = {
  follow:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 36C12 8 28 46 40 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="0.1 9"/><path d="M34 8l8 6-3 8z" fill="currentColor"/></svg>',
  dots: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 36L21 13L36 29L40 9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/><g fill="currentColor"><circle cx="11" cy="36" r="5.5"/><circle cx="21" cy="13" r="5.5"/><circle cx="36" cy="29" r="5.5"/><circle cx="40" cy="9" r="5.5"/></g></svg>',
  color:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5C24 5 10 21 10 31a14 14 0 0028 0C38 21 24 5 24 5z" fill="currentColor"/><path d="M17 31a7 7 0 007 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/></svg>',
};

export const WAY_NAMES: Record<Mode, string> = { follow: 'Theo nét', dots: 'Nối chấm', color: 'Tô vùng' };

/** A big picture for each door of the workshop: what you do there, drawn. */
export const DOOR_ICONS: Record<ModeId, string> = {
  // a dotted line to follow, with a crayon at the end
  practice:
    '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M12 70C20 22 52 90 76 30" fill="none" stroke="#65a30d" stroke-width="7" stroke-linecap="round" stroke-dasharray="0.1 14"/><g transform="translate(70 12) rotate(25)"><rect x="0" y="0" width="12" height="34" rx="3" fill="#f59e0b"/><path d="M0 34h12l-6 12z" fill="#fde68a"/><rect x="0" y="0" width="12" height="7" rx="3" fill="#b45309"/></g></svg>',
  // a house outline half coloured in
  colour:
    '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M14 46L48 16L82 46Z" fill="#fca5a5" stroke="#44403c" stroke-width="5" stroke-linejoin="round"/><rect x="22" y="46" width="52" height="36" fill="#fff" stroke="#44403c" stroke-width="5" stroke-linejoin="round"/><rect x="38" y="58" width="16" height="24" fill="#93c5fd" stroke="#44403c" stroke-width="4"/><circle cx="72" cy="22" r="9" fill="#fde047" stroke="#44403c" stroke-width="3"/></svg>',
  // a free squiggle in rainbow colours
  free: '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M10 62C22 20 34 20 40 52S58 86 70 44 84 24 88 30" fill="none" stroke="#ef4444" stroke-width="9" stroke-linecap="round"/><path d="M10 70C22 30 34 30 40 62S58 94 70 54 84 34 88 40" fill="none" stroke="#3b82f6" stroke-width="9" stroke-linecap="round" opacity=".85"/><circle cx="78" cy="16" r="7" fill="#facc15"/></svg>',
  // a faint sun with a bold crayon line over part of it
  copy: '<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="22" fill="none" stroke="#a78bfa" stroke-width="7" opacity=".35"/><g stroke="#a78bfa" stroke-width="6" stroke-linecap="round" opacity=".35"><path d="M48 8v10M48 78v10M8 48h10M78 48h10M20 20l7 7M69 69l7 7M20 76l7-7M69 27l7-7"/></g><path d="M26 48a22 22 0 0 1 22-22 22 22 0 0 1 22 22" fill="none" stroke="#f59e0b" stroke-width="8" stroke-linecap="round"/><path d="M48 8v10M8 48h10M78 48h10M20 20l7 7M69 27l7-7" stroke="#f97316" stroke-width="6" stroke-linecap="round" fill="none"/></svg>',
};
