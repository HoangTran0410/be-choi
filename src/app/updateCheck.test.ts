import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { CHECK_GAP_MS, JUST_UPDATED_FLAG, announceIfJustUpdated, isNewerBuild, watchForUpdates } from './updateCheck';

const OLD = '2026-09-24T07:00:00.000Z';
const NEW = '2026-09-24T09:30:00.000Z';

function serve(build: string | null) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => (build ? new Response(JSON.stringify({ build }), { status: 200 }) : new Response('', { status: 404 })));
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const notice = () => document.querySelector<HTMLElement>('.update-notice');

describe('isNewerBuild', () => {
  it('compares build stamps, and never trusts one it cannot read', () => {
    expect(isNewerBuild(NEW, OLD)).toBe(true);
    expect(isNewerBuild(OLD, NEW)).toBe(false);
    expect(isNewerBuild(OLD, OLD)).toBe(false);
    expect(isNewerBuild('garbage', OLD)).toBe(false);
    expect(isNewerBuild(undefined, OLD)).toBe(false);
  });
});

describe('watchForUpdates', () => {
  let t = 0;
  beforeEach(() => {
    t = 1_000_000;
    document.body.innerHTML = '';
    sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('says nothing when the server has the same build', async () => {
    serve(OLD);
    const u = watchForUpdates({ current: OLD, base: '/', apply: () => undefined, now: () => t });
    await u.check(true);
    expect(notice()).toBeNull();
    u.stop();
  });

  it('asks the worker to fetch a newer build, and offers it once the worker has it', async () => {
    serve(NEW);
    const refreshWorker = vi.fn(async () => undefined);
    const apply = vi.fn();
    const u = watchForUpdates({ current: OLD, base: '/', apply, refreshWorker, now: () => t });
    await u.check(true);
    expect(refreshWorker).toHaveBeenCalledOnce();
    expect(notice()).toBeNull();
    u.ready();
    expect(notice()?.textContent).toContain('Có bản mới');
    notice()!.querySelector<HTMLElement>('.update-notice-go')!.click();
    expect(apply).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(JUST_UPDATED_FLAG)).toBe('1');
    u.stop();
  });

  it('offers a reload straight away when there is no service worker', async () => {
    serve(NEW);
    const u = watchForUpdates({ current: OLD, base: '/', apply: () => undefined, now: () => t });
    await u.check(true);
    expect(notice()).not.toBeNull();
    u.stop();
  });

  it('does not ask again within a minute of the last time', async () => {
    const f = serve(OLD);
    const u = watchForUpdates({ current: OLD, base: '/', apply: () => undefined, now: () => t });
    await u.check();
    await u.check();
    expect(f).toHaveBeenCalledTimes(1);
    t += CHECK_GAP_MS + 1;
    await u.check();
    expect(f).toHaveBeenCalledTimes(2);
    u.stop();
  });

  it('looks again when the app comes back to the front', async () => {
    const f = serve(OLD);
    const u = watchForUpdates({ current: OLD, base: '/', apply: () => undefined, now: () => t });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(f).toHaveBeenCalledOnce();
    u.stop();
  });

  it('stays quiet after "later" until the app is opened again', async () => {
    serve(NEW);
    const u = watchForUpdates({ current: OLD, base: '/', apply: () => undefined, now: () => t });
    await u.check(true);
    notice()!.querySelector<HTMLElement>('.update-notice-close')!.click();
    expect(notice()).toBeNull();
    await u.check(true);
    expect(notice()).toBeNull();
    u.stop();
  });

  it('keeps quiet offline or when the server cannot be reached', async () => {
    serve(null);
    const u = watchForUpdates({ current: OLD, base: '/', apply: () => undefined, now: () => t });
    await u.check(true);
    expect(notice()).toBeNull();
    u.stop();
  });
});

describe('announceIfJustUpdated', () => {
  it('says so once after the reload, then never again', () => {
    document.body.innerHTML = '';
    sessionStorage.setItem(JUST_UPDATED_FLAG, '1');
    announceIfJustUpdated(NEW);
    expect(document.querySelector('.update-notice-done')?.textContent).toContain('Đã cập nhật');
    document.body.innerHTML = '';
    announceIfJustUpdated(NEW);
    expect(document.querySelector('.update-notice-done')).toBeNull();
  });
});
