import { callFunction } from "@/services/api/functions";
import type { AdminAnalytics, ReportResponse } from "@/types/api";
import type { Period } from "@/utils/period";

export const ReportService = {
  /** get-reports (admins): all-time totals and work queues. */
  async getMyReport(): Promise<ReportResponse> {
    const { data } = await callFunction<ReportResponse>("get-reports", {});
    return data;
  },

  /** get-analytics (admins): totals, trend and breakdowns for a period. */
  async getAnalytics(p: Pick<Period, "from" | "to" | "prevFrom" | "prevTo">): Promise<AdminAnalytics> {
    const { data } = await callFunction<{ analytics: AdminAnalytics }>("get-analytics", {
      date_from: p.from,
      date_to: p.to,
      prev_from: p.prevFrom,
      prev_to: p.prevTo,
    });
    return data.analytics;
  },
};
