/**
 * Formats a timestamp as a compact relative-time label like "3m", "2h", "5d".
 *
 * Designed for sidebar/list contexts where space is tight. Uses the smallest
 * unit that produces a value >= 1; falls back to weeks for older timestamps.
 */
export function formatRelativeTime(input: string | number | Date | null | undefined): string {
  if (!input) return "";
  const ts = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (!Number.isFinite(ts)) return "";
  const diffMs = Date.now() - ts;
  const sec = Math.max(0, Math.round(diffMs / 1000));
  if (sec < 5) return "now";
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo`;
  const yr = Math.round(day / 365);
  return `${yr}y`;
}
