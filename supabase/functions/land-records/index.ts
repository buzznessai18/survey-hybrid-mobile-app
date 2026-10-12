// POST /functions/v1/land-records   (1/14 forms — Goa Form I & XIV)
// Reads and writes: admins + company users (020; legacy field role read-only, also enforced in the database).
//   { action: "check_duplicate", survey_number, sub_division?, village?, latitude?, longitude?, exclude_id? }
//   { action: "submit", form:{id,...}, farmer:{id}|{name,mobile,...}, survey?:{id,crop_id,area,...,latitude,...} }   admins + company users
//   { action: "get", id | form_id }
//   { action: "list", mine?, q?, status?, taluka?, page? }
//   { action: "update", id, ...fields }                           admins + company users
//   { action: "set_status", id, status }                          admins + company users (verify / reject)
import { requireUser } from "../_shared/auth.ts";
import { dbError, HttpError, json, readParams, serve } from "../_shared/http.ts";
import {
  decorateForms, FORM_COLUMNS, FORM_STATUSES, GOA_TALUKAS, IRRIGATION_SOURCES, LAND_CLASSES,
  loadForm, loadSurveysFor, optionalTrimmed, requireEditor, surveyNumberFilter, type Row,
} from "../_shared/records.ts";
import { assertPhotoPath, checkDuplicates } from "../_shared/surveys.ts";
import {
  AREA_UNITS, DUPLICATE_REASONS, farmer as farmerSchema, gpsAccuracy, latitude, likePattern, longitude, mobile,
  normalizeCode, pagination, paginationMeta, parse, rangeFor, requiredText, subDivision, surveyNumber, uuid, visitDate, z,
} from "../_shared/validation.ts";

const landFields = {
  village: requiredText("Village", 100),
  taluka: z.enum(GOA_TALUKAS, { errorMap: () => ({ message: "Select a Goa taluka" }) }),
  survey_number: surveyNumber,
  sub_division: subDivision,
  // Optional since 021: the app's land step asks only for village, taluka, survey no., sub-division, remarks.
  occupant_names: optionalTrimmed(500),
  tenant_name: optionalTrimmed(200),
  area_sq_m: z.preprocess(
    (v) => (v === "" ? null : v),
    z.coerce.number({ invalid_type_error: "Area must be a number" }).gt(0, "Area must be greater than 0").max(100_000_000).nullable().optional(),
  ),
  land_class: z.enum(LAND_CLASSES).nullable().optional(),
  assessment_rs: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(0).optional()),
  kharif_crop_id: uuid.nullable().optional(),
  rabi_crop_id: uuid.nullable().optional(),
  irrigation_source: z.enum(IRRIGATION_SOURCES).default("rainfed"),
  mutation_number: optionalTrimmed(50),
  remarks: optionalTrimmed(2000),
};

const farmerRef = z.union([
  z.object({ id: uuid }),
  farmerSchema.extend({
    father_name: optionalTrimmed(150),
    gender: z.enum(["male", "female", "other"]).nullable().optional(),
    category: z.enum(["general", "obc", "sc", "st"]).nullable().optional(),
    village: optionalTrimmed(100),
    taluka: z.enum(GOA_TALUKAS).nullable().optional(),
    address: optionalTrimmed(500),
    mobile,
  }),
]);

const surveyPart = z
  .object({
    id: uuid,
    crop_id: uuid,
    area: z.coerce.number().gt(0, "Area must be greater than 0").max(1_000_000),
    area_unit: z.enum(AREA_UNITS),
    visit_date: visitDate,
    latitude,
    longitude,
    gps_accuracy: gpsAccuracy,
    photo_path: z.preprocess((v) => (v === "" ? null : v), z.string().max(300).nullable().optional()),
    duplicate_reason: z.preprocess((v) => (v === "" ? null : v), z.enum(DUPLICATE_REASONS).nullable().optional()),
    duplicate_reason_notes: optionalTrimmed(1000),
    notes: optionalTrimmed(2000),
  })
  .refine((v) => v.duplicate_reason !== "other" || !!v.duplicate_reason_notes, {
    message: "Please describe the reason", path: ["duplicate_reason_notes"],
  });

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("check_duplicate"),
    survey_number: surveyNumber,
    sub_division: subDivision,
    village: z.string().trim().max(100).optional(),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    exclude_id: uuid.optional(),
  }),
  z.object({ action: z.literal("submit"), form: z.object({ id: uuid, ...landFields }), farmer: farmerRef, survey: surveyPart.optional() }),
  z.object({ action: z.literal("get"), id: uuid.optional(), form_id: z.string().regex(/^LR-\d{6,}$/i).optional() }),
  z.object({
    action: z.literal("list"),
    mine: z.boolean().optional(),
    q: z.string().trim().max(100).optional(),
    status: z.enum(FORM_STATUSES).optional(),
    taluka: z.enum(GOA_TALUKAS).optional(),
    ...pagination,
  }),
  z.object({ action: z.literal("update"), id: uuid, ...Object.fromEntries(Object.entries(landFields).map(([k, v]) => [k, v.optional()])) }),
  z.object({ action: z.literal("set_status"), id: uuid, status: z.enum(FORM_STATUSES), remarks: optionalTrimmed(2000) }),
]);

/** Square metres per field-survey area unit; bigha varies by state, so it is not converted. */
const SQ_M_PER_UNIT: Partial<Record<(typeof AREA_UNITS)[number], number>> = {
  sq_m: 1, hectare: 10_000, acre: 4046.8564224, guntha: 101.17141056, cent: 40.468564224,
};

