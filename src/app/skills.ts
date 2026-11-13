import type { Skill } from '../core/types';

/** Icon and Vietnamese name of each skill, for the parent report. */
export const SKILL_LABELS: Record<Skill, [string, string]> = {
  'cause-effect': ['👆', 'Nhân quả'],
  sorting: ['🗂️', 'Phân loại'],
  matching: ['🔗', 'Nhận biết, ghép'],
  creative: ['🎨', 'Sáng tạo'],
  music: ['🎵', 'Âm nhạc'],
  memory: ['🧠', 'Trí nhớ'],
  listening: ['👂', 'Nghe'],
  counting: ['🔢', 'Đếm'],
  care: ['🧼', 'Chăm sóc, thói quen'],
  nature: ['🌿', 'Khám phá thiên nhiên'],
  puzzle: ['🧩', 'Xếp hình'],
  logic: ['💡', 'Tư duy'],
};
