import { formatShortDate, fromIsoDate, toIsoDate } from "./date";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type PeriodMode = "week" | "month" | "custom";

/** A reporting period plus the period it is compared with (all YYYY-MM-DD, inclusive). */
export interface Period {
  mode: PeriodMode;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  /** "This week", "October 2026", "1 Oct 2026 – 7 Oct 2026" */
  label: string;
  /** What the change % is measured against: "last week", "same days last month", ... */
  compareLabel: string;
  /** True for the current week / month (it cannot move forward). */
  isCurrent: boolean;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (from: string, to: string) => Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / 86_400_000);
const minIso = (a: string, b: string) => (a < b ? a : b);
const lastOfMonth = (y: number, m: number) => new Date(y, m + 1, 0);

/** Monday-based week containing `d`. */
const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

/**
 * Week / month periods by offset from now (0 = current, -1 = previous, ...).
 * The current period ends today and is compared with the same number of days
 * of the period before (e.g. 1–7 Oct vs 1–7 Sep). Custom ranges are compared
 * with the same number of days immediately before them.
 */
export function getPeriod(mode: PeriodMode, offset = 0, custom?: { from: string; to: string }, today: Date = new Date()): Period {
  const todayIso = toIsoDate(today);

  if (mode === "week") {
    const start = addDays(weekStart(today), offset * 7);
    const fullEnd = toIsoDate(addDays(start, 6));
    const from = toIsoDate(start);
    const to = minIso(fullEnd, todayIso);
    const len = daysBetween(from, to);
    const prevStart = addDays(start, -7);
    const isCurrent = offset === 0;
    return {
      mode, from, to,
      prevFrom: toIsoDate(prevStart),
      prevTo: toIsoDate(addDays(prevStart, len)),
      label: isCurrent ? "This week" : offset === -1 ? "Last week" : `${formatShortDate(from)} – ${formatShortDate(fullEnd)}`,
      compareLabel: isCurrent ? "same days last week" : "previous week",
      isCurrent,
    };
  }

  if (mode === "month") {
    const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const from = toIsoDate(start);
    const to = minIso(toIsoDate(lastOfMonth(start.getFullYear(), start.getMonth())), todayIso);
    const len = daysBetween(from, to);
    const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    const prevEnd = lastOfMonth(prevStart.getFullYear(), prevStart.getMonth());
    const isCurrent = offset === 0;
    return {
      mode, from, to,
      prevFrom: toIsoDate(prevStart),
      prevTo: minIso(toIsoDate(addDays(prevStart, len)), toIsoDate(prevEnd)),
      label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`,
      compareLabel: isCurrent ? "same days last month" : "previous month",
      isCurrent,
    };
  }

  const from = custom?.from ?? todayIso;
  const to = custom?.to ?? todayIso;
  const len = daysBetween(from, to);
  const prevTo = addDays(fromIsoDate(from), -1);
  return {
    mode, from, to,
    prevFrom: toIsoDate(addDays(prevTo, -len)),
    prevTo: toIsoDate(prevTo),
    label: from === to ? formatShortDate(from) : `${formatShortDate(from)} – ${formatShortDate(to)}`,
    compareLabel: `previous ${len + 1} day${len ? "s" : ""}`,
    isCurrent: to >= todayIso,
  };
}

/** Number of days in a period (inclusive). */
export const periodDays = (p: { from: string; to: string }) => daysBetween(p.from, p.to) + 1;

/** % change vs the comparison period; null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface Bucket {
  /** First day of the bucket (YYYY-MM-DD). */
  start: string;
  /** Short axis label: "7", "Mon", "6 Oct", "Oct". */
  label: string;
  /** Full label for the tooltip: "Mon, 6 Oct" / "Week of 6 Oct" / "October 2026". */
  title: string;
  value: number;
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Group a daily series into chart bars: days up to 31 days, weeks up to ~4
 * months, months beyond that.
 */
export function bucketSeries(series: { date: string; value: number }[]): Bucket[] {
  const n = series.length;
  const unit = n <= 31 ? "day" : n <= 124 ? "week" : "month";
  const out: Bucket[] = [];
  for (const { date, value } of series) {
    const d = fromIsoDate(date);
    const key =
      unit === "day" ? date : unit === "week" ? toIsoDate(weekStart(d)) : `${date.slice(0, 7)}-01`;
    const last = out[out.length - 1];
    if (last && last.start === key) {
      last.value += value;
      continue;
    }
    const k = fromIsoDate(key);
    const short = `${k.getDate()} ${MONTHS[k.getMonth()].slice(0, 3)}`;
    out.push({
      start: key,
      label: unit === "day" ? (n <= 7 ? SHORT_DAYS[d.getDay()] : String(d.getDate())) : unit === "week" ? short : MONTHS[k.getMonth()].slice(0, 3),
      title: unit === "day" ? `${SHORT_DAYS[d.getDay()]}, ${short}` : unit === "week" ? `Week of ${short}` : `${MONTHS[k.getMonth()]} ${k.getFullYear()}`,
      value,
    });
  }
  return out;
}
