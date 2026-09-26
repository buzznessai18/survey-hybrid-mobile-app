import { callFunction } from "@/services/api/functions";
import type { ReportResponse } from "@/types/api";

export const ReportService = {
  /** get-reports — scoped by RLS to the surveyor's own surveys. */
  async getMyReport(): Promise<ReportResponse> {
    const { data } = await callFunction<ReportResponse>("get-reports", {});
    return data;
  },
};
