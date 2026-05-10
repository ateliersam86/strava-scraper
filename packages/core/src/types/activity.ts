/**
 * Strongly-typed Strava activity model.
 *
 * Shape mirrors what the activity HTML page exposes via its embedded
 * `__APP_CONTEXT__` / `data-react-class` JSON islands, and is a superset of
 * what `stravaweblib` extracts (which only goes after the bike components
 * table). All fields are optional except `id` because Strava's HTML schema
 * varies by activity type (Run vs Ride vs Hike vs ...) and we never want a
 * missing field to throw — we just leave it `undefined`.
 */

export type StravaActivityType =
  | "Ride"
  | "VirtualRide"
  | "EBikeRide"
  | "MountainBikeRide"
  | "GravelRide"
  | "Run"
  | "VirtualRun"
  | "TrailRun"
  | "Hike"
  | "Walk"
  | "Swim"
  | "AlpineSki"
  | "BackcountrySki"
  | "NordicSki"
  | "Snowboard"
  | "Workout"
  | (string & { _strava?: never }); // permit unknown future types without breaking strict typing

export type LatLng = readonly [latitude: number, longitude: number];

export type ActivityStats = {
  distanceMeters?: number;
  movingTimeSeconds?: number;
  elapsedTimeSeconds?: number;
  totalElevationGainMeters?: number;
  averageSpeedMetersPerSecond?: number;
  maxSpeedMetersPerSecond?: number;
  averageHeartrateBpm?: number;
  maxHeartrateBpm?: number;
  averageWatts?: number;
  /** Max instantaneous power, watts. */
  maxWatts?: number;
  weightedAverageWatts?: number;
  kilojoules?: number;
  averageCadence?: number;
  /** Maximum cadence (RPM for cycling, SPM for running). */
  maxCadence?: number;
  averageTemperatureCelsius?: number;
  caloriesKcal?: number;
};

export type ActivityPhoto = {
  /** Strava photo ID. */
  id: number | string;
  /** UUID often present in URL paths. */
  uniqueId?: string;
  caption?: string;
  /** Capture timestamp in ISO 8601. */
  capturedAt?: string;
  /** Upload timestamp in ISO 8601 (when the photo was attached to Strava). */
  uploadedAt?: string;
  /** Lat/Lng if EXIF data was preserved. */
  location?: LatLng;
  /** URL of the highest-resolution variant we found. */
  hdUrl: string;
  /** Sized URL map (e.g., 256, 768, 1080, 2048). Keys are pixel widths. */
  urls?: Record<string, string>;
  /**
   * Where the photo originated. Strava's API exposes `source: 1` (Strava
   * native upload) or `source: 2` (Instagram embed). We surface both as a
   * lowercased label.
   */
  source?: "strava" | "instagram";
};

export type ActivitySplit = {
  /** Split index (1-based). */
  number: number;
  distanceMeters: number;
  elapsedTimeSeconds: number;
  movingTimeSeconds: number;
  averageSpeedMetersPerSecond: number;
  elevationDifferenceMeters?: number;
  averageHeartrateBpm?: number;
  averageGradeAdjustedSpeedMetersPerSecond?: number;
  paceZone?: number;
};

/**
 * A segment effort within an activity.
 */
export type ActivitySegmentEffort = {
  id: number | string;
  segmentId: number | string;
  name: string;
  elapsedTimeSeconds: number;
  movingTimeSeconds: number;
  distanceMeters: number;
  averageWatts?: number;
  averageHeartrateBpm?: number;
  maxHeartrateBpm?: number;
  startIndex?: number;
  endIndex?: number;
  prRank?: number | null;
  komRank?: number | null;
  achievementCount?: number;
};

export type ActivityGearRef = {
  /** Strava gear id (bike id starts with "b", shoe id with "g"). */
  id: string;
  name: string;
  /** Distance accumulated on this gear in meters. */
  distanceMeters?: number;
  primary?: boolean;
};

/**
 * One row of the bike components table on `/bikes/{id}`. Mirrors
 * `stravaweblib._get_all_bike_components` output exactly, in metric units.
 */
export type BikeComponent = {
  /** Component id (delete-link path tail). */
  id: string;
  /** "Chain", "Tires", "Cassette", etc. */
  type: string;
  brand: string;
  model: string;
  /** Date the component was added (or `undefined` if unknown). */
  added?: string; // ISO date (YYYY-MM-DD)
  /** Date the component was removed (or `undefined` if still in use). */
  removed?: string;
  /** Distance accumulated on the component in meters. */
  distanceMeters: number;
};

export type ActivityWeather = {
  temperatureCelsius?: number;
  /** "Feels like" / apparent temperature, °C. */
  feelsLikeCelsius?: number;
  humidityPercent?: number;
  windSpeedMetersPerSecond?: number;
  windBearingDegrees?: number;
  /** Cardinal-direction string from Strava (e.g. "WNW", "S", "NE"). */
  windDirectionText?: string;
  description?: string;
};

export type ActivityPrivacyZone = {
  /** Hidden start/end region for privacy zones. */
  type: "start" | "end";
  // Strava obscures the exact polyline boundaries — we only know the segment was hidden.
};

export type Activity = {
  id: number | string;
  /** ISO 8601, in athlete's local timezone if available. */
  startDateLocal?: string;
  /** ISO 8601 UTC. */
  startDateUtc?: string;
  /** Owning athlete id. */
  athleteId?: number | string;
  name?: string;
  description?: string;
  type?: StravaActivityType;
  /** "ride", "run", "hike" etc. — mirrors Strava's lowercase short type. */
  sportType?: string;
  /** Was this a commute / trainer / virtual ride? */
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
  private?: boolean;
  visibility?: "everyone" | "followers_only" | "only_me";
  /** Encoded Google polyline of the GPS trace (low-res summary). */
  summaryPolyline?: string;
  /** Encoded Google polyline of the full-resolution trace, if available. */
  detailPolyline?: string;
  /** Bounding box of the trace [SW, NE]. */
  bounds?: { southwest: LatLng; northeast: LatLng };

  stats?: ActivityStats;
  /**
   * Recording device name (e.g. "Garmin Edge 1030 Plus", "Wahoo Element ROAM",
   * "Strava iPhone App"). Scraped from the activity HTML page when present.
   */
  deviceName?: string;
  photos?: ActivityPhoto[];
  splits?: ActivitySplit[];
  /** Segment efforts, sorted by `startIndex`. */
  segmentEfforts?: ActivitySegmentEffort[];
  gear?: ActivityGearRef;
  weather?: ActivityWeather;
  privacyZones?: ActivityPrivacyZone[];

  /** Counters surfaced on the activity HTML page. */
  kudosCount?: number;
  commentsCount?: number;
  achievementsCount?: number;
  prCount?: number;
};
