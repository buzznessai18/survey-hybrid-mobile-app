// GET|POST /functions/v1/search-surveys
// Search across surveys visible to the caller (RLS-scoped): admins and
// read-only users see all surveys, supervisors their team. Admins can export CSV.
import { requireViewer } from "../_shared/auth.ts";
import { surveyNumberFilter } from "../_shared/records.ts";
import { config } from "../_shared/config.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { dbError, HttpError, json, readParams, serve } from "../_shared/http.ts";
import { formatSurvey, LIST_COLUMNS, signPhotoUrls } from "../_shared/surveys.ts";
import {
  DUPLICATE_STATUSES, isoDate, likePattern, listOf, normalizeCode, normalizeMobile, pagination,
  paginationMeta, parse, rangeFor, SUBMISSION_STATUSES, uuid, z,
} from "../_shared/validation.ts";

const schema = z.object({
  ...pagination,
  search: z.string().trim().max(100).optional(),
  farmer_name: z.string().trim().min(1).max(150).optional(),
  farmer_mobile: z.string().trim().min(3).max(20).optional(),
  survey_number: z.string().trim().min(1).max(50).optional(),
  sub_division: z.string().trim().min(1).max(50).optional(),
  crop_id: uuid.optional(),
  crop: z.string().trim().min(1).max(100).optional(),
  surveyor_id: uuid.optional(),
  date_from: isoDate.optional(),
  date_to: isoDate.optional(),
  duplicate_status: listOf([...DUPLICATE_STATUSES]),
  status: listOf([...SUBMISSION_STATUSES]),
  sort: z.enum(["created_at", "visit_date", "survey_number"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
  format: z.enum(["json", "csv"]).default("json"),
  include_photo_urls: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
});

const EXPORT_BATCH = 1000;

const EXPORT_COLUMNS = [
  "survey_id", "survey_number", "sub_division", "farmer_name", "farmer_mobile", "crop_name", "area",
  "area_unit", "visit_date", "collected_by_name", "latitude", "longitude", "gps_accuracy",
  "duplicate_status", "submission_status", "duplicate_reason", "notes", "created_at",
];

serve(["GET", "POST"], async (req) => {
  // Admins/supervisors read through RLS; users and no-login guests via the
  // service client (fields limited to LIST_COLUMNS, mobiles masked below).
  const { profile, readClient, adminClient } = await requireViewer(req);
  const p = parse(schema, await readParams(req));
  const isExport = p.format === "csv";
  if (isExport && profile.role !== "admin") {
    throw new HttpError(403, "forbidden", "Only admins can export data");
  }

  let query = readClient
    .from("survey_details")
    .select(isExport ? EXPORT_COLUMNS.join(", ") : LIST_COLUMNS, { count: "exact" });

  if (p.search) {
    const like = likePattern(p.search);
    const snFilter = surveyNumberFilter(p.search);
    query = query.or(
      `farmer_name.ilike.${like},farmer_mobile.ilike.${like},survey_number.ilike.${like},survey_id.ilike.${like}` +
        (snFilter ? `,${snFilter}` : ""),
    );
  }
  if (p.farmer_name) query = query.ilike("farmer_name", likePattern(p.farmer_name));
  if (p.farmer_mobile) query = query.ilike("farmer_mobile", likePattern(normalizeMobile(p.farmer_mobile)));
  if (p.survey_number) query = query.eq("survey_number_norm", normalizeCode(p.survey_number));
  if (p.sub_division) query = query.eq("sub_division_norm", normalizeCode(p.sub_division));
  if (p.crop_id) query = query.eq("crop_id", p.crop_id);
  if (p.crop) query = query.ilike("crop_name", likePattern(p.crop));
  if (p.surveyor_id) query = query.eq("collected_by", p.surveyor_id);
  if (p.date_from) query = query.gte("visit_date", p.date_from);
  if (p.date_to) query = query.lte("visit_date", p.date_to);
  if (p.duplicate_status) query = query.in("duplicate_status", p.duplicate_status);
  if (p.status) query = query.in("submission_status", p.status);

  query = query.order(p.sort, { ascending: p.order === "asc" }).order("id");

  if (isExport) {
    // PostgREST caps rows per request (api.max_rows, default 1000): page through.
    // deno-lint-ignore no-explicit-any
    const rows: any[] = [];
    let total = 0;
    for (let from = 0; from < config.maxExportRows; from += EXPORT_BATCH) {
      const to = Math.min(from + EXPORT_BATCH, config.maxExportRows) - 1;
      const { data, count, error } = await query.range(from, to);
      if (error) throw dbError(error);
      total = count ?? total;
      rows.push(...(data ?? []));
      if (!data || data.length < to - from + 1) break;
    }
    return csvResponse(rows, total);
  }

  const [from, to] = rangeFor(p.page, p.page_size);
  const { data, count, error } = await query.range(from, to);
  if (error) throw dbError(error);

  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []) as any[];
  const photos = p.include_photo_urls ? await signPhotoUrls(adminClient, rows.map((r) => r.photo_path)) : undefined;
  return json({
    data: rows.map((r) => formatSurvey(r, photos)),
    pagination: paginationMeta(p.page, p.page_size, count),
  });
});

// deno-lint-ignore no-explicit-any
function csvResponse(rows: any[], total: number): Response {
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    // Neutralise spreadsheet formula injection in text cells.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [EXPORT_COLUMNS.join(","), ...rows.map((r) => EXPORT_COLUMNS.map((c) => escape(r[c])).join(","))];
  return new Response(lines.join("\n"), {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="surveys-${new Date().toISOString().slice(0, 10)}.csv"`,
      "X-Total-Count": String(total),
      "X-Truncated": String(total > rows.length),
    },
  });
}
