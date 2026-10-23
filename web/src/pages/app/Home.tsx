import { ArrowRight, History, ReceiptText, Search, Sheet, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RecordRow } from "@/components/RecordRow";
import { Button, EmptyState, ErrorState, Skeleton, TextField } from "@/components/ui";
import { formatLongDate, greeting } from "@/lib/date";
import { firstName } from "@/lib/labels";
import { useRemote } from "@/lib/useRemote";
import { ServiceRecordService } from "@/services/api";
import { useAuth, useCanEditRecords, useIsAdmin } from "@/store/auth";

/** Home: add a record, search records, the latest records, and (admins) reports & users. */
export default function Home() {
  const { profile } = useAuth();
  const isAdmin = useIsAdmin();
  const canEdit = useCanEditRecords();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const recent = useRemote(() => ServiceRecordService.list({ page_size: 6 }), "recent");

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/app/records?q=${encodeURIComponent(q.trim())}` : "/app/records");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p style={{ marginTop: 0 }}>{greeting()}, {formatLongDate()}</p>
          <h1>{firstName(profile?.full_name)}</h1>
        </div>
      </div>

      <div className="home-grid">
        {canEdit ? (
          <Link to="/app/records/new" className="add-card">
            <div>
              <h2>Add record</h2>
              <p>Farmer, land and equipment or service details. Print the receipt straight after saving.</p>
            </div>
            <span className="go">Start a new record <ArrowRight aria-hidden /></span>
          </Link>
        ) : null}
        <form className="panel search-card" onSubmit={search} role="search" style={canEdit ? undefined : { gridColumn: "1 / -1" }}>
          <h2>Search records</h2>
          <div className="search-form">
            <TextField
              label="Search"
              icon={Search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, 312, 312/4B or RC-000123"
              autoComplete="off"
              hint="Farmer name, survey no. (with sub-division) or receipt no."
            />
          </div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </div>

      {isAdmin ? (
        <div className="admin-tools">
          <Link to="/app/reports" className="tool"><Sheet aria-hidden /><div>Reports<span>Excel and PDF</span></div></Link>
          <Link to="/app/users" className="tool"><Users aria-hidden /><div>Users<span>Add and manage accounts</span></div></Link>
          <Link to="/app/audit" className="tool"><History aria-hidden /><div>Audit history<span>Every saved and deleted record</span></div></Link>
        </div>
      ) : null}

      <h2 className="section-title">
        Recent records
        {recent.data && recent.data.pagination.total > 0 ? <Link to="/app/records">View all {recent.data.pagination.total}</Link> : null}
      </h2>
      {recent.loading && !recent.data ? (
        <Skeleton count={3} />
      ) : recent.error && !recent.data ? (
        <ErrorState offline={recent.error.offline} message={recent.error.offline ? "Connect to the internet to see records." : recent.error.message} onRetry={recent.reload} />
      ) : recent.data?.data.length ? (
        <ul className="ledger">{recent.data.data.map((r) => <RecordRow key={r.id} record={r} />)}</ul>
      ) : (
        <EmptyState
          icon={ReceiptText}
          title="No records yet"
          message="Records you save appear here, ready to print receipts."
          action={canEdit ? <Link to="/app/records/new" className="btn btn-primary btn-sm">Add a record</Link> : undefined}
        />
      )}
    </>
  );
}
