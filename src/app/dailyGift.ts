import { dateKeyOf } from './today';

const GIFT_KEY = 'be-choi:daily-gift';

/** True until the child opens today's gift. A missed day costs nothing: there is never a pile, never a streak. */
export function giftAvailable(now: Date = new Date()): boolean {
  try {
    return localStorage.getItem(GIFT_KEY) !== dateKeyOf(now);
  } catch {
    return false;
  }
}

export function markGiftOpened(now: Date = new Date()): void {
  try {
    localStorage.setItem(GIFT_KEY, dateKeyOf(now));
  } catch {
    /* private mode: the gift may show again, harmless */
  }
}
