import { appConfig } from "@/config/env";
import { ApiError, toApiError } from "@/services/api/errors";
import { PhotoService } from "@/services/storage/PhotoService";
import { FormService } from "@/services/records/RecordServices";
import { SurveyService } from "@/services/surveys/SurveyService";
import { supabase } from "@/services/supabase/client";
import { useNetworkStore } from "@/store/networkStore";
import { selectUserItems, useQueueStore } from "@/store/queueStore";
import { useSyncStore } from "@/store/syncStore";
import type { CreateSurveyResponse } from "@/types/api";
import type { QueueItem, SurveyDraft, SyncError, SyncErrorKind } from "@/types/survey";
import { queueItemFromDraft, toCreatePayload, toFormSubmitPayload } from "@/utils/serialization";

/**
 * Offline-first submission pipeline.
 *
 *   draft ─submit─▶ pending_sync ─▶ syncing ─▶ synced
 *                        ▲             │
 *                        └── retry ────┴──▶ sync_failed
 *
 * Idempotency: the queue item id is the client-generated survey UUID and is
 * sent as create-survey `id`. If a request reaches the server but the reply is
 * lost, the retry returns the same survey (`idempotent_replay: true`) instead
 * of creating a second one. A survey is only marked `synced` after the server
 * confirms it.
 */

export type SyncOutcome =
  | { kind: "synced"; item: QueueItem; response: CreateSurveyResponse }
  | { kind: "queued"; item: QueueItem; reason: "offline" | "retry_scheduled" | "signed_out"; message: string }
  | { kind: "failed"; item: QueueItem; error: ApiError }
  | { kind: "skipped"; item: QueueItem | null };

const inFlight = new Map<string, Promise<SyncOutcome>>();
let queueRun: Promise<void> | null = null;

const store = () => useQueueStore.getState();
const getItem = (id: string) => store().items[id];

export function backoffDelay(retryCount: number): number {
  return Math.min(appConfig.syncBaseDelayMs * 2 ** Math.max(0, retryCount - 1), appConfig.syncMaxDelayMs);
}

function syncErrorKind(e: ApiError): SyncErrorKind {
  switch (e.kind) {
    case "network":
    case "timeout":
      return "network";
    case "server":
    case "rate_limited":
      return "server";
    case "validation":
      return "validation";
    case "conflict":
      return "conflict";
    case "unauthorized":
      return "auth";
    case "forbidden":
    case "account_inactive":
      return "forbidden";
    default:
      return "unknown";
  }
}

const toSyncError = (e: ApiError, message = e.message): SyncError => ({
  kind: syncErrorKind(e),
  message,
  fields: e.fields,
  at: new Date().toISOString(),
});

async function runSync(id: string): Promise<SyncOutcome> {
  const initial = getItem(id);
  if (!initial || initial.status === "synced") return { kind: "skipped", item: initial ?? null };

  store().update(id, { status: "syncing" });
  useSyncStore.getState().set({ currentId: id });

  try {
    // 1. Upload the photo once; later retries reuse the stored path.
    let photoPath = initial.photoPath;
    if (!photoPath && initial.photoLocalUri) {
      photoPath = await PhotoService.upload(initial.userId, initial.id, initial.photoLocalUri);
      store().update(id, { photoPath });
    }

    // 2. Submit (idempotent on the client ids). 1/14 form items create the
    //    form + its field survey (when not skipped) in one transaction; legacy items just the survey.
    const current = getItem(id) ?? initial;
    let response: CreateSurveyResponse;
    let formCode: string | undefined;
    let formDbId: string | undefined;
    if (current.formId) {
      const res = await FormService.submit(toFormSubmitPayload(current, photoPath));
      const s = res.surveys.find((x) => x.id === current.id) ?? res.surveys[0];
      formCode = res.form.form_id;
      formDbId = res.form.id;
      response = {
        created: res.created,
        idempotent_replay: res.idempotent_replay,
        survey: (s
          ? { ...s, duplicate_check: { duplicate_found: s.duplicate_status === "duplicate", possible_duplicate: false, nearest_distance_meters: null, matches: [] } }
          : undefined) as unknown as CreateSurveyResponse["survey"],
      };
    } else {
      response = await SurveyService.createSurvey(toCreatePayload(current, photoPath));
    }

    // 3. Only now is it safe to mark synced and free the local photo.
    const localPhoto = getItem(id)?.photoLocalUri;
    store().update(id, {
      status: "synced",
      lastError: null,
      nextAttemptAt: 0,
      photoLocalUri: null,
      result: {
        surveyCode: response.survey?.survey_id ?? "",
        duplicateStatus: response.survey?.duplicate_status ?? "unique",
        idempotentReplay: response.idempotent_replay,
        syncedAt: new Date().toISOString(),
        formCode,
        formDbId,
      },
    });
    PhotoService.delete(localPhoto);
    return { kind: "synced", item: getItem(id)!, response };
  } catch (raw) {
    const e = toApiError(raw);
    const current = getItem(id) ?? initial;

    if (e.isConnectivity) {
      // Waiting for connection is not a failure and does not consume retries.
      store().update(id, { status: "pending_sync", lastError: toSyncError(e, "Waiting for connection") });
      return {
        kind: "queued",
        item: getItem(id)!,
        reason: "offline",
        message: "No internet connection. Your survey has been saved and will sync automatically.",
      };
    }

    if (e.kind === "unauthorized") {
      store().update(id, { status: "pending_sync", lastError: toSyncError(e, "Sign in again to sync") });
      return { kind: "queued", item: getItem(id)!, reason: "signed_out", message: e.message };
    }

    if (e.retryable) {
      const retryCount = current.retryCount + 1;
      if (retryCount >= appConfig.syncMaxServerRetries) {
        store().update(id, { status: "sync_failed", retryCount, lastError: toSyncError(e) });
        return { kind: "failed", item: getItem(id)!, error: e };
      }
      store().update(id, {
        status: "pending_sync",
        retryCount,
        nextAttemptAt: Date.now() + backoffDelay(retryCount),
        lastError: toSyncError(e),
      });
      return {
        kind: "queued",
        item: getItem(id)!,
        reason: "retry_scheduled",
        message: "We couldn't submit the survey right now. Your survey has been saved locally and will be retried.",
      };
    }

    // Validation / conflict / permission problems need the surveyor's attention.
    store().update(id, { status: "sync_failed", lastError: toSyncError(e) });
    return { kind: "failed", item: getItem(id)!, error: e };
  } finally {
    useSyncStore.getState().set({ currentId: null });
  }
}

