import { Plus, ReceiptText, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { RecordRow } from "@/components/RecordRow";
import { Banner, Button, EmptyState, ErrorState, Skeleton, TextField } from "@/components/ui";
import { errorMessage, toApiError } from "@/lib/errors";
import type { ServiceRecord } from "@/lib/types";
import { ServiceRecordService } from "@/services/api";
import { useCanEditRecords } from "@/store/auth";

/** Records: search saved records by farmer name, survey number, sub-division or receipt no. (paged from the server). */
export default function Records() {
  const canCreate = useCanEditRecords();
  const deleted = (useLocation().state as { deleted?: string } | null)?.deleted;
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [items, setItems] = useState<ServiceRecord[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null);
  const reqId = useRef(0);

  const loadFirst = useCallback(async (term: string) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await ServiceRecordService.list({ q: term.trim() || undefined, page: 1 });
      if (id !== reqId.current) return;
      setItems(res.data);
      setTotal(res.pagination.total);
      setPages(res.pagination.total_pages);
      setPage(1);
      setError(null);
    } catch (e) {
      if (id === reqId.current) setError({ message: errorMessage(e), offline: toApiError(e).isConnectivity });
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // Debounced search as the user types; the term is kept in the URL so back/forward and reloads keep it.
  useEffect(() => {
    const t = setTimeout(() => {
      void loadFirst(q);
      setParams(q.trim() ? { q: q.trim() } : {}, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [q, loadFirst, setParams]);

  const loadMore = async () => {
    if (loading || loadingMore || page >= pages) return;
    const id = reqId.current;
    setLoadingMore(true);
    try {
      const res = await ServiceRecordService.list({ q: q.trim() || undefined, page: page + 1 });
      if (id !== reqId.current) return;
      setItems((prev) => [...prev, ...res.data.filter((d) => !prev.some((p) => p.id === d.id))]);
      setPage(page + 1);
    } catch (e) {
      setError({ message: errorMessage(e), offline: toApiError(e).isConnectivity });
    } finally {
      setLoadingMore(false);
    }
  };

  const term = q.trim();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Records</h1>
          <p>Every farmer equipment and service record, newest first.</p>
        </div>
        {canCreate ? <Link to="/app/records/new" className="btn btn-primary"><Plus aria-hidden />Add record</Link> : null}
      </div>

      {deleted ? <Banner tone="success">{deleted} was deleted.</Banner> : null}
      <div className="list-toolbar" role="search">
        <TextField
          label="Search records"
          icon={Search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Farmer name, survey no. 312, 312/4B or RC-000123"
          autoComplete="off"
          autoFocus={!!params.get("q") || undefined}
          action={q ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQ("")} aria-label="Clear search"><X aria-hidden /></button> : null}
        />
      </div>
      <p className="count-line" aria-live="polite">
        {total !== null && !error ? `${total} record${total === 1 ? "" : "s"}${term ? ` matching “${term}”` : ""}` : ""}
      </p>

      {error && items.length === 0 ? (
        <ErrorState offline={error.offline} message={error.offline ? "Records need an internet connection." : error.message} onRetry={() => void loadFirst(q)} />
      ) : loading && items.length === 0 ? (
        <Skeleton count={4} />
      ) : items.length === 0 ? (
        term ? (
          <EmptyState title="No matching records" message={`Nothing matches “${term}”. Check the spelling or try the survey number.`} />
        ) : (
          <EmptyState
            icon={ReceiptText}
            title="No records yet"
            message="Saved farmer records appear here."
            action={canCreate ? <Link to="/app/records/new" className="btn btn-primary btn-sm">Add a record</Link> : undefined}
          />
        )
      ) : (
        <>
          <ul className="ledger" style={loading ? { opacity: 0.6 } : undefined}>{items.map((r) => <RecordRow key={r.id} record={r} />)}</ul>
          {page < pages ? (
            <div className="load-more">
              <Button variant="secondary" loading={loadingMore} loadingText="Loading…" onClick={loadMore}>
                Show more ({items.length} of {total})
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
