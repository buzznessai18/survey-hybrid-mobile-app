import { router } from "expo-router";
import { useCallback } from "react";
import { Alert } from "react-native";
import { PhotoService } from "@/services/storage/PhotoService";
import { useDraftStore } from "@/store/draftStore";
import { useQueueStore } from "@/store/queueStore";
import type { FarmerDraft } from "@/types/survey";

/** Discard the current draft (deleting its photo unless a queued item uses it) and start a new 1/14 form. */
function startFresh(farmer?: FarmerDraft) {
  const { draft, startNew } = useDraftStore.getState();
  const photo = draft?.photo?.uri;
  if (photo && !Object.values(useQueueStore.getState().items).some((i) => i.photoLocalUri === photo)) {
    PhotoService.delete(photo);
  }
  startNew(farmer);
}

/** Start a new survey, offering to resume an unfinished draft. */
export { startFresh };

const FIRST_STEP = "/survey/new/farmer" as const;

/** Start a new 1/14 form, offering to resume an unfinished one. Optionally pre-select a farmer. */
export function useStartSurvey() {
  return useCallback((farmer?: FarmerDraft) => {
    const { draft } = useDraftStore.getState();
    const hasProgress = !!draft && (!!draft.farmer || !!draft.land || !!draft.details || !!draft.location || !!draft.photo);
    if (!hasProgress) {
      startFresh(farmer);
      router.push(FIRST_STEP);
      return;
    }
    Alert.alert("Unfinished form", "You have a 1/14 form in progress. Continue it or start a new one?", [
      { text: "Continue", onPress: () => router.push(FIRST_STEP) },
      {
        text: "Start new",
        style: "destructive",
        onPress: () => {
          startFresh(farmer);
          router.push(FIRST_STEP);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, []);
}
