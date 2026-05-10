/**
 * Activity HTML page parser.
 *
 * Strava's /activities/{id} page embeds a large JSON blob inside a
 * `<script>window.__INITIAL_STATE__ = …</script>` (the exact name has
 * shifted between `__APP_CONTEXT__`, `__INITIAL_STATE__`, and `pageView` over
 * the years). We try each known shape in order and return the first match.
 *
 * The extracted blob contains everything we care about: stats, photos,
 * splits, segment efforts, gear ref, weather, kudos count, etc. We then
 * normalize the messy upstream shape into our strict {@link Activity} type.
 *
 * The parser is intentionally **lenient**: missing fields stay `undefined`
 * instead of throwing. Strava's HTML is high-churn and we'd rather degrade
 * gracefully than break consumers when one field renames.
 */

import * as cheerio from "cheerio";
import type {
  Activity,
  ActivityPhoto,
  ActivitySegmentEffort,
  ActivitySplit,
  ActivityStats,
  ActivityWeather,
  LatLng,
  StravaActivityType,
} from "../types/activity.ts";
import { parseActivityPageReact } from "./activity-react.ts";

export class ActivityPageParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityPageParseError";
  }
}

/** Names of the known global variables Strava has used over the years. */
const KNOWN_STATE_VARS = ["__INITIAL_STATE__", "__APP_CONTEXT__", "pageView", "stravaInitialState"];

/**
 * Extract the embedded JSON state from an activity HTML page.
 * Public so consumers can grab raw fields we may not yet normalize.
 */
export function extractEmbeddedState(html: string): Record<string, unknown> {
  const $ = cheerio.load(html);
  for (const script of $("script").toArray()) {
    const code = $(script).html() ?? "";
    for (const name of KNOWN_STATE_VARS) {
      const match = matchAssignment(code, name);
      if (match) {
        try {
          return JSON.parse(match);
        } catch {
          // ignore — try the next pattern
        }
      }
    }
  }
  // Fallback: many recent Strava builds attach activity JSON to a div via
  // `data-react-class="ActivityPage"` and `data-react-props="...escaped JSON..."`.
  const reactProps = $('[data-react-class*="Activity"]').attr("data-react-props");
  if (reactProps) {
    try {
      return JSON.parse(reactProps);
    } catch {
      // ignore
    }
  }
  throw new ActivityPageParseError(
    "Could not locate embedded activity JSON. Strava HTML schema may have changed.",
  );
}

function matchAssignment(code: string, name: string): string | null {
  // Match: `window.NAME = { … };` or `var NAME = { … };` etc.
  // We greedy-match braces because the embedded JSON is balanced.
  const pattern = new RegExp(
    String.raw`(?:window\.|var\s+|let\s+|const\s+)?${name}\s*=\s*(\{[\s\S]*?\});\s*\n`,
  );
  const match = code.match(pattern);
  return match?.[1] ?? null;
}

/**
 * Normalize the embedded state blob into our {@link Activity} type.
 *
 * Strava's blob has many shapes; we try a few well-known shapes and skip
 * anything we don't recognize.
 *
 * Strategy:
 * 1. Try the modern React-component extractor (Strava 2025+).
 *    Validated against the reference account's real activity HTML on 2026-05-10:
 *    `ADPKudosAndComments` + `MediaThumbnailList` + JS-builder regex for bounds.
 * 2. Fall back to legacy `__INITIAL_STATE__` / `pageView` / `data-react-props`
 *    blob (older Strava builds, kept for compatibility).
 *
 * Stats (distance, time, elevation gain) are NOT in HTML — fetch via API.
 * Use {@link enrichTripSegmentFromScraper} to merge HTML + API data.
 */
export function parseActivityPage(html: string, activityId: number | string): Activity {
  // 1. Modern React-component path
  try {
    const reactResult = parseActivityPageReact(html, activityId);
    // Successful if we got at least one meaningful field beyond the id
    const hasUseful =
      reactResult.name !== undefined ||
      reactResult.athleteId !== undefined ||
      (reactResult.photos?.length ?? 0) > 0 ||
      reactResult.kudosCount !== undefined;
    if (hasUseful) return reactResult;
  } catch {
    // try legacy below
  }

  // 2. Legacy embedded JSON path (pre-2025 Strava builds)
  const state = extractEmbeddedState(html);
  return normalizeActivity(state, activityId);
}

