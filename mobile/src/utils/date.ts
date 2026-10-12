// Manual formatting keeps output identical on Hermes/Android/iOS regardless of Intl support.
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date as YYYY-MM-DD. */
export function toIsoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse YYYY-MM-DD as a local date (no UTC shift). */
export function fromIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** "Wednesday, 24 September 2026" */
export function formatLongDate(d: Date = new Date()): string {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "24 Sep 2026" from YYYY-MM-DD or ISO timestamp */
export function formatShortDate(value: string | Date): string {
  const d = typeof value === "string" ? (value.length === 10 ? fromIsoDate(value) : new Date(value)) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

/** "10:20 AM" */
export function formatTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getHours();
  return `${pad(((h + 11) % 12) + 1)}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
}

/** "Today, 10:20 AM" / "24 Sep 2026, 10:20 AM" */
export function formatDateTime(value: string): string {
  const d = new Date(value);
  const today = toIsoDate() === toIsoDate(d);
  return `${today ? "Today" : formatShortDate(d)}, ${formatTime(d)}`;
}

export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

/** Local tomorrow — backend accepts visit dates up to +1 day for timezone slack. */
export function maxVisitDate(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return toIsoDate(t);
}

/**
 * Local calendar days (YYYY-MM-DD) -> the exact instants they start and end, as
 * ISO timestamps. Filtering server timestamps with these follows the user's own
 * timezone instead of UTC days.
 */
export function localDayRange(from: string, to: string): { created_from: string; created_to: string } {
  const start = fromIsoDate(from);
  const end = fromIsoDate(to);
  end.setHours(23, 59, 59, 999);
  return { created_from: start.toISOString(), created_to: end.toISOString() };
}
