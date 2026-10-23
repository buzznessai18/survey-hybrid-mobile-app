import { ChevronLeft, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Banner, Button, ErrorState, Skeleton, useConfirm, useToast } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { formatLandSize, GENDER_LABELS } from "@/lib/labels";
import { formatReceiptDateTime } from "@/lib/receipt";
import { useRemote } from "@/lib/useRemote";
import { ServiceRecordService } from "@/services/api";
import { ReceiptService } from "@/services/print";
import { useIsAdmin } from "@/store/auth";
import { recordCache } from "./recordCache";

/**
 * A saved record: full details, a live receipt preview, Print receipt (anyone who
 * can see it, any number of times) and Delete (admins only).
 */
export default function RecordDetail() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const saved = params.get("saved") as "new" | "replay" | null;
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const remote = useRemote(() => ServiceRecordService.get(id), id);
  const record = remote.data ?? recordCache.get(id);
  const [busy, setBusy] = useState<"print" | "delete" | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();
  const { show, toast } = useToast();

  const back = <Link to="/app/records" className="back-link"><ChevronLeft aria-hidden />Records</Link>;

  if (!record) {
    return (
      <>
        {back}
        {remote.loading ? (
          <Skeleton height={320} />
        ) : (
          <ErrorState
            title={remote.error?.notFound ? "Record not found" : "Couldn't load record"}
            message={remote.error?.notFound ? "It may have been deleted." : remote.error?.message}
            offline={remote.error?.offline}
            onRetry={remote.error?.notFound ? undefined : remote.reload}
          />
        )}
      </>
    );
  }

  const print = async () => {
    setBusy("print");
    setPrintError(null);
    try {
      await ReceiptService.print(record);
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : "The receipt could not be printed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await ask({
      title: "Delete this record?",
      message: `${record.record_no} for ${record.farmer_name} will be permanently deleted. Printed receipts will no longer match a saved record. This can't be undone.`,
      confirm: "Delete record",
      danger: true,
    });
    if (!ok) return;
    setBusy("delete");
    try {
      await ServiceRecordService.remove(record.id);
      recordCache.remove(record.id);
      navigate("/app/records", { replace: true, state: { deleted: record.record_no } });
    } catch (e) {
      show(`Couldn't delete: ${errorMessage(e)}`);
      setBusy(null);
    }
  };

  return (
    <>
      {back}
      <div className="page-head">
        <div>
          <p className="receipt-no" style={{ fontSize: 18, marginTop: 0 }}>{record.record_no}</p>
          <h1>{record.farmer_name}</h1>
        </div>
      </div>

      {saved ? (
        <Banner tone="success" title={saved === "replay" ? "Record already saved" : "Record saved"}>
          {saved === "replay"
            ? "The connection dropped while saving, but the server had already saved this record. Check the details before printing."
            : `Receipt no. ${record.record_no}. You can print the receipt now.`}
        </Banner>
      ) : null}
      {printError ? <Banner tone="error">{printError}</Banner> : null}

      <div className="detail">
        <div>
          <section className="panel" aria-labelledby="h-farmer">
            <h2 id="h-farmer">Farmer</h2>
            <dl className="kv">
              <dt>Name</dt><dd>{record.farmer_name}</dd>
              <dt>Gender</dt><dd>{record.gender ? GENDER_LABELS[record.gender] : "—"}</dd>
              <dt>Address</dt><dd>{record.address || "—"}</dd>
            </dl>
          </section>
          <section className="panel" aria-labelledby="h-land">
            <h2 id="h-land">Land</h2>
            <dl className="kv">
              <dt>Survey no.</dt><dd>{record.survey_number}</dd>
              <dt>Sub-division</dt><dd>{record.sub_division || "—"}</dd>
              <dt>Land size</dt><dd>{formatLandSize(record.land_size, record.land_unit)}</dd>
            </dl>
          </section>
          <section className="panel" aria-labelledby="h-service">
            <h2 id="h-service">Equipment / service</h2>
            <p className="service-text">{record.service_details || "—"}</p>
          </section>
          <section className="panel" aria-labelledby="h-receipt">
            <h2 id="h-receipt">Receipt</h2>
            <dl className="kv">
              <dt>Receipt no.</dt><dd className="receipt-no">{record.record_no}</dd>
              <dt>Date &amp; time</dt><dd>{formatReceiptDateTime(record.created_at)}</dd>
              <dt>Recorded by</dt><dd>{record.created_by_name ?? "—"}</dd>
            </dl>
          </section>
        </div>

        <aside className="detail-actions" aria-label="Receipt">
          <div className="receipt-preview">
            <iframe title={`Receipt ${record.record_no} preview`} srcDoc={ReceiptService.html(record)} sandbox="" />
          </div>
          <Button icon={Printer} block loading={busy === "print"} loadingText="Opening printer…" disabled={!!busy} onClick={print}>
            Print receipt
          </Button>
          <p className="hint">Choose any connected printer, or "Save as PDF" to keep a copy. Reprint as often as needed.</p>
          {isAdmin ? (
            <Button variant="danger" icon={Trash2} block loading={busy === "delete"} loadingText="Deleting…" disabled={!!busy} onClick={remove}>
              Delete record
            </Button>
          ) : null}
        </aside>
      </div>
      {dialog}
      {toast}
    </>
  );
}
