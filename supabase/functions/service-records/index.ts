// POST /functions/v1/service-records   Farmer equipment / service records (migration 022).
//   { action: "create", id, farmer_name, gender?, address?, survey_number, sub_division?,
//     land_size, land_unit: "acre"|"sq_m", service_details? }                 admins + company users
//   { action: "list", q?, farmer_name?, survey_number?, sub_division?,
//     created_from?, created_to?, page?, page_size? }                         any active user
//   { action: "get", id? | record_no? }                                       any active user
//   { action: "delete", id }                                                  admins only
//
// record_no (RC-000123), created_at and created_by are always set by the
// server. create is idempotent on `id`: a retry after a lost response returns
// the record already saved (200, idempotent_replay: true) instead of a copy.
// Writes run through the caller's RLS-scoped client, so the database policies
// apply too and the audit log records the real user.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { dbError, HttpError, json, readParams, serve } from "../_shared/http.ts";
import { isAdmin, optionalTrimmed, requireEditor, surveyNumberFilter, type Row } from "../_shared/records.ts";
import { likePattern, normalizeCode, pagination, paginationMeta, parse, rangeFor, requiredText, uuid, z } from "../_shared/validation.ts";

export const LAND_UNITS = ["acre", "sq_m"] as const;
export const GENDERS = ["male", "female", "other"] as const;

const COLUMNS =
  "id, record_no, farmer_name, gender, address, survey_number, sub_division, land_size, land_unit, " +
  "service_details, created_by, created_at, updated_at, creator:profiles!service_records_created_by_fkey(full_name)";

const timestamp = z.string().datetime({ offset: true, message: "Use an ISO timestamp" });

const landSize = z.preprocess(
  (v) => (v === null || v === "" ? undefined : typeof v === "string" ? Number(v) : v),
  z.number({ required_error: "Land size is required", invalid_type_error: "Land size must be a number" })
    .finite("Land size must be a number")
    .gt(0, "Land size must be greater than 0")
    .max(100_000_000, "Land size is not plausible"),
);

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    id: uuid,
    farmer_name: requiredText("Farmer name", 150),
    gender: z.preprocess((v) => (v === "" ? null : v), z.enum(GENDERS).nullable().optional()),
    address: optionalTrimmed(500),
    survey_number: requiredText("Survey number", 50),
    sub_division: optionalTrimmed(50),
    land_size: landSize,
    land_unit: z.enum(LAND_UNITS, { errorMap: () => ({ message: "Choose Acres or Square metres" }) }),
    service_details: optionalTrimmed(2000),
  }),
  z.object({
    action: z.literal("list"),
    ...pagination,
    q: z.string().trim().max(100).optional(),
    farmer_name: z.string().trim().max(150).optional(),
    survey_number: z.string().trim().max(50).optional(),
    sub_division: z.string().trim().max(50).optional(),
    created_from: timestamp.optional(),
    created_to: timestamp.optional(),
  }),
  z.object({ action: z.literal("get"), id: uuid.optional(), record_no: z.string().trim().max(20).optional() }),
  z.object({ action: z.literal("delete"), id: uuid }),
]);

/** Flatten the embedded creator and return numbers as numbers. */
function format(r: Row): Row {
  const { creator, ...rest } = r;
  return { ...rest, land_size: Number(r.land_size), created_by_name: creator?.full_name ?? null };
}

async function loadRecord(admin: SupabaseClient, filter: { id?: string; record_no?: string }) {
  let q = admin.from("service_records").select(COLUMNS);
  q = filter.id ? q.eq("id", filter.id) : q.eq("record_no", filter.record_no!.toUpperCase());
  const { data, error } = await q.maybeSingle();
  if (error) throw dbError(error);
  return data ? format(data) : null;
}

serve(["POST"], async (req) => {
  // Legacy field_surveyor / supervisor accounts may view; only editors create (requireEditor below).
  const { profile, adminClient, userClient } = await requireUser(req);
  const input = parse(schema, await readParams(req));

  switch (input.action) {
    case "create": {
      requireEditor(profile);
      const { action: _a, ...fields } = input;

      const existing = await loadRecord(adminClient, { id: fields.id });
      if (existing) {
        if (existing.created_by !== profile.id) throw new HttpError(409, "conflict", "This record id is already in use");
        return json({ record: existing, created: false, idempotent_replay: true });
      }

      const { error } = await userClient.from("service_records").insert({
        ...fields,
        gender: fields.gender ?? null,
        address: fields.address ?? null,
        sub_division: fields.sub_division ?? null,
        service_details: fields.service_details ?? null,
        created_by: profile.id,
      });
      if (error) {
        // Two retries racing: the other one saved it.
        if (error.code === "23505") {
          const raced = await loadRecord(adminClient, { id: fields.id });
          if (raced && raced.created_by === profile.id) return json({ record: raced, created: false, idempotent_replay: true });
        }
        throw dbError(error);
      }
      const record = await loadRecord(adminClient, { id: fields.id });
      if (!record) throw new HttpError(500, "internal_error", "The record was saved but could not be loaded");
      return json({ record, created: true, idempotent_replay: false }, 201);
    }

    case "list": {
      let q = adminClient.from("service_records").select(COLUMNS, { count: "exact" });
      if (input.q) {
        const like = likePattern(input.q);
        const code = likePattern(normalizeCode(input.q));
        const terms = [
          `farmer_name.ilike.${like}`,
          `record_no.ilike.${like}`,
          `survey_number_norm.ilike.${code}`,
          `sub_division_norm.ilike.${code}`,
        ];
        const sn = surveyNumberFilter(input.q); // "312/4" -> survey 312, sub-division 4*
        if (sn) terms.push(sn);
        q = q.or(terms.join(","));
      }
      if (input.farmer_name) q = q.ilike("farmer_name", likePattern(input.farmer_name));
      if (input.survey_number) q = q.eq("survey_number_norm", normalizeCode(input.survey_number));
      if (input.sub_division) q = q.ilike("sub_division_norm", `${normalizeCode(input.sub_division).replace(/[%_\\]/g, "")}%`);
      if (input.created_from) q = q.gte("created_at", input.created_from);
      if (input.created_to) q = q.lte("created_at", input.created_to);

      const [from, to] = rangeFor(input.page, input.page_size);
      const { data, count, error } = await q.order("created_at", { ascending: false }).order("id").range(from, to);
      if (error) throw dbError(error);
      return json({ data: (data ?? []).map(format), pagination: paginationMeta(input.page, input.page_size, count) });
    }

    case "get": {
      if (!input.id && !input.record_no) throw new HttpError(422, "validation_error", "Provide id or record_no");
      const record = await loadRecord(adminClient, { id: input.id, record_no: input.record_no });
      if (!record) throw new HttpError(404, "not_found", "Record not found");
      return json({ record });
    }

    case "delete": {
      if (!isAdmin(profile)) throw new HttpError(403, "forbidden", "Only admins can delete records");
      const { data, error } = await userClient.from("service_records").delete().eq("id", input.id).select("id, record_no").maybeSingle();
      if (error) throw dbError(error);
      if (!data) throw new HttpError(404, "not_found", "Record not found");
      return json({ deleted: data });
    }
  }
});