export const SyncService = {
  /** Sync one item. Concurrent calls for the same id share one request. */
  syncItem(id: string): Promise<SyncOutcome> {
    const existing = inFlight.get(id);
    if (existing) return existing;
    const promise = runSync(id).finally(() => inFlight.delete(id));
    inFlight.set(id, promise);
    return promise;
  },

  /**
   * Freeze the draft into the outbox and try to send it right away. Works the
   * same online and offline — offline it simply stays queued.
   */
  async submitDraft(draft: SurveyDraft, userId: string): Promise<SyncOutcome> {
    const existing = getItem(draft.id);
    if (existing?.status === "synced") return { kind: "skipped", item: existing };
    if (existing?.status === "syncing") return SyncService.syncItem(draft.id);

    const item = queueItemFromDraft(draft, userId);
    // Keep an already-uploaded photo path if the same photo is being resubmitted.
    if (existing?.photoPath && existing.photoLocalUri === item.photoLocalUri) item.photoPath = existing.photoPath;
    store().upsert(item);

    if (!useNetworkStore.getState().isOnline) {
      return {
        kind: "queued",
        item,
        reason: "offline",
        message: "No internet connection. Your survey has been saved and will sync automatically.",
      };
    }
    return SyncService.syncItem(item.id);
  },

  /** Manual retry of a failed item. */
  retry(id: string): Promise<SyncOutcome> {
    store().update(id, { status: "pending_sync", retryCount: 0, nextAttemptAt: 0 });
    return SyncService.syncItem(id);
  },

  /**
   * Process the signed-in user's outbox sequentially. `force` ignores back-off
   * and also retries items that failed for transient reasons.
   */
  processQueue(options: { force?: boolean } = {}): Promise<void> {
    if (queueRun) return queueRun;
    queueRun = (async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId || !useNetworkStore.getState().isOnline) return;

      useSyncStore.getState().set({ isSyncing: true });
      try {
        const now = Date.now();
        const transient: SyncErrorKind[] = ["server", "network", "auth", "unknown"];
        const candidates = selectUserItems(store().items, userId)
          .filter(
            (i) =>
              (i.status === "pending_sync" && (options.force || i.nextAttemptAt <= now)) ||
              (options.force && i.status === "sync_failed" && transient.includes(i.lastError?.kind ?? "unknown")),
          )
          .reverse(); // oldest first

        for (const item of candidates) {
          if (item.status === "sync_failed") store().update(item.id, { status: "pending_sync", retryCount: 0 });
          const outcome = await SyncService.syncItem(item.id);
          // Lost connectivity or session: stop instead of hammering.
          if (outcome.kind === "queued" && outcome.reason !== "retry_scheduled") break;
        }
        store().pruneSynced();
        useSyncStore.getState().set({ lastSyncAt: new Date().toISOString() });
      } finally {
        useSyncStore.getState().set({ isSyncing: false });
      }
    })().finally(() => {
      queueRun = null;
    });
    return queueRun;
  },

  /** True if any item is due for an automatic attempt. */
  hasDueItems(userId: string | undefined): boolean {
    const now = Date.now();
    return selectUserItems(store().items, userId).some((i) => i.status === "pending_sync" && i.nextAttemptAt <= now);
  },
};
