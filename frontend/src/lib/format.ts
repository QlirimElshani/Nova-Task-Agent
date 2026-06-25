const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Jun 25, 2026" - matches the date format in the design. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * "Today" / "Tomorrow" / "Yesterday" when `iso` falls on one of those calendar
 * days (in local time), else null. Used for the amber badge on a task card.
 */
export function relativeDayLabel(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 86_400_000;
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / dayMs);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return null;
}

/**
 * Compact "time ago" for the conversation list: "now", "5m", "3h", "Yesterday",
 * else a short date ("Jun 25"). Keeps history rows tidy.
 */
export function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  if (hrs < 48) return 'Yesterday';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** First word of a name, e.g. "Alex Rivera" -> "Alex". */
export function firstNameOf(name: string | undefined, fallback = 'there'): string {
  return name?.trim().split(/\s+/)[0] || fallback;
}

/** Up to two uppercase initials, e.g. "Alex Rivera" -> "AR". */
export function initialsOf(name: string | undefined, fallback = 'U'): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