serve(["POST"], async (req) => {
  const { profile, adminClient, userClient } = await requireUser(req, ["user", "field_surveyor", "admin"]);
  // deno-lint-ignore no-explicit-any
  const input = parse(schema, await readParams(req)) as any;

  switch (input.action) {
    case "check_duplicate": {
      let fq = adminClient.from("land_records").select(FORM_COLUMNS)
        .eq("survey_number_norm", normalizeCode(input.survey_number))
        .eq("sub_division_norm", normalizeCode(input.sub_division ?? ""));
      if (input.exclude_id) fq = fq.neq("id", input.exclude_id);
      const [{ data: formRows, error }, surveyCheck] = await Promise.all([
        fq.limit(20),
        checkDuplicates(adminClient, profile, {
          survey_number: input.survey_number, sub_division: input.sub_division,
          latitude: input.latitude ?? null, longitude: input.longitude ?? null,
        }),
      ]);
      if (error) throw dbError(error);
      let forms = await decorateForms(adminClient, (formRows ?? []) as Row[]);
      // Same village first (survey numbers repeat across villages).
      if (input.village) {
        const v = input.village.toLowerCase();
        forms = forms.sort((a, b) => Number(b.village.toLowerCase() === v) - Number(a.village.toLowerCase() === v));
      }
      const sameVillage = input.village ? forms.filter((f) => f.village.toLowerCase() === input.village.toLowerCase()) : forms;
      return json({
        duplicate_found: sameVillage.length > 0 || surveyCheck.duplicate_found,
        forms,
        same_village_forms: sameVillage.length,
        survey_check: surveyCheck,
      });
    }

    case "submit": {
      requireEditor(profile);
      if (input.survey?.photo_path) await assertPhotoPath(adminClient, profile.id, input.survey.id, input.survey.photo_path);
      // No area on the form: take it from the field survey (total land + eligibility rules use it).
      const perUnit = input.survey ? SQ_M_PER_UNIT[input.survey.area_unit] : undefined;
      if (input.form.area_sq_m == null && input.survey && perUnit) {
        input.form.area_sq_m = Math.round(input.survey.area * perUnit * 100) / 100;
      }
      const { data, error } = await adminClient.rpc("submit_land_form", {
        p_actor: profile.id,
        p_payload: { form: input.form, farmer: input.farmer, survey: input.survey ?? null },
      });
      if (error) throw dbError(error);
      const result = data as { id: string; created: boolean; survey: { id: string; created: boolean } | null };
      const [form, surveys] = await Promise.all([
        loadForm(adminClient, { id: result.id }),
        loadSurveysFor(adminClient, { land_record_id: result.id }),
      ]);
      return json({ form, surveys, created: result.created, idempotent_replay: !result.created }, result.created ? 201 : 200);
    }

    case "get": {
      if (!input.id && !input.form_id) throw new HttpError(422, "validation_error", "Provide id or form_id");
      const form = await loadForm(adminClient, { id: input.id, form_id: input.form_id?.toUpperCase() });
      const surveys = await loadSurveysFor(adminClient, { land_record_id: form.id });
      const { data: farmer } = await adminClient.from("farmers").select("id, name, mobile, village, taluka, category").eq("id", form.farmer_id).maybeSingle();
      return json({ form, farmer, surveys });
    }

    case "list": {
      let q = adminClient.from("land_records").select(FORM_COLUMNS, { count: "exact" });
      // Admins and company users see every form; legacy field surveyors only their own.
      if (profile.role === "field_surveyor" || input.mine) q = q.eq("created_by", profile.id);
      if (input.status) q = q.eq("status", input.status);
      if (input.taluka) q = q.eq("taluka", input.taluka);
      if (input.q) {
        const like = likePattern(input.q);
        const snFilter = surveyNumberFilter(input.q);
        q = q.or(
          `occupant_names.ilike.${like},village.ilike.${like},form_id.ilike.${like},survey_number.ilike.${like}` +
            (snFilter ? `,${snFilter}` : ""),
        );
      }
      const [from, to] = rangeFor(input.page, input.page_size);
      const { data, count, error } = await q.order("created_at", { ascending: false }).range(from, to);
      if (error) throw dbError(error);
      return json({ data: await decorateForms(adminClient, (data ?? []) as Row[]), pagination: paginationMeta(input.page, input.page_size, count) });
    }

    case "update": {
      requireEditor(profile);
      await loadForm(adminClient, { id: input.id }); // 404 when missing
      const { action: _a, id, ...changes } = input;
      if (Object.keys(changes).length === 0) throw new HttpError(422, "validation_error", "Nothing to update");
      // Through the user's own session so the audit log records who changed it.
      const { data: updated, error } = await userClient.from("land_records").update(changes).eq("id", id).select("id");
      if (error) throw dbError(error);
      if (!updated?.length) throw new HttpError(404, "not_found", "1/14 form not found");
      return json({ form: await loadForm(adminClient, { id }) });
    }

    case "set_status": {
      requireEditor(profile);
      const changes: Row = { status: input.status };
      if (input.remarks !== undefined) changes.remarks = input.remarks;
      const { error } = await userClient.from("land_records").update(changes).eq("id", input.id);
      if (error) throw dbError(error);
      return json({ form: await loadForm(adminClient, { id: input.id }) });
    }
  }
  throw new HttpError(400, "invalid_action", "Unknown action");
});
