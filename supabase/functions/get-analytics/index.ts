// POST /functions/v1/get-analytics   (admins) — home dashboard for a date range
//   { date_from, date_to, prev_from?, prev_to? }   (YYYY-MM-DD, inclusive, max 366 days)
// Returns { analytics: public.get_admin_analytics(...) }: totals, the comparison
// period's totals, a daily series and breakdowns (taluka, crop, scheme, users).
import { requireUser } from "../_shared/auth.ts";
import { dbError, json, readParams, serve } from "../_shared/http.ts";
import { isoDate, parse, z } from "../_shared/validation.ts";

const MAX_DAYS = 366;
const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;

const range = (a: string, b: string) => (v: Record<string, string | undefined>) => !v[a] || !v[b] || v[a]! <= v[b]!;

const schema = z
  .object({
    date_from: isoDate,
    date_to: isoDate,
    prev_from: isoDate.optional(),
    prev_to: isoDate.optional(),
  })
  .refine(range("date_from", "date_to"), { message: "Start date must be on or before the end date", path: ["date_from"] })
  .refine((v) => days(v.date_from, v.date_to) <= MAX_DAYS, { message: `Choose a range of at most ${MAX_DAYS} days`, path: ["date_to"] })
  .refine((v) => !v.prev_from === !v.prev_to, { message: "Send both prev_from and prev_to", path: ["prev_from"] })
  .refine(range("prev_from", "prev_to"), { message: "Comparison start must be on or before its end", path: ["prev_from"] });

serve(["POST"], async (req) => {
  const { adminClient } = await requireUser(req, ["admin"]);
  const p = parse(schema, await readParams(req));

  const { data, error } = await adminClient.rpc("get_admin_analytics", {
    p_from: p.date_from,
    p_to: p.date_to,
    p_prev_from: p.prev_from ?? null,
    p_prev_to: p.prev_to ?? null,
  });
  if (error) throw dbError(error);
  return json({ analytics: data });
});