function normalizeActivity(state: Record<string, unknown>, fallbackId: number | string): Activity {
  // Find the activity record. Common shapes:
  //   state.activity = { … }
  //   state.pageContext.activity = { … }
  //   state.activities[<id>] = { … }
  const candidate =
    pick(state, ["activity"]) ??
    pick(state, ["pageContext", "activity"]) ??
    pick(state, ["preloadedState", "activity"]) ??
    findFirstActivityShape(state);

  const activity: Record<string, unknown> = isObject(candidate) ? candidate : state;

  return {
    id: numOrStr(activity["id"]) ?? fallbackId,
    athleteId: numOrStr(activity["athlete_id"] ?? pick(activity, ["athlete", "id"])),
    startDateUtc: str(activity["start_date"] ?? activity["startDate"]),
    startDateLocal: str(activity["start_date_local"] ?? activity["startDateLocal"]),
    name: str(activity["name"]),
    description: str(activity["description"]),
    type: str(activity["type"] ?? activity["activity_type"]) as StravaActivityType | undefined,
    sportType: str(activity["sport_type"] ?? activity["sportType"]),
    trainer: bool(activity["trainer"]),
    commute: bool(activity["commute"]),
    manual: bool(activity["manual"]),
    private: bool(activity["private"]),
    visibility: str(activity["visibility"]) as Activity["visibility"],
    summaryPolyline: str(
      pick(activity, ["map", "summary_polyline"]) ?? pick(activity, ["map", "summaryPolyline"]),
    ),
    detailPolyline: str(pick(activity, ["map", "polyline"]) ?? activity["polyline"]),
    bounds: parseBounds(activity),
    stats: parseStats(activity),
    photos: parsePhotos(activity),
    splits: parseSplits(activity),
    segmentEfforts: parseSegmentEfforts(activity),
    weather: parseWeather(activity),
    kudosCount: num(activity["kudos_count"] ?? activity["kudosCount"]),
    commentsCount: num(activity["comment_count"] ?? activity["commentsCount"]),
    achievementsCount: num(activity["achievement_count"] ?? activity["achievementsCount"]),
    prCount: num(activity["pr_count"] ?? activity["prCount"]),
  };
}

function findFirstActivityShape(
  state: Record<string, unknown>,
): Record<string, unknown> | undefined {
  // Walk one level deep looking for an object that has both an `id` and a
  // `start_date` — heuristic for "this is an activity".
  for (const value of Object.values(state)) {
    if (isObject(value) && "id" in value && ("start_date" in value || "startDate" in value)) {
      return value;
    }
  }
  return undefined;
}

function parseStats(activity: Record<string, unknown>): ActivityStats | undefined {
  const stats = pick(activity, ["stats"]) ?? activity;
  if (!isObject(stats)) return undefined;
  const out: ActivityStats = {
    distanceMeters: num(stats["distance"]),
    movingTimeSeconds: num(stats["moving_time"] ?? stats["movingTime"]),
    elapsedTimeSeconds: num(stats["elapsed_time"] ?? stats["elapsedTime"]),
    totalElevationGainMeters: num(stats["total_elevation_gain"] ?? stats["totalElevationGain"]),
    averageSpeedMetersPerSecond: num(stats["average_speed"] ?? stats["averageSpeed"]),
    maxSpeedMetersPerSecond: num(stats["max_speed"] ?? stats["maxSpeed"]),
    averageHeartrateBpm: num(stats["average_heartrate"] ?? stats["averageHeartrate"]),
    maxHeartrateBpm: num(stats["max_heartrate"] ?? stats["maxHeartrate"]),
    averageWatts: num(stats["average_watts"] ?? stats["averageWatts"]),
    weightedAverageWatts: num(stats["weighted_average_watts"] ?? stats["weightedAverageWatts"]),
    kilojoules: num(stats["kilojoules"]),
    averageCadence: num(stats["average_cadence"] ?? stats["averageCadence"]),
    averageTemperatureCelsius: num(stats["average_temp"] ?? stats["averageTemp"]),
    caloriesKcal: num(stats["calories"]),
  };
  return Object.values(out).some((v) => v !== undefined) ? out : undefined;
}

