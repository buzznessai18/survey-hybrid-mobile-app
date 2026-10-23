import { History } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { formatDateTime } from "@/lib/date";
import { AUDIT_ACTION_LABELS } from "@/lib/labels";
import type { AuditEntry } from "@/lib/types";
import { useRemote } from "@/lib/useRemote";
import { AuditService } from "@/services/api";

const TYPES = [
  { value: "", label: "All" }, { value: "record", label: "Records" }, { value: "profile", label: "Users" },
  { value: "form", label: "1/14 forms" }, { value: "survey", label: "Surveys" }, { value: "duplicate_match", label: "Duplicates" },
  { value: "farmer", label: "Farmers" }, { value: "application", label: "Applications" }, { value: "scheme", label: "Schemes" },
];
const HIDDEN = new Set(["id", "created_at", "updated_at", "location", "farmer_id", "crop_id", "created_by", "updated_by"]);
const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? "…" : String(v).slice(0, 60));

function changes(e: AuditEntry): string[] {
  const ch = e.metadata?.changes;
  if (!ch) return [];
  return Object.entries(ch)
    .filter(([k]) => !HIDDEN.has(k))
    .slice(0, 4)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${fmt(v.from)} to ${fmt(v.to)}`);
}

/** Admin: audit history of important changes. */
export default function Audit() {
  const [type, setType] = useState("");
  const { data, loading, error, reload } = useRemote(() => AuditService.list({ entity_type: type || undefined, page_size: 60 }), type);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit history</h1>
          <p>Who saved, changed or deleted what, and when. The latest 60 entries.</p>
        </div>
      </div>
      <div className="chips" role="group" aria-label="Show changes to">
        {TYPES.map((t) => (
          <button key={t.value} type="button" className="chip" aria-pressed={type === t.value} onClick={() => setType(t.value)}>{t.label}</button>
        ))}
      </div>
      {loading && !data ? (
        <Skeleton count={4} height={64} />
      ) : error ? (
        <ErrorState offline={error.offline} message={error.message} onRetry={reload} />
      ) : !data?.data.length ? (
        <EmptyState icon={History} title="No history yet" message="Saved and deleted records and user changes appear here." />
      ) : (
        <ul className="ledger" style={loading ? { opacity: 0.6 } : undefined}>
          {data.data.map((e) => {
            const lines = changes(e);
            const openable = e.entity_type === "record" && e.entity_id && e.action !== "record_deleted";
            return (
              <li key={e.id} className="audit-row">
                <span className="audit-when">{formatDateTime(e.created_at)}</span>
                <div>
                  <strong>{AUDIT_ACTION_LABELS[e.action] ?? e.action}</strong>
                  {e.metadata?.ref ? (
                    <>
                      {" "}
                      {openable ? <Link to={`/app/records/${e.entity_id}`} className="receipt-no">{e.metadata.ref}</Link> : <span className="receipt-no">{e.metadata.ref}</span>}
                    </>
                  ) : null}
                  <div className="audit-who">by {e.user_name}</div>
                  {lines.length ? <div className="audit-changes">{lines.map((l) => <span key={l}>{l}</span>)}</div> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
