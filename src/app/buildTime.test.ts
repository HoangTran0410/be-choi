import { describe, it, expect } from 'vitest';
import { formatBuildTime } from './buildTime';

describe('formatBuildTime', () => {
  it('reads as local time then date, zero-padded', () => {
    // Built from local parts so the test holds in any time zone.
    expect(formatBuildTime(new Date(2026, 8, 24, 14, 5).toISOString())).toBe('Bản dựng 14:05 · 24/09/2026');
    expect(formatBuildTime(new Date(2026, 0, 3, 7, 9).toISOString())).toBe('Bản dựng 07:09 · 03/01/2026');
  });

  it('gives null for a missing or unreadable stamp', () => {
    expect(formatBuildTime(undefined)).toBeNull();
    expect(formatBuildTime('')).toBeNull();
    expect(formatBuildTime('not a date')).toBeNull();
  });
});