function parsePhotos(activity: Record<string, unknown>): ActivityPhoto[] | undefined {
  const photos = pick(activity, ["photos"]) ?? pick(activity, ["photos", "primary"]);
  const list = Array.isArray(photos)
    ? photos
    : isObject(photos) && Array.isArray((photos as Record<string, unknown>)["all"])
      ? ((photos as Record<string, unknown>)["all"] as unknown[])
      : undefined;
  if (!list) return undefined;

  const out: ActivityPhoto[] = [];
  for (const raw of list) {
    if (!isObject(raw)) continue;
    const id = numOrStr(raw["id"] ?? raw["unique_id"] ?? raw["uniqueId"]);
    const urls = pickPhotoUrls(raw);
    const hd = highestRes(urls);
    if (!id || !hd) continue;
    const photo: ActivityPhoto = {
      id,
      hdUrl: hd,
    };
    const uniqueId = str(raw["unique_id"] ?? raw["uniqueId"]);
    if (uniqueId) photo.uniqueId = uniqueId;
    const caption = str(raw["caption"]);
    if (caption) photo.caption = caption;
    const capturedAt = str(raw["created_at"] ?? raw["capturedAt"]);
    if (capturedAt) photo.capturedAt = capturedAt;
    const uploadedAt = str(raw["uploaded_at"] ?? raw["uploadedAt"]);
    if (uploadedAt) photo.uploadedAt = uploadedAt;
    if (urls) photo.urls = urls;
    const loc = parseLatLng(raw["location"]) ?? parseLatLng(pick(raw, ["coordinates"]));
    if (loc) photo.location = loc;
    const source = parsePhotoSource(raw["source"]);
    if (source) photo.source = source;
    out.push(photo);
  }
  return out.length ? out : undefined;
}

