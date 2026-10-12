// POST /functions/v1/audit-logs   (admins) — history of important changes
//   { action?: "list", entity_type?, entity_id?, actions?, user_id?, date_from?, date_to?, page?, page_size? }
import { requireUser } from "../_shared/auth.ts";
import { dbError, json, readParams, serve } from "../_shared/http.ts";
import type { Row } from "../_shared/records.ts";
import { isoDate, pagination, paginationMeta, parse, rangeFor, uuid, z } from "../_shared/validation.ts";

const schema = z.object({
  action: z.literal("list").default("list"),
  entity_type: z.enum(["survey", "duplicate_match", "profile", "farmer", "form", "scheme", "application"]).optional(),
  entity_id: uuid.optional(),
  actions: z.array(z.string().max(40)).max(20).optional(),
  user_id: uuid.optional(),
  date_from: isoDate.optional(),
  date_to: isoDate.optional(),
  ...pagination,
});

serve(["POST"], async (req) => {
  const { userClient, adminClient } = await requireUser(req, ["admin"]);
  const p = parse(schema, await readParams(req));
  let q = userClient.from("audit_logs").select("id, user_id, action, entity_type, entity_id, metadata, created_at", { count: "exact" });
  if (p.entity_type) q = q.eq("entity_type", p.entity_type);
  if (p.entity_id) q = q.eq("entity_id", p.entity_id);
  if (p.actions?.length) q = q.in("action", p.actions);
  if (p.user_id) q = q.eq("user_id", p.user_id);
  if (p.date_from) q = q.gte("created_at", p.date_from);
  if (p.date_to) q = q.lte("created_at", `${p.date_to}T23:59:59.999Z`);
  const [from, to] = rangeFor(p.page, p.page_size);
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(from, to);
  if (error) throw dbError(error);
  const rows = (data ?? []) as Row[];
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const { data: users } = ids.length ? await adminClient.from("profiles").select("id, full_name, role").in("id", ids) : { data: [] };
  const byId = new Map((users ?? []).map((u: Row) => [u.id, u]));
  return json({
    data: rows.map((r) => ({ ...r, user_name: byId.get(r.user_id)?.full_name ?? (r.user_id ? "Unknown" : "System") })),
    pagination: paginationMeta(p.page, p.page_size, count),
  });
});
