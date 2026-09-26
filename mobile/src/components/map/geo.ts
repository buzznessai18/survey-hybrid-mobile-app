/** Small geometry helpers for MapLibre (GeoJSON uses [lng, lat]). */

const EARTH_RADIUS = 6_371_008.8;

/** Polygon approximating a circle of `radius` metres around a point. */
export function circlePolygon(latitude: number, longitude: number, radius: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const lat = (latitude * Math.PI) / 180;
  const lng = (longitude * Math.PI) / 180;
  const d = radius / EARTH_RADIUS;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const brg = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(brg));
    const lng2 = lng + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(lat2));
    ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export function pointFeature(latitude: number, longitude: number, properties: Record<string, unknown> = {}): GeoJSON.Feature<GeoJSON.Point> {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates: [longitude, latitude] } };
}

/** Zoom level that frames a GPS accuracy radius comfortably. */
export function zoomForAccuracy(accuracy: number | null | undefined): number {
  const r = Math.max(accuracy ?? 20, 5);
  return Math.min(18, Math.max(13, 18.5 - Math.log2(r / 5)));
}