function pickPhotoUrls(raw: Record<string, unknown>): Record<string, string> | undefined {
  // Common shapes: { urls: { "100": "...", "768": "..." } } OR
  //               { sizes: [{ width: 768, url: "..." }] } OR
  //               flat: { url: "...", url_2k: "..." }
  if (isObject(raw["urls"])) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw["urls"] as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (Array.isArray(raw["sizes"])) {
    const out: Record<string, string> = {};
    for (const item of raw["sizes"] as unknown[]) {
      if (isObject(item) && typeof item["url"] === "string") {
        const w = num(item["width"]) ?? num(item["w"]);
        if (w) out[String(w)] = item["url"] as string;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

function highestRes(urls: Record<string, string> | undefined): string | undefined {
  if (!urls) return undefined;
  const widths = Object.keys(urls)
    .map((k) => Number.parseInt(k, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  for (const w of widths) {
    const u = urls[String(w)];
    if (u) return u;
  }
  // Fall back to whatever non-keyed value
  return Object.values(urls)[0];
}

function parseSplits(activity: Record<string, unknown>): ActivitySplit[] | undefined {
  const splits = activity["splits_metric"] ?? activity["splits"] ?? activity["splitsMetric"];
  if (!Array.isArray(splits)) return undefined;
  const out: ActivitySplit[] = [];
  splits.forEach((raw, idx) => {
    if (!isObject(raw)) return;
    const split: ActivitySplit = {
      number: num(raw["split"]) ?? idx + 1,
      distanceMeters: num(raw["distance"]) ?? 0,
      elapsedTimeSeconds: num(raw["elapsed_time"] ?? raw["elapsedTime"]) ?? 0,
      movingTimeSeconds: num(raw["moving_time"] ?? raw["movingTime"]) ?? 0,
      averageSpeedMetersPerSecond: num(raw["average_speed"] ?? raw["averageSpeed"]) ?? 0,
      elevationDifferenceMeters: num(raw["elevation_difference"] ?? raw["elevationDifference"]),
      averageHeartrateBpm: num(raw["average_heartrate"] ?? raw["averageHeartrate"]),
      averageGradeAdjustedSpeedMetersPerSecond: num(
        raw["average_grade_adjusted_speed"] ?? raw["averageGradeAdjustedSpeed"],
      ),
      paceZone: num(raw["pace_zone"] ?? raw["paceZone"]),
    };
    out.push(split);
  });
  return out.length ? out : undefined;
}

function parseSegmentEfforts(
  activity: Record<string, unknown>,
): ActivitySegmentEffort[] | undefined {
  const efforts = activity["segment_efforts"] ?? activity["segmentEfforts"];
  if (!Array.isArray(efforts)) return undefined;
  const out: ActivitySegmentEffort[] = [];
  for (const raw of efforts) {
    if (!isObject(raw)) continue;
    const id = numOrStr(raw["id"]);
    const segId = numOrStr(pick(raw, ["segment", "id"]) ?? raw["segment_id"]);
    const name = str(pick(raw, ["segment", "name"]) ?? raw["name"]);
    if (!id || !segId || !name) continue;
    out.push({
      id,
      segmentId: segId,
      name,
      elapsedTimeSeconds: num(raw["elapsed_time"] ?? raw["elapsedTime"]) ?? 0,
      movingTimeSeconds: num(raw["moving_time"] ?? raw["movingTime"]) ?? 0,
      distanceMeters: num(raw["distance"]) ?? 0,
      averageWatts: num(raw["average_watts"] ?? raw["averageWatts"]),
      averageHeartrateBpm: num(raw["average_heartrate"] ?? raw["averageHeartrate"]),
      maxHeartrateBpm: num(raw["max_heartrate"] ?? raw["maxHeartrate"]),
      startIndex: num(raw["start_index"] ?? raw["startIndex"]),
      endIndex: num(raw["end_index"] ?? raw["endIndex"]),
      // Use `firstDefined` (not ??) so an explicit `null` value is preserved
      // — it means "not ranked", which is semantically different from missing.
      prRank: numOrNull(firstDefined(raw["pr_rank"], raw["prRank"])),
      komRank: numOrNull(firstDefined(raw["kom_rank"], raw["komRank"])),
      achievementCount: num(raw["achievement_count"] ?? raw["achievementCount"]),
    });
  }
  return out.length ? out : undefined;
}

function parseWeather(activity: Record<string, unknown>): ActivityWeather | undefined {
  const w = pick(activity, ["weather"]);
  if (!isObject(w)) return undefined;
  const out: ActivityWeather = {
    temperatureCelsius: num(w["temperature"] ?? w["temp"]),
    humidityPercent: num(w["humidity"]),
    windSpeedMetersPerSecond: num(w["wind_speed"] ?? w["windSpeed"]),
    windBearingDegrees: num(w["wind_bearing"] ?? w["windBearing"]),
    description: str(w["description"] ?? w["summary"]),
  };
  return Object.values(out).some((v) => v !== undefined) ? out : undefined;
}

function parseBounds(activity: Record<string, unknown>): Activity["bounds"] {
  const map = pick(activity, ["map"]);
  const sw = parseLatLng(pick(map ?? activity, ["bounds", "south_west"]));
  const ne = parseLatLng(pick(map ?? activity, ["bounds", "north_east"]));
  if (!sw || !ne) return undefined;
  return { southwest: sw, northeast: ne };
}

function parsePhotoSource(value: unknown): "strava" | "instagram" | undefined {
  // Strava encodes source as: 1 = native upload, 2 = Instagram embed.
  if (value === 1 || value === "1" || value === "strava") return "strava";
  if (value === 2 || value === "2" || value === "instagram") return "instagram";
  return undefined;
}

function parseLatLng(value: unknown): LatLng | undefined {
  if (Array.isArray(value) && value.length >= 2) {
    const [a, b] = value;
    if (typeof a === "number" && typeof b === "number") return [a, b] as const;
  }
  if (isObject(value)) {
    const lat = num(value["lat"] ?? value["latitude"]);
    const lng = num(value["lng"] ?? value["longitude"] ?? value["lon"]);
    if (lat !== undefined && lng !== undefined) return [lat, lng] as const;
  }
  return undefined;
}

// ── Generic helpers ─────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pick(o: unknown, path: readonly string[]): unknown {
  let cur: unknown = o;
  for (const k of path) {
    if (!isObject(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function numOrNull(v: unknown): number | null | undefined {
  if (v === null) return null;
  return num(v);
}

function numOrStr(v: unknown): number | string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}

/**
 * Like `a ?? b ?? c`, but treats only `undefined` as "missing". An explicit
 * `null` is preserved — necessary when Strava encodes `null` for "no rank"
 * vs `undefined` for "field absent".
 */
function firstDefined<T>(...values: T[]): T | undefined {
  for (const v of values) if (v !== undefined) return v;
  return undefined;
}
