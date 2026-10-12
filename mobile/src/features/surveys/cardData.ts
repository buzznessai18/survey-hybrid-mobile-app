import type { SurveyCardData } from "@/components/survey/SurveyCard";
import type { SurveyListItem } from "@/types/api";
import type { QueueItem } from "@/types/survey";
import { queueSummary } from "@/utils/serialization";
import { formatShortDate, formatTime, toIsoDate } from "@/utils/date";
import { formatArea, surveyNumberLabel } from "@/utils/format";
import { queueStatusView, serverStatusView } from "@/utils/status";

const when = (iso: string) => (toIsoDate(new Date(iso)) === toIsoDate() ? formatTime(iso) : formatShortDate(iso));

export function serverCard(s: SurveyListItem): SurveyCardData {
  return {
    key: s.id,
    title: surveyNumberLabel(s.survey_number, s.sub_division),
    farmer: s.farmer_name ?? "—",
    meta: [formatArea(s.area, s.area_unit), s.crop_name, s.collected_by_name ? `by ${s.collected_by_name}` : null]
      .filter(Boolean)
      .join(" • "),
    time: when(s.created_at),
    status: serverStatusView(s),
    photoUri: s.photo_url ?? null,
  };
}

export function queueCard(q: QueueItem): SurveyCardData {
  const d = q.details;
  const sum = queueSummary(q);
  return {
    key: `local-${q.id}`,
    title: surveyNumberLabel(sum.surveyNumber, sum.subDivision || null),
    farmer: sum.farmerName,
    meta: d ? [formatArea(d.area, d.areaUnit), q.cropName].filter(Boolean).join(" • ") : "1/14 form only (no field survey)",
    time: when(q.createdAt),
    status: queueStatusView(q.status),
    photoUri: q.photoLocalUri,
    hint: q.status === "sync_failed" ? "Tap to review and retry" : undefined,
  };
}
