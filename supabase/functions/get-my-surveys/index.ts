// GET|POST /functions/v1/get-my-surveys
// Paginated list of surveys created by the authenticated admin (or legacy surveyor).
import { requireUser } from "../_shared/auth.ts";
import { dbError, json, readParams, serve } from "../_shared/http.ts";
import { formatSurvey, LIST_COLUMNS, signPhotoUrls } from "../_shared/surveys.ts";
import {
  DUPLICATE_STATUSES, isoDate, likePattern, listOf, pagination, paginationMeta, parse, rangeFor,
  SUBMISSION_STATUSES, z,
} from "../_shared/validation.ts";

const schema = z.object({
  ...pagination,
  // Free text: farmer name, farmer mobile, survey number or survey id (SV-...).
  search: z.string().trim().max(100).optional(),
  status: listOf([...SUBMISSION_STATUSES]),
  duplicate_status: listOf([...DUPLICATE_STATUSES]),
  date_from: isoDate.optional(),
  date_to: isoDate.optional(),
  // For offline sync: only records changed after this timestamp.
  updated_since: z.string().datetime({ offset: true }).optional(),
  include_photo_urls: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
});

serve(["GET", "POST"], async (req) => {
  const { profile, userClient, adminClient } = await requireUser(req, ["admin", "user", "field_surveyor"]);
  const p = parse(schema, await readParams(req));

  let query = userClient
    .from("survey_details")
    .select(LIST_COLUMNS, { count: "exact" })
    .eq("collected_by", profile.id);

  if (p.search) {
    const like = likePattern(p.search);
    query = query.or(
      `farmer_name.ilike.${like},farmer_mobile.ilike.${like},survey_number.ilike.${like},survey_id.ilike.${like}`,
    );
  }
  if (p.status) query = query.in("submission_status", p.status);
  if (p.duplicate_status) query = query.in("duplicate_status", p.duplicate_status);
  if (p.date_from) query = query.gte("visit_date", p.date_from);
  if (p.date_to) query = query.lte("visit_date", p.date_to);
  if (p.updated_since) query = query.gt("updated_at", p.updated_since);

  const [from, to] = rangeFor(p.page, p.page_size);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error) throw dbError(error);

  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []) as any[];
  const photos = p.include_photo_urls ? await signPhotoUrls(adminClient, rows.map((r) => r.photo_path)) : undefined;

  return json({
    data: rows.map((r) => formatSurvey(r, photos)),
    pagination: paginationMeta(p.page, p.page_size, count),
  });
});
