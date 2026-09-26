import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { appConfig } from "@/config/env";
import { ApiError, FRIENDLY_MESSAGES, toApiError } from "@/services/api/errors";
import { supabase } from "@/services/supabase/client";
import type { CapturedPhoto } from "@/types/survey";
import { photoStoragePath } from "@/utils/serialization";

const photosDir = () => new Directory(Paths.document, "survey-photos");

export const PhotoService = {
  /**
   * Resize + JPEG-compress a camera/gallery image and persist it in the app's
   * document directory (the cache can be purged by the OS before sync).
   */
  async processAndStore(
    source: { uri: string; width: number; height: number },
    surveyId: string,
  ): Promise<CapturedPhoto> {
    const max = appConfig.photoMaxDimension;
    const context = ImageManipulator.manipulate(source.uri);
    if (Math.max(source.width, source.height) > max) {
      context.resize(source.width >= source.height ? { width: max } : { height: max });
    }
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ compress: appConfig.photoJpegQuality, format: SaveFormat.JPEG });

    const dir = photosDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    // Unique name per capture so image caches never show a previous retake.
    const target = new File(dir, `${surveyId}-${Date.now()}.jpg`);
    await new File(result.uri).move(target);
    return { uri: target.uri, width: result.width, height: result.height };
  },

  exists(uri: string | null | undefined): boolean {
    if (!uri) return false;
    try {
      return new File(uri).exists;
    } catch {
      return false;
    }
  },

  delete(uri: string | null | undefined) {
    if (!uri) return;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      /* already gone */
    }
  },

  /**
   * Upload to field-photos/{user_id}/{survey_id}/field-photo.jpg (the only
   * layout the storage policies allow). Upsert makes retries safe.
   */
  async upload(userId: string, surveyId: string, localUri: string): Promise<string> {
    const file = new File(localUri);
    if (!file.exists) throw new ApiError("validation", "The field photo is missing from this device. Please retake it.");
    const path = photoStoragePath(userId, surveyId, appConfig.photoFileName);
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      throw new ApiError("validation", "The field photo could not be read. Please retake it.");
    }
    const { error } = await supabase.storage
      .from(appConfig.photoBucket)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) {
      const status = Number((error as { statusCode?: string | number }).statusCode ?? (error as { status?: number }).status ?? 0);
      if (status === 401) throw new ApiError("unauthorized", FRIENDLY_MESSAGES.unauthorized, 401);
      if (status === 403) throw new ApiError("forbidden", "You are not allowed to upload this photo.", 403);
      if (status === 413) throw new ApiError("validation", "The photo is too large.", 413);
      if (status >= 500) throw new ApiError("server", FRIENDLY_MESSAGES.server, status);
      if (status >= 400) throw new ApiError("validation", error.message || "The photo could not be uploaded.", status);
      throw toApiError(error);
    }
    return path;
  },
};
