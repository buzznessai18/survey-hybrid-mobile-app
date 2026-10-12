// POST /functions/v1/export-data   (admins) — rows for Excel/PDF reports
//   { dataset: "surveys"|"forms"|"farmers"|"applications", date_from?, date_to?, taluka? }
//   { dataset: "records", created_from?, created_to?, q? }   farmer equipment / service records (022).
//     created_from / created_to are ISO timestamps (the app sends the local-day boundaries, so the
//     range follows the user's timezone); q matches farmer name, survey no., sub-division or record no.
// Returns { title, columns:[{key,label}], rows:[...], total, truncated, generated_at, filters }.
import { requireUser } from "../_shared/auth.ts";
import { dbError, json, readParams, serve } from "../_shared/http.ts";
import { decorateForms, GOA_TALUKAS, loadApplications, surveyNumberFilter, type Row } from "../_shared/records.ts";
import { isoDate, likePattern, normalizeCode, parse, z } from "../_shared/validation.ts";

const MAX_ROWS = 5000;
const BATCH = 1000;

const schema = z.object({
  dataset: z.enum(["records", "surveys", "forms", "farmers", "applications"]),
  date_from: isoDate.optional(),
  created_from: z.string().datetime({ offset: true }).optional(),
  created_to: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().max(100).optional(),
  date_to: isoDate.optional(),
  taluka: z.enum(GOA_TALUKAS).optional(),
});

type Col = { key: string; label: string };
const COLS: Record<string, Col[]> = {
  records: [
    { key: "record_no", label: "Record no." }, { key: "created_at", label: "Date & time" }, { key: "farmer_name", label: "Farmer" },
    { key: "gender", label: "Gender" }, { key: "address", label: "Address" }, { key: "survey_number", label: "Survey no." },
    { key: "sub_division", label: "Sub-division" }, { key: "land_size", label: "Land size" }, { key: "land_unit", label: "Unit" },
    { key: "service_details", label: "Equipment / service" }, { key: "created_by_name", label: "Created by" },
  ],
  surveys: [
    { key: "survey_id", label: "Survey ID" }, { key: "visit_date", label: "Visit date" }, { key: "survey_no", label: "Survey no." },
    { key: "farmer_name", label: "Farmer" }, { key: "farmer_mobile", label: "Mobile" }, { key: "farmer_village", label: "Village" },
    { key: "farmer_taluka", label: "Taluka" }, { key: "crop_name", label: "Crop" }, { key: "area", label: "Area" },
    { key: "area_unit", label: "Unit" }, { key: "form_id", label: "1/14 form" }, { key: "collected_by_name", label: "Collected by" },
    { key: "latitude", label: "Latitude" }, { key: "longitude", label: "Longitude" }, { key: "gps_accuracy", label: "GPS accuracy (m)" },
    { key: "duplicate_status", label: "Duplicate status" }, { key: "submission_status", label: "Review status" },
  ],
  forms: [
    { key: "form_id", label: "Form ID" }, { key: "created", label: "Created" }, { key: "village", label: "Village" },
    { key: "taluka", label: "Taluka" }, { key: "survey_no", label: "Survey no." }, { key: "occupant_names", label: "Occupant(s)" },
    { key: "tenant_name", label: "Tenant" }, { key: "farmer_name", label: "Farmer" }, { key: "area_sq_m", label: "Area (sq.m)" },
    { key: "land_class", label: "Land class" }, { key: "kharif_crop_name", label: "Kharif crop" }, { key: "rabi_crop_name", label: "Rabi crop" },
    { key: "irrigation_source", label: "Irrigation" }, { key: "assessment_rs", label: "Assessment (Rs)" }, { key: "status", label: "Status" },
    { key: "created_by_name", label: "Entered by" },
  ],
  farmers: [
    { key: "name", label: "Farmer" }, { key: "mobile", label: "Mobile" }, { key: "father_name", label: "Father/Husband" },
    { key: "gender", label: "Gender" }, { key: "category", label: "Category" }, { key: "village", label: "Village" },
    { key: "taluka", label: "Taluka" }, { key: "form_count", label: "1/14 forms" }, { key: "land_sq_m", label: "Land (sq.m)" },
    { key: "survey_count", label: "Surveys" }, { key: "created", label: "Registered" },
  ],
  applications: [
    { key: "application_no", label: "Application" }, { key: "applied_on", label: "Applied on" }, { key: "scheme_name", label: "Scheme" },
    { key: "farmer_name", label: "Farmer" }, { key: "farmer_village", label: "Village" }, { key: "farmer_taluka", label: "Taluka" },
    { key: "status", label: "Status" }, { key: "amount_rs", label: "Amount (Rs)" }, { key: "updated_by_name", label: "Updated by" },
    { key: "remarks", label: "Remarks" },
  ],
};
const TITLES: Record<string, string> = {
  records: "Farmer service records",
  surveys: "Field surveys", forms: "1/14 forms (land records)", farmers: "Farmers", applications: "Subsidy applications",
};

const day = (ts: string) => String(ts).slice(0, 10);
const UNIT_LABELS: Record<string, string> = { acre: "Acres", sq_m: "Sq. metres" };
const GENDER_LABELS: Record<string, string> = { male: "Male", female: "Female", other: "Other" };
const sn = (r: Row) => (r.sub_division ? `${r.survey_number}/${r.sub_division}` : r.survey_number);

