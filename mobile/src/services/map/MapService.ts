import { appConfig } from "@/config/env";
import { callFunction } from "@/services/api/functions";
import type { MapDataRequest, MapDataResponse } from "@/types/api";

/** [west, south, east, north] as reported by the map. */
export type Bounds = [number, number, number, number];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Visible bounds -> bounding box accepted by get-survey-map-data (slightly
 * padded). The backend rejects boxes crossing the antimeridian, so values are
 * clamped to valid ranges.
 */
export function boundsToRequest([west, south, east, north]: Bounds, paddingRatio = 0.1) {
  const padLat = (north - south) * paddingRatio;
  const padLng = (east - west) * paddingRatio;
  const box = {
    min_lat: clamp(south - padLat, -90, 90),
    max_lat: clamp(north + padLat, -90, 90),
    min_lng: clamp(west - padLng, -180, 180),
    max_lng: clamp(east + padLng, -180, 180),
  };
  if (box.max_lat - box.min_lat < 1e-6) box.max_lat = Math.min(90, box.min_lat + 1e-4);
  if (box.max_lng - box.min_lng < 1e-6) box.max_lng = Math.min(180, box.min_lng + 1e-4);
  return box;
}

export const MapService = {
  /** Lightweight points only — never full survey records. */
  async getSurveyMapData(
    bounds: Pick<MapDataRequest, "min_lat" | "min_lng" | "max_lat" | "max_lng">,
    filters: Omit<MapDataRequest, "min_lat" | "min_lng" | "max_lat" | "max_lng"> = {},
  ): Promise<MapDataResponse> {
    const { data } = await callFunction<MapDataResponse>("get-survey-map-data", {
      ...bounds,
      limit: appConfig.mapPointLimit,
      ...filters,
    });
    return data;
  },
};
