// POST /functions/v1/farmers
//   { action: "search", q?, taluka?, village?, page?, page_size? }  company users + admins
//                                                                     q: name, mobile, survey no. (312/4B) or 1/14 form no. (LR-000149)
//   { action: "get", id }                                            farmer 360: lands (1/14), surveys,
//                                                                     benefit applications + scheme eligibility
//   { action: "upsert", id?, name, mobile, ...profile }              admins + company users
import { requireUser } from "../_shared/auth.ts";
import { dbError, HttpError, json, readParams, serve } from "../_shared/http.ts";
import {
  decorateForms, eligibilityFor, FARMER_CATEGORIES, FARMER_COLUMNS, FORM_COLUMNS, GOA_TALUKAS,
  loadApplications, loadSurveysFor, optionalTrimmed, requireEditor, surveyNumberFilter, type Row,
} from "../_shared/records.ts";
import { likePattern, mobile, normalizeMobile, pagination, paginationMeta, parse, rangeFor, requiredText, uuid, z } from "../_shared/validation.ts";

const searchSchema = z.object({
  action: z.literal("search"),
  q: z.string().trim().max(100).optional(),
  taluka: z.enum(GOA_TALUKAS).optional(),
  village: z.string().trim().max(100).optional(),
  ...pagination,
});
const getSchema = z.object({ action: z.literal("get"), id: uuid });
const upsertSchema = z.object({
  action: z.literal("upsert"),
  id: uuid.optional(),
  name: requiredText("Farmer name", 150),
  mobile,
  father_name: optionalTrimmed(150),
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  category: z.enum(FARMER_CATEGORIES).nullable().optional(),
  village: optionalTrimmed(100),
  taluka: z.enum(GOA_TALUKAS).nullable().optional(),
  address: optionalTrimmed(500),
  notes: optionalTrimmed(2000),
});
const schema = z.discriminatedUnion("action", [searchSchema, getSchema, upsertSchema]);

