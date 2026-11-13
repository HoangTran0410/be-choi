import { loadVersioned, saveVersioned, type Backend, type VersionedSpec } from './save';

/**
 * One shared record of what the child knows, across every learning game.
 *
 * Each game keeps its own in-game difficulty, but also reports here with a namespaced
 * concept id (`num:5`, `letter:a`, `color:red`, `shape:circle`, `tone:sắc`…). This store adds
 * what the per-game models lack: real days. A concept answered right climbs a Leitner box and
 * comes back for review after 1, 2, 4, 7, then 14 days; a wrong first try drops it to box 1.
 * No punishment is ever shown to the child: this only decides what to bring up again, and
 * gives the parent corner a picture of what the child has learned.
 *
 * Pure functions take the state and a day number; `recordSkill`/`dueSkills` wrap them with storage.
 */

export interface SkillStat {
  /** Leitner box 0 (just met) … 5 (solid). */
  b: number;
  /** Times answered. */
  a: number;
  /** Right on the first try. */
  r: number;
  /** Day number (days since epoch, local) last answered. */
  d: number;
}

export interface SkillState {
  skills: Record<string, SkillStat>;
}

export const SKILLS_KEY = 'be-choi:skills';
export const MAX_BOX = 5;
/** Days to wait before reviewing, per box. Box 0 is due the same day. */
export const REVIEW_DAYS: readonly number[] = [0, 1, 2, 4, 7, 14];

const SPEC: VersionedSpec<SkillState> = {
  current: 1,
  validate(data) {
    const raw = data.skills;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const skills: Record<string, SkillStat> = {};
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v !== 'object' || v === null) continue;
      const s = v as Record<string, unknown>;
      const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
      skills[id] = { b: Math.max(0, Math.min(MAX_BOX, Math.round(num(s.b)))), a: num(s.a), r: num(s.r), d: num(s.d) };
    }
    return { skills };
  },
};

/** Local calendar day as a whole number, so "a day later" survives timezones and DST. */
export function dayNumber(now: Date = new Date()): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
}

/** The domain of a concept id: `num:5` → `num`. */
export function domainOf(id: string): string {
  const i = id.indexOf(':');
  return i < 0 ? id : id.slice(0, i);
}

export function emptySkills(): SkillState {
  return { skills: {} };
}

/** Note one answer. Only the first try counts; a found-after-a-miss answer is learning, not knowing. */
export function applyAnswer(state: SkillState, id: string, firstTryRight: boolean, day: number): SkillState {
  const old = state.skills[id] ?? { b: 0, a: 0, r: 0, d: day };
  let b = old.b;
  if (firstTryRight) {
    // Answering again on the same day does not climb more than one box per day.
    if (old.a === 0 || day > old.d || b === 0) b = Math.min(MAX_BOX, b + 1);
  } else {
    b = Math.min(b, 1);
  }
  const next: SkillStat = { b, a: old.a + 1, r: old.r + (firstTryRight ? 1 : 0), d: day };
  return { skills: { ...state.skills, [id]: next } };
}

/** True when this concept is due for review on `day`. */
export function isDue(stat: SkillStat, day: number): boolean {
  return day - stat.d >= (REVIEW_DAYS[stat.b] ?? 14);
}

/**
 * Concepts due for review today, most overdue first, optionally only from some domains
 * (or an explicit allow-list of ids a game can ask about).
 */
export function dueIds(state: SkillState, day: number, filter?: (id: string) => boolean): string[] {
  return Object.entries(state.skills)
    .filter(([id, s]) => s.a > 0 && isDue(s, day) && (!filter || filter(id)))
    .map(([id, s]) => ({ id, over: day - s.d - (REVIEW_DAYS[s.b] ?? 14), b: s.b }))
    .sort((x, y) => y.over - x.over || x.b - y.b || x.id.localeCompare(y.id))
    .map((x) => x.id);
}

export interface DomainSummary {
  domain: string;
  /** Concepts met at all. */
  met: number;
  /** Concepts in box ≥ 3 (answered right across several days). */
  solid: number;
  /** Concepts due for review today. */
  due: number;
}

/** Per-domain counts for the parent corner. */
export function summarize(state: SkillState, day: number): DomainSummary[] {
  const map = new Map<string, DomainSummary>();
  for (const [id, s] of Object.entries(state.skills)) {
    if (s.a <= 0) continue;
    const domain = domainOf(id);
    const row = map.get(domain) ?? { domain, met: 0, solid: 0, due: 0 };
    row.met++;
    if (s.b >= 3) row.solid++;
    if (isDue(s, day)) row.due++;
    map.set(domain, row);
  }
  return [...map.values()].sort((a, b) => b.met - a.met || a.domain.localeCompare(b.domain));
}

/** Vietnamese names for the domains the parent corner shows. Unknown domains show their id. */
export const DOMAIN_NAMES: Record<string, string> = {
  letter: 'Chữ cái',
  num: 'Số',
  math: 'Cộng trừ',
  color: 'Màu sắc',
  shape: 'Hình',
  size: 'To nhỏ',
  animal: 'Con vật',
  shadow: 'Cái bóng',
  pattern: 'Quy luật',
  sort: 'Phân loại',
  tone: 'Dấu thanh',
  syllable: 'Vần',
  opposite: 'Trái nghĩa',
  time: 'Thời gian',
  side: 'Trái phải',
  safety: 'An toàn',
  write: 'Tập viết',
  code: 'Lập trình',
  en: 'Tiếng Anh',
  family: 'Người thân',
};

// ---- storage wrappers ----

export function loadSkills(storage?: Backend | null): SkillState {
  return loadVersioned(SKILLS_KEY, SPEC, storage) ?? emptySkills();
}

export function saveSkills(state: SkillState, storage?: Backend | null): boolean {
  return saveVersioned(SKILLS_KEY, state, SPEC, storage);
}

/** Record one answer and save. Never throws. */
export function recordSkill(id: string, firstTryRight: boolean, now: Date = new Date(), storage?: Backend | null): void {
  try {
    saveSkills(applyAnswer(loadSkills(storage), id, firstTryRight, dayNumber(now)), storage);
  } catch {
    /* storage blocked: the game still works */
  }
}

/**
 * For drag-and-drop games where each piece is one question: `miss(piece)` on a wrong drop,
 * `hit(conceptId, piece)` when it lands right — records a first-try answer only if it never missed.
 */
export function firstTryTracker(record: (id: string, right: boolean) => void = (id, right) => recordSkill(id, right)) {
  const missed = new WeakSet<object>();
  return {
    miss(piece: object): void {
      missed.add(piece);
    },
    hit(id: string, piece: object): void {
      record(id, !missed.has(piece));
    },
  };
}

/** Concept ids due today (for a game to mix in as review questions). */
export function dueSkills(filter?: (id: string) => boolean, now: Date = new Date(), storage?: Backend | null): string[] {
  return dueIds(loadSkills(storage), dayNumber(now), filter);
}
