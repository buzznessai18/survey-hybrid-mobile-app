import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDateTime } from "@/lib/date";
import { formatLandSize, surveyNumberLabel } from "@/lib/labels";
import type { ServiceRecord } from "@/lib/types";

/** One saved farmer record in a list: a ledger line, linking to the record and its receipt. */
export function RecordRow({ record }: { record: ServiceRecord }) {
  const survey = surveyNumberLabel(record.survey_number, record.sub_division);
  return (
    <li>
      <Link to={`/app/records/${record.id}`} className="ledger-row">
        <span className="receipt-no">{record.record_no}</span>
        <span className="ledger-main">
          <strong>{record.farmer_name}</strong>
          <span className="ledger-meta">
            <span>Sy. No. {survey}</span>
            <span>{formatLandSize(record.land_size, record.land_unit)}</span>
          </span>
          {record.service_details ? <span className="ledger-detail">{record.service_details}</span> : null}
        </span>
        <span className="ledger-date">{formatDateTime(record.created_at)}</span>
        <ChevronRight aria-hidden className="ledger-chevron" />
      </Link>
    </li>
  );
}