serve(["POST"], async (req) => {
  const { profile, adminClient, userClient } = await requireUser(req, ["user", "field_surveyor", "admin"]);
  const input = parse(schema, await readParams(req));

  if (input.action === "search") {
    let query = adminClient.from("farmers").select(FARMER_COLUMNS, { count: "exact" });
    if (input.q) {
      const digits = normalizeMobile(input.q);
      const snFilter = surveyNumberFilter(input.q);
      const ors = [`name.ilike.${likePattern(input.q)}`, `village.ilike.${likePattern(input.q)}`];
      if (/^\d{3,}$/.test(digits)) ors.push(`mobile.ilike.%${digits}%`);
      if (snFilter) {
        // Farmers owning a 1/14 form or a survey with this survey number.
        const [l, s] = await Promise.all([
          adminClient.from("land_records").select("farmer_id").or(snFilter).limit(200),
          adminClient.from("surveys").select("farmer_id").or(snFilter).limit(200),
        ]);
        if (l.error) throw dbError(l.error);
        if (s.error) throw dbError(s.error);
        const ids = [...new Set([...(l.data ?? []), ...(s.data ?? [])].map((r: Row) => r.farmer_id))];
        if (ids.length) ors.push(`id.in.(${ids.join(",")})`);
      }
      const formCode = /^LR-?(\d{1,9})$/i.exec(input.q.trim());
      if (formCode) {
        // 1/14 form number, with or without leading zeros.
        const { data: f, error: fe } = await adminClient
          .from("land_records").select("farmer_id").eq("form_id", `LR-${formCode[1].padStart(6, "0")}`).limit(1);
        if (fe) throw dbError(fe);
        if (f?.length) ors.push(`id.in.(${f.map((r: Row) => r.farmer_id).join(",")})`);
      }
      query = query.or(ors.join(","));
    }
    if (input.taluka) query = query.eq("taluka", input.taluka);
    if (input.village) query = query.ilike("village", likePattern(input.village));
    const [from, to] = rangeFor(input.page, input.page_size);
    const { data, count, error } = await query.order("name").range(from, to);
    if (error) throw dbError(error);
    const rows = (data ?? []) as Row[];
    const ids = rows.map((r) => r.id);
    const [lands, surveys, apps] = ids.length
      ? await Promise.all([
        adminClient.from("land_records").select("farmer_id, form_id, area_sq_m, survey_number, sub_division").in("farmer_id", ids),
        adminClient.from("surveys").select("farmer_id").in("farmer_id", ids),
        adminClient.from("subsidy_applications").select("farmer_id, status").in("farmer_id", ids),
      ])
      : [{ data: [] }, { data: [] }, { data: [] }];
    type Stats = { forms: number; surveys: number; land: number; numbers: string[]; formIds: string[]; received: number; pending: number };
    const stats = new Map<string, Stats>();
    for (const id of ids) stats.set(id, { forms: 0, surveys: 0, land: 0, numbers: [], formIds: [], received: 0, pending: 0 });
    for (const l of (lands.data ?? []) as Row[]) {
      const st = stats.get(l.farmer_id)!;
      st.forms++;
      st.land += Number(l.area_sq_m);
      st.numbers.push(l.sub_division ? `${l.survey_number}/${l.sub_division}` : l.survey_number);
      st.formIds.push(l.form_id);
    }
    for (const a of (apps.data ?? []) as Row[]) {
      const st = stats.get(a.farmer_id)!;
      if (a.status === "disbursed") st.received++;
      else if (a.status !== "rejected") st.pending++;
    }
    for (const s of (surveys.data ?? []) as Row[]) stats.get(s.farmer_id)!.surveys++;
    return json({
      data: rows.map((r) => {
        const st = stats.get(r.id)!;
        return {
          ...r, form_count: st.forms, survey_count: st.surveys, land_sq_m: st.land, survey_numbers: st.numbers.slice(0, 5),
          form_ids: st.formIds.slice(0, 5), benefits_received: st.received, benefits_pending: st.pending,
        };
      }),
      pagination: paginationMeta(input.page, input.page_size, count),
    });
  }

  if (input.action === "get") {
    const { data: farmer, error } = await adminClient.from("farmers").select(FARMER_COLUMNS).eq("id", input.id).maybeSingle();
    if (error) throw dbError(error);
    if (!farmer) throw new HttpError(404, "not_found", "Farmer not found");
    const { data: formRows, error: fErr } = await adminClient
      .from("land_records").select(FORM_COLUMNS).eq("farmer_id", input.id).order("created_at", { ascending: false });
    if (fErr) throw dbError(fErr);
    const [forms, surveys] = await Promise.all([
      decorateForms(adminClient, (formRows ?? []) as Row[]),
      loadSurveysFor(adminClient, { farmer_id: input.id }),
    ]);
    // Everyone sees benefit history and pending/possible benefits; only admins change them.
    const [applications, eligibility] = await Promise.all([
      loadApplications(adminClient, { farmer_id: input.id }),
      eligibilityFor(adminClient, input.id),
    ]);
    const land = forms.filter((f) => f.status !== "rejected").reduce((sum, f) => sum + (f.area_sq_m ?? 0), 0);
    return json({ farmer: { ...farmer, land_sq_m: land }, forms, surveys, applications, eligibility });
  }

  // upsert (editors) — through the user's own session so the audit log records who changed it.
  requireEditor(profile);
  const { action: _a, id, ...fields } = input;
  const row = { ...fields, mobile: normalizeMobile(fields.mobile) };
  const { data, error } = id
    ? await userClient.from("farmers").update(row).eq("id", id).select(FARMER_COLUMNS).maybeSingle()
    : await userClient.from("farmers").insert({ ...row, created_by: profile.id }).select(FARMER_COLUMNS).single();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "not_found", "Farmer not found");
  return json({ farmer: data }, id ? 200 : 201);
});
