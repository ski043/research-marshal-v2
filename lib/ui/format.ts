const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** "420ms", "1.6s", "42s", "1m 42s", "1h 02m". Negative input counts as zero. */
export function formatDuration(ms: number): string {
  const value = Math.max(0, ms);
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 10_000) return `${(value / 1000).toFixed(1)}s`;
  const seconds = Math.floor(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${pad(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

/** A running clock: "0:07", "1:42", "1:02:03". */
export function formatClock(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? `${hours}:${pad(minutes % 60)}:${pad(seconds % 60)}`
    : `${minutes}:${pad(seconds % 60)}`;
}

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/** Whole calendar days from `then` to `now` in the local time zone. */
export function daysAgo(then: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
}

export function formatDate(date: Date, now: Date): string {
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear()
    ? day
    : `${day} ${date.getFullYear()}`;
}

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "16 Nov 2026, 21:46": the same text in Node.js and in every browser. */
export function formatDateTime(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${formatTime(date)}`;
}

/** The heading of a history group: "Today", "Yesterday", or the date. */
export function dayLabel(date: Date, now: Date): string {
  const days = daysAgo(date, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return formatDate(date, now);
}

/** The time of a history entry: "now", "12m", "3h" on the same day, else the clock time. */
export function relativeTime(then: Date, now: Date): string {
  if (daysAgo(then, now) > 0) return formatTime(then);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export type DayGroup<T> = { label: string; items: T[] };

/** Groups items that are sorted newest first under one heading per calendar day. */
export function groupByDay<T>(
  items: readonly T[],
  dateOf: (item: T) => Date,
  now: Date,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const label = dayLabel(dateOf(item), now);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