serve(["POST"], async (req) => {
  const { adminClient } = await requireUser(req, ["admin"]);
  const p = parse(schema, await readParams(req));

  // deno-lint-ignore no-explicit-any
  async function fetchAll(build: (from: number, to: number) => any): Promise<{ rows: Row[]; total: number }> {
    const rows: Row[] = [];
    let total = 0;
    for (let from = 0; from < MAX_ROWS; from += BATCH) {
      const { data, count, error } = await build(from, Math.min(from + BATCH, MAX_ROWS) - 1);
      if (error) throw dbError(error);
      total = count ?? total;
      rows.push(...(data ?? []));
      if (!data || data.length < BATCH) break;
    }
    return { rows, total };
  }

  let rows: Row[] = [];
  let total = 0;
  if (p.dataset === "records") {
    ({ rows, total } = await fetchAll((from, to) => {
      let q = adminClient
        .from("service_records")
        .select("*, creator:profiles!service_records_created_by_fkey(full_name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id");
      if (p.created_from) q = q.gte("created_at", p.created_from);
      if (p.created_to) q = q.lte("created_at", p.created_to);
      if (p.q) {
        const terms = [
          `farmer_name.ilike.${likePattern(p.q)}`, `record_no.ilike.${likePattern(p.q)}`,
          `survey_number_norm.ilike.${likePattern(normalizeCode(p.q))}`, `sub_division_norm.ilike.${likePattern(normalizeCode(p.q))}`,
        ];
        const sn = surveyNumberFilter(p.q);
        if (sn) terms.push(sn);
        q = q.or(terms.join(","));
      }
      return q.range(from, to);
    }));
    // created_at stays an ISO timestamp: the app formats it in the user's local timezone.
    rows = rows.map((r) => ({
      ...r, land_size: Number(r.land_size), land_unit: UNIT_LABELS[r.land_unit] ?? r.land_unit,
      gender: r.gender ? GENDER_LABELS[r.gender] ?? r.gender : null, created_by_name: r.creator?.full_name ?? null,
    }));
  } else if (p.dataset === "surveys") {
    ({ rows, total } = await fetchAll((from, to) => {
      let q = adminClient.from("survey_details").select("*", { count: "exact" }).order("visit_date", { ascending: false });
      if (p.date_from) q = q.gte("visit_date", p.date_from);
      if (p.date_to) q = q.lte("visit_date", p.date_to);
      if (p.taluka) q = q.eq("farmer_taluka", p.taluka);
      return q.range(from, to);
    }));
    rows = rows.map((r) => ({ ...r, survey_no: sn(r) }));
  } else if (p.dataset === "forms") {
    ({ rows, total } = await fetchAll((from, to) => {
      let q = adminClient.from("land_records").select("*", { count: "exact" }).order("created_at", { ascending: false });
      if (p.date_from) q = q.gte("created_at", p.date_from);
      if (p.date_to) q = q.lte("created_at", `${p.date_to}T23:59:59.999Z`);
      if (p.taluka) q = q.eq("taluka", p.taluka);
      return q.range(from, to);
    }));
    rows = (await decorateForms(adminClient, rows)).map((r) => ({ ...r, survey_no: sn(r), created: day(r.created_at) }));
  } else if (p.dataset === "farmers") {
    ({ rows, total } = await fetchAll((from, to) => {
      let q = adminClient.from("farmers").select("*", { count: "exact" }).order("name");
      if (p.date_from) q = q.gte("created_at", p.date_from);
      if (p.date_to) q = q.lte("created_at", `${p.date_to}T23:59:59.999Z`);
      if (p.taluka) q = q.eq("taluka", p.taluka);
      return q.range(from, to);
    }));
    const [{ data: lands }, { data: surveys }] = await Promise.all([
      adminClient.from("land_records").select("farmer_id, area_sq_m, status").limit(20000),
      adminClient.from("surveys").select("farmer_id").limit(20000),
    ]);
    const forms = new Map<string, number>(), land = new Map<string, number>(), sv = new Map<string, number>();
    for (const l of (lands ?? []) as Row[]) {
      forms.set(l.farmer_id, (forms.get(l.farmer_id) ?? 0) + 1);
      if (l.status !== "rejected") land.set(l.farmer_id, (land.get(l.farmer_id) ?? 0) + Number(l.area_sq_m));
    }
    for (const s of (surveys ?? []) as Row[]) sv.set(s.farmer_id, (sv.get(s.farmer_id) ?? 0) + 1);
    rows = rows.map((r) => ({
      ...r, form_count: forms.get(r.id) ?? 0, land_sq_m: Math.round(land.get(r.id) ?? 0), survey_count: sv.get(r.id) ?? 0, created: day(r.created_at),
    }));
  } else {
    rows = (await loadApplications(adminClient, {})).filter((a) =>
      (!p.date_from || a.applied_on >= p.date_from) && (!p.date_to || a.applied_on <= p.date_to) && (!p.taluka || a.farmer_taluka === p.taluka)
    );
    total = rows.length;
  }

  const columns = COLS[p.dataset];
  return json({
    title: TITLES[p.dataset],
    columns,
    rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? null]))),
    total,
    truncated: total > rows.length,
    generated_at: new Date().toISOString(),
    filters: {
      date_from: p.date_from ?? null, date_to: p.date_to ?? null, taluka: p.taluka ?? null,
      created_from: p.created_from ?? null, created_to: p.created_to ?? null, q: p.q ?? null,
    },
  });
});
