/**
 * atelier-web-travels integration.
 *
 * Bridges scraper output → atelier-web-travels' `TripGpxSegment` shape so the
 * timelapse widget can finally render with real per-point timestamps.
 *
 * Usage in atelier-web-travels:
 * ```ts
 * import { enrichTripSegmentFromScraper } from "@atelier/strava-scraper-core/integrations/atelier-web-travels";
 *
 * for (const seg of story.gpxSegments) {
 *   const streams = JSON.parse(fs.readFileSync(`out/activities/${seg.id.replace("strava-","")}/streams.json`, "utf-8"));
 *   const activity = JSON.parse(fs.readFileSync(`out/activities/${...}/activity.json`, "utf-8"));
 *   const enriched = enrichTripSegmentFromScraper(seg, { activity, streams });
 *   // → enriched.profile now has time per point, enriched.movingDurationS is set
 * }
 * ```
 *
 * Pure function. Doesn't read files / hit network — caller wires the I/O.
 */

import type { Activity } from "../types/activity.ts";
import type { StreamSet } from "../types/streams.ts";

/**
 * Subset of atelier-web-travels' `TripGpxSegment` schema we care about.
 * Kept here as a local type to avoid coupling this package to the
 * atelier-web-travels source. Callers cast their richer type to/from this.
 */
export type AtwSegment = {
  id: string;
  label?: string;
  distanceKm?: number;
  elevationGain?: number;
  startTime?: string;
  endTime?: string;
  /** Optional sample list: distanceKm + altitude + lat/lng + ISO time. */
  profile?: Array<{
    distanceKm: number;
    altitude?: number;
    lat?: number;
    lon?: number;
    time?: string;
  }>;
  averageSpeedKmh?: number;
  /**
   * Moving time in seconds. Sourced from streams (last `time` value) when
   * available, otherwise from the parsed Activity's `stats.movingTimeSeconds`.
   */
  movingDurationS?: number;
  totalDurationS?: number;
};

export type ScraperBundle = {
  activity?: Activity;
  streams?: StreamSet;
};

/**
 * Build a profile array (distance/elevation/lat/lng/time) from streams. Each
 * stream is sampled at the same frequency, so we zip them index-wise. We take
 * the lowest-common count across present streams and skip entries where any
 * required field is null/undefined.
 *
 * The `time` field is computed as `segmentStartMs + time[i] * 1000`, returned
 * as an ISO string. This is what the timelapse widget consumes.
 */
export function profileFromStreams(
  streams: StreamSet,
  segmentStartMs: number | undefined,
): AtwSegment["profile"] {
  const time = streams.time?.data;
  const distance = streams.distance?.data;
  const altitude = streams.altitude?.data;
  const latlng = streams.latlng?.data;

  if (!distance) return undefined;

  const len = Math.min(
    distance.length,
    time?.length ?? Number.POSITIVE_INFINITY,
    altitude?.length ?? Number.POSITIVE_INFINITY,
    latlng?.length ?? Number.POSITIVE_INFINITY,
  );

  const profile: NonNullable<AtwSegment["profile"]> = [];
  for (let i = 0; i < len; i++) {
    const distM = distance[i];
    if (typeof distM !== "number") continue;
    const entry: NonNullable<AtwSegment["profile"]>[number] = {
      distanceKm: distM / 1000,
    };
    if (altitude) {
      const alt = altitude[i];
      if (typeof alt === "number") entry.altitude = alt;
    }
    if (latlng) {
      const ll = latlng[i];
      if (Array.isArray(ll) && ll.length === 2) {
        entry.lat = ll[0];
        entry.lon = ll[1];
      }
    }
    if (time && segmentStartMs != null) {
      const t = time[i];
      if (typeof t === "number") {
        entry.time = new Date(segmentStartMs + t * 1000).toISOString();
      }
    }
    profile.push(entry);
  }
  return profile.length ? profile : undefined;
}

/**
 * Merge scraper output into a {@link AtwSegment} without mutating the input.
 *
 * Wins (in order of precedence): scraper data overrides existing values when
 * both are present. The caller can re-merge if they want existing values to
 * win.
 */
export function enrichTripSegmentFromScraper(
  segment: AtwSegment,
  bundle: ScraperBundle,
): AtwSegment {
  const out: AtwSegment = { ...segment };
  const activity = bundle.activity;
  const streams = bundle.streams;

  if (activity) {
    if (activity.startDateUtc && !out.startTime) out.startTime = activity.startDateUtc;
    if (activity.stats?.movingTimeSeconds != null) {
      out.movingDurationS = activity.stats.movingTimeSeconds;
    }
    if (activity.stats?.elapsedTimeSeconds != null) {
      out.totalDurationS = activity.stats.elapsedTimeSeconds;
    }
    if (activity.stats?.distanceMeters != null) {
      out.distanceKm = activity.stats.distanceMeters / 1000;
    }
    if (activity.stats?.totalElevationGainMeters != null) {
      out.elevationGain = activity.stats.totalElevationGainMeters;
    }
    if (activity.stats?.averageSpeedMetersPerSecond != null) {
      out.averageSpeedKmh = Math.round(activity.stats.averageSpeedMetersPerSecond * 3.6 * 10) / 10;
    }
  }

  if (streams) {
    const segmentStartMs = parseStartMs(out.startTime);
    const profile = profileFromStreams(streams, segmentStartMs);
    if (profile && profile.length > 0) out.profile = profile;
    if (!out.movingDurationS) {
      const tStream = streams.time?.data;
      if (tStream && tStream.length > 0) {
        const last = tStream[tStream.length - 1];
        if (typeof last === "number") out.movingDurationS = last;
      }
    }
  }

  return out;
}

function parseStartMs(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Convenience: enrich many segments at once. Bundles is a map keyed by the
 * segment id (e.g. "strava-12345").
 */
export function enrichTripSegments(
  segments: readonly AtwSegment[],
  bundles: Record<string, ScraperBundle | undefined>,
): AtwSegment[] {
  return segments.map((seg) => {
    const bundle = bundles[seg.id];
    return bundle ? enrichTripSegmentFromScraper(seg, bundle) : seg;
  });
}
