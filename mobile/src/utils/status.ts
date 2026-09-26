import type { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import type { BadgeTone } from "@/components/ui/StatusBadge";
import type { DuplicateStatus, SubmissionStatus } from "@/types/api";
import type { SyncStatus } from "@/types/survey";

export interface StatusView {
  label: string;
  tone: BadgeTone;
  icon: ComponentProps<typeof Ionicons>["name"];
}

const DUPLICATE_VIEWS: Partial<Record<DuplicateStatus, StatusView>> = {
  duplicate: { label: "Duplicate", tone: "error", icon: "warning" },
  possible_duplicate: { label: "Possible duplicate", tone: "warning", icon: "warning" },
  needs_verification: { label: "Needs verification", tone: "warning", icon: "help-circle" },
  confirmed_duplicate: { label: "Confirmed duplicate", tone: "error", icon: "close-circle" },
};

/** Badge for a server survey. Duplicate flags take precedence over review state. */
export function serverStatusView(s: { duplicate_status: DuplicateStatus; submission_status: SubmissionStatus }): StatusView {
  const dup = DUPLICATE_VIEWS[s.duplicate_status];
  if (dup) return dup;
  if (s.submission_status === "approved") return { label: "Approved", tone: "success", icon: "checkmark-done-circle" };
  if (s.submission_status === "rejected") return { label: "Rejected", tone: "error", icon: "close-circle" };
  return { label: "Submitted", tone: "success", icon: "checkmark-circle" };
}

export function isFlagged(status: DuplicateStatus): boolean {
  return status in DUPLICATE_VIEWS;
}

/** Badge for a local (outbox) survey. */
export function queueStatusView(status: SyncStatus): StatusView {
  switch (status) {
    case "pending_sync":
      return { label: "Saved offline", tone: "neutral", icon: "cloud-upload-outline" };
    case "syncing":
      return { label: "Syncing", tone: "info", icon: "sync" };
    case "sync_failed":
      return { label: "Sync failed", tone: "error", icon: "alert-circle" };
    case "synced":
      return { label: "Synced", tone: "success", icon: "checkmark-circle" };
  }
}

export const MARKER_COLORS = {
  normal: "#168A4A",
  duplicate: "#D64545",
  possible: "#D98B18",
  pending: "#2F6FDE",
} as const;

export function markerColor(status: DuplicateStatus): string {
  if (status === "duplicate" || status === "confirmed_duplicate") return MARKER_COLORS.duplicate;
  if (status === "possible_duplicate" || status === "needs_verification") return MARKER_COLORS.possible;
  return MARKER_COLORS.normal;
}
