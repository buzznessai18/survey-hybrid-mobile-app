import { router } from "expo-router";
import { useCallback } from "react";
import { Alert } from "react-native";
import { PhotoService } from "@/services/storage/PhotoService";
import { useDraftStore } from "@/store/draftStore";
import { useQueueStore } from "@/store/queueStore";

/** Discard the current draft, deleting its photo unless a queued survey uses it. */
function startFresh() {
  const { draft, startNew } = useDraftStore.getState();
  const photo = draft?.photo?.uri;
  if (photo && !Object.values(useQueueStore.getState().items).some((i) => i.photoLocalUri === photo)) {
    PhotoService.delete(photo);
  }
  startNew();
}

/** Start a new survey, offering to resume an unfinished draft. */
export { startFresh };

export function useStartSurvey() {
  return useCallback(() => {
    const { draft } = useDraftStore.getState();
    const hasProgress = !!draft && (!!draft.details || !!draft.location || !!draft.photo);
    if (!hasProgress) {
      startFresh();
      router.push("/survey/new/details");
      return;
    }
    Alert.alert("Unfinished survey", "You have a survey in progress. Continue it or start a new one?", [
      { text: "Continue", onPress: () => router.push("/survey/new/details") },
      {
        text: "Start new",
        style: "destructive",
        onPress: () => {
          startFresh();
          router.push("/survey/new/details");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, []);
}
