/**
 * Strava /streams API types.
 *
 * Each stream is a time-aligned array of values. Strava returns them as a
 * map keyed by stream name, plus per-stream metadata (resolution, series_type).
 *
 * Key insight: the `time` stream is what unlocks per-point timestamps for
 * timelapse playback — exactly the data Strava strips from `/export_gpx`.
 */

export const StreamType = {
  TIME: "time",
  DISTANCE: "distance",
  LATLNG: "latlng",
  ALTITUDE: "altitude",
  VELOCITY_SMOOTH: "velocity_smooth",
  HEARTRATE: "heartrate",
  CADENCE: "cadence",
  WATTS: "watts",
  TEMP: "temp",
  MOVING: "moving",
  GRADE_SMOOTH: "grade_smooth",
} as const;

export type StreamType = (typeof StreamType)[keyof typeof StreamType];

export type StreamResolution = "low" | "medium" | "high";
export type SeriesType = "distance" | "time";

type StreamBase = {
  original_size: number;
  resolution: StreamResolution;
  series_type: SeriesType;
};

/** A 1-D numeric stream (time, distance, altitude, …). */
export type ScalarStream = StreamBase & {
  type: Exclude<StreamType, typeof StreamType.LATLNG | typeof StreamType.MOVING>;
  data: number[];
};

/** The latlng stream is an array of `[lat, lng]` tuples. */
export type LatLngStream = StreamBase & {
  type: typeof StreamType.LATLNG;
  data: Array<[number, number]>;
};

/** The moving stream is a boolean array. */
export type MovingStream = StreamBase & {
  type: typeof StreamType.MOVING;
  data: boolean[];
};

export type Stream = ScalarStream | LatLngStream | MovingStream;

/**
 * Map keyed by stream type — exactly the shape the API returns when
 * `?keys_by_type=true` is appended to the request.
 */
export type StreamSet = Partial<{
  [StreamType.TIME]: ScalarStream;
  [StreamType.DISTANCE]: ScalarStream;
  [StreamType.LATLNG]: LatLngStream;
  [StreamType.ALTITUDE]: ScalarStream;
  [StreamType.VELOCITY_SMOOTH]: ScalarStream;
  [StreamType.HEARTRATE]: ScalarStream;
  [StreamType.CADENCE]: ScalarStream;
  [StreamType.WATTS]: ScalarStream;
  [StreamType.TEMP]: ScalarStream;
  [StreamType.MOVING]: MovingStream;
  [StreamType.GRADE_SMOOTH]: ScalarStream;
}>;
