const pad = (n: number) => String(n).padStart(2, '0');

/**
 * When this build was made, in the device's own time, e.g. "Bản dựng 14:05 · 24/09/2026".
 * A semver that never moves says nothing to a parent checking whether the tablet has
 * picked up yesterday's fix; the build time does. Null when the stamp is missing or
 * unreadable, so the caller can fall back to the version alone.
 */
export function formatBuildTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return `Bản dựng ${time} · ${date}`;
}
