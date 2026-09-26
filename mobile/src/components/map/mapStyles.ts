/**
 * Free, key-less OpenStreetMap vector styles from OpenFreeMap
 * (https://openfreemap.org). Attribution is rendered by MapLibre.
 */
export const MAP_STYLES = {
  liberty: { label: "Detailed", url: "https://tiles.openfreemap.org/styles/liberty" },
  bright: { label: "Bright", url: "https://tiles.openfreemap.org/styles/bright" },
  positron: { label: "Light", url: "https://tiles.openfreemap.org/styles/positron" },
} as const;

export type MapStyleId = keyof typeof MAP_STYLES;

export function mapStyleUrl(id: string | undefined): string {
  return (MAP_STYLES as Record<string, { url: string }>)[id ?? ""]?.url ?? MAP_STYLES.liberty.url;
}
