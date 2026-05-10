/**
 * Format requested when downloading an activity file.
 *
 * - `original` — the file the user uploaded (FIT, TCX, or GPX depending on device).
 *   This is the only format that preserves per-point timestamps for FIT/TCX
 *   uploads. Mobile-app uploads return JSON when this format is requested;
 *   pass `jsonFallback` to coerce JSON to GPX/TCX automatically.
 * - `gpx` — Strava-converted GPX without per-point `<time>` elements.
 * - `tcx` — Strava-converted TCX with per-point timestamps.
 */
export const DataFormat = {
  ORIGINAL: "original",
  GPX: "gpx",
  TCX: "tcx",
} as const;

export type DataFormat = (typeof DataFormat)[keyof typeof DataFormat];

/**
 * Bike frame type (for `getBikeComponents`).
 * Mirrors stravaweblib's `FrameType` enum.
 */
export const FrameType = {
  MOUNTAIN_BIKE: 1,
  CROSS_BIKE: 2,
  ROAD_BIKE: 3,
  TIME_TRIAL_BIKE: 4,
  GRAVEL_BIKE: 5,
} as const;

export type FrameType = (typeof FrameType)[keyof typeof FrameType];

export function frameTypeLabel(t: FrameType): string {
  switch (t) {
    case FrameType.MOUNTAIN_BIKE:
      return "Mountain Bike";
    case FrameType.CROSS_BIKE:
      return "Cross Bike";
    case FrameType.ROAD_BIKE:
      return "Road Bike";
    case FrameType.TIME_TRIAL_BIKE:
      return "Time Trial Bike";
    case FrameType.GRAVEL_BIKE:
      return "Gravel Bike";
  }
}
