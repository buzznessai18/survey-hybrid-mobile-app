// GET|POST /functions/v1/get-survey-map-data
// Lightweight survey points inside a bounding box, scoped by RLS
// (surveyor: own, supervisor: team, admin: all).
import { requireViewer } from "../_shared/auth.ts";
import { config } from "../_shared/config.ts";
import { dbError, json, readParams, serve } from "../_shared/http.ts";
import { toNumber } from "../_shared/surveys.ts";
import { DUPLICATE_STATUSES, isoDate, latitude, listOf, longitude, parse, uuid, z } from "../_shared/validation.ts";

const schema = z
  .object({
    min_lat: latitude,
    min_lng: longitude,
    max_lat: latitude,
    max_lng: longitude,
    duplicate_status: listOf([...DUPLICATE_STATUSES]),
    crop_id: uuid.optional(),
    surveyor_id: uuid.optional(),
    date_from: isoDate.optional(),
    date_to: isoDate.optional(),
    limit: z.coerce.number().int().min(1).max(config.mapMaxLimit).default(config.mapDefaultLimit),
  })
  .refine((v) => v.min_lat < v.max_lat, { message: "min_lat must be less than max_lat", path: ["min_lat"] })
  // Bounding boxes crossing the antimeridian are not supported; split them client-side.
  .refine((v) => v.min_lng < v.max_lng, { message: "min_lng must be less than max_lng", path: ["min_lng"] });

serve(["GET", "POST"], async (req) => {
  const { profile, readClient } = await requireViewer(req);
  const p = parse(schema, await readParams(req));

  const { data, error } = await readClient.rpc("get_survey_map_points", {
    p_min_lat: p.min_lat,
    p_min_lng: p.min_lng,
    p_max_lat: p.max_lat,
    p_max_lng: p.max_lng,
    p_duplicate_status: p.duplicate_status ?? null,
    p_crop_id: p.crop_id ?? null,
    // Surveyors are already limited to their own surveys by RLS.
    p_collected_by: profile.role === "field_surveyor" ? null : p.surveyor_id ?? null,
    p_from: p.date_from ?? null,
    p_to: p.date_to ?? null,
    p_limit: p.limit + 1, // one extra row tells us whether results were truncated
  });
  if (error) throw dbError(error);

  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []) as any[];
  const truncated = rows.length > p.limit;
  return json({
    points: rows.slice(0, p.limit).map((r) => ({
      id: r.id,
      survey_id: r.survey_id,
      survey_number: r.survey_number,
      sub_division: r.sub_division,
      farmer_name: r.farmer_name,
      latitude: toNumber(r.latitude),
      longitude: toNumber(r.longitude),
      duplicate_status: r.duplicate_status,
      crop: r.crop,
    })),
    count: Math.min(rows.length, p.limit),
    // true = zoom in or add filters to see every point in this area.
    truncated,
  });
});
