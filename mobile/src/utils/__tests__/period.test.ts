import { bucketSeries, getPeriod, percentChange, periodDays } from "../period";

// Wednesday 7 October 2026
const TODAY = new Date(2026, 9, 7, 15, 30);

describe("getPeriod", () => {
  it("this week runs Monday to today and compares with the same days last week", () => {
    const p = getPeriod("week", 0, undefined, TODAY);
    expect(p).toMatchObject({ from: "2026-10-05", to: "2026-10-07", prevFrom: "2026-09-28", prevTo: "2026-09-30", label: "This week", isCurrent: true });
  });

  it("past weeks are full Monday–Sunday weeks", () => {
    expect(getPeriod("week", -1, undefined, TODAY)).toMatchObject({
      from: "2026-09-28", to: "2026-10-04", prevFrom: "2026-09-21", prevTo: "2026-09-27", label: "Last week", isCurrent: false,
    });
    expect(getPeriod("week", -2, undefined, TODAY).label).toBe("21 Sep 2026 – 27 Sep 2026");
  });

  it("this month is month-to-date vs the same days last month", () => {
    expect(getPeriod("month", 0, undefined, TODAY)).toMatchObject({
      from: "2026-10-01", to: "2026-10-07", prevFrom: "2026-09-01", prevTo: "2026-09-07", label: "October 2026",
    });
  });

  it("past months are whole months; the comparison is clamped to the shorter previous month", () => {
    const march = getPeriod("month", -7, undefined, TODAY);
    expect(march).toMatchObject({ from: "2026-03-01", to: "2026-03-31", prevFrom: "2026-02-01", prevTo: "2026-02-28", label: "March 2026" });
  });

  it("crosses year boundaries", () => {
    expect(getPeriod("month", -10, undefined, TODAY)).toMatchObject({ from: "2025-12-01", to: "2025-12-31", prevFrom: "2025-11-01", prevTo: "2025-11-30" });
  });

  it("custom ranges compare with the same number of days just before", () => {
    const p = getPeriod("custom", 0, { from: "2026-09-10", to: "2026-09-19" }, TODAY);
    expect(p).toMatchObject({ prevFrom: "2026-08-31", prevTo: "2026-09-09", compareLabel: "previous 10 days", isCurrent: false });
    expect(periodDays(p)).toBe(10);
    expect(getPeriod("custom", 0, { from: "2026-10-07", to: "2026-10-07" }, TODAY)).toMatchObject({ prevFrom: "2026-10-06", prevTo: "2026-10-06", compareLabel: "previous 1 day" });
  });
});

describe("percentChange", () => {
  it("rounds, and is null without a baseline", () => {
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 10)).toBe(-50);
    expect(percentChange(3, 0)).toBeNull();
  });
});

describe("bucketSeries", () => {
  const days = (from: Date, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
      return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, value: 1 };
    });

  it("keeps days for a week (weekday labels) and a month (day numbers)", () => {
    const week = bucketSeries(days(new Date(2026, 9, 5), 7));
    expect(week.map((b) => b.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(week[0].title).toBe("Mon, 5 Oct");
    expect(bucketSeries(days(new Date(2026, 9, 1), 31)).length).toBe(31);
  });

  it("groups by Monday weeks up to ~4 months, then by month", () => {
    const q = bucketSeries(days(new Date(2026, 6, 1), 92)); // Wed 1 Jul .. 30 Sep
    expect(q[0]).toMatchObject({ start: "2026-06-29", value: 5, title: "Week of 29 Jun" });
    expect(q.reduce((n, b) => n + b.value, 0)).toBe(92);
    const y = bucketSeries(days(new Date(2025, 9, 8), 365));
    expect(y.length).toBe(13);
    expect(y[0]).toMatchObject({ label: "Oct", title: "October 2025", value: 24 });
  });
});
