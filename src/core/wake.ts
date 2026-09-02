type WakeLockSentinelLike = { release(): Promise<void> };

/**
 * Keep the screen on while a game is open. Returns a release function.
 * Silently does nothing where the Wake Lock API is missing.
 */
export function requestWake(): () => void {
  const nav = navigator as Navigator & {
    wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
  };
  if (!nav.wakeLock) return () => undefined;

  let sentinel: WakeLockSentinelLike | null = null;
  let released = false;

  const acquire = async () => {
    if (released || document.visibilityState !== 'visible') return;
    try {
      sentinel = await nav.wakeLock!.request('screen');
    } catch {
      sentinel = null;
    }
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') void acquire();
  };

  document.addEventListener('visibilitychange', onVisible);
  void acquire();

  return () => {
    released = true;
    document.removeEventListener('visibilitychange', onVisible);
    void sentinel?.release().catch(() => undefined);
    sentinel = null;
  };
}
