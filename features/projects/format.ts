// Date helpers. Dates in the product are calendar dates (`YYYY-MM-DD`) in Asia/Kolkata.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 2000 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** "2026-11-12" → "12 Nov 2026". Returns the input unchanged when it is not a valid date. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const datePart = value.slice(0, 10);
  if (!isValidIsoDate(datePart)) return value;
  const [year, month, day] = datePart.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** Today's calendar date in Asia/Kolkata as YYYY-MM-DD. */
export function todayInIndia(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(value: string, days: number): string {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * "just now", "5 min ago", "3 h ago", "2 days ago"; older than 30 days falls back to the date.
 * Hand-rolled because Hermes does not ship Intl.RelativeTimeFormat on every platform.
 */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days <= 30) return `${days} days ago`;
  return formatDate(todayInIndia(then));
}

/** "in 3 days" / "tomorrow" / "today" / "2 days overdue" for a due date. */
export function dueLabel(due: string, today: string): string {
  const [a, b] = [due, today].map((v) => {
    const [y, m, d] = v.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  }) as [number, number];
  const diff = Math.round((a - b) / 86_400_000);
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  if (diff > 1) return `Due in ${diff} days`;
  return `${-diff} ${-diff === 1 ? 'day' : 'days'} overdue`;
}
