import { describe, expect, it } from "vitest";
import {
  enrichTripSegmentFromScraper,
  enrichTripSegments,
  profileFromStreams,
} from "../src/integrations/atelier-web-travels.ts";
import type { Activity } from "../src/types/activity.ts";
import type { StreamSet } from "../src/types/streams.ts";

const ACTIVITY: Activity = {
  id: 18424208164,
  athleteId: 99,
  startDateUtc: "2026-05-08T07:28:00Z",
  startDateLocal: "2026-05-08T09:28:00",
  name: "Jour 7 partie 1/2",
  type: "Ride",
  stats: {
    distanceMeters: 95979,
    movingTimeSeconds: 14400,
    elapsedTimeSeconds: 16200,
    totalElevationGainMeters: 1761,
    averageSpeedMetersPerSecond: 6.66,
  },
};

const STREAMS: StreamSet = {
  time: {
    type: "time",
    data: [0, 60, 180, 360],
    original_size: 4,
    resolution: "high",
    series_type: "distance",
  },
  distance: {
    type: "distance",
    data: [0, 500, 1500, 3000], // meters
    original_size: 4,
    resolution: "high",
    series_type: "distance",
  },
  altitude: {
    type: "altitude",
    data: [400, 410, 425, 440],
    original_size: 4,
    resolution: "high",
    series_type: "distance",
  },
  latlng: {
    type: "latlng",
    data: [
      [45.5, 1.6],
      [45.51, 1.61],
      [45.52, 1.62],
      [45.53, 1.63],
    ],
    original_size: 4,
    resolution: "high",
    series_type: "distance",
  },
};

describe("profileFromStreams", () => {
  it("zips streams index-wise and computes ISO time", () => {
    const startMs = Date.parse("2026-05-08T07:28:00Z");
    const profile = profileFromStreams(STREAMS, startMs);
    expect(profile).toHaveLength(4);
    expect(profile?.[0]).toMatchObject({
      distanceKm: 0,
      altitude: 400,
      lat: 45.5,
      lon: 1.6,
      time: "2026-05-08T07:28:00.000Z",
    });
    expect(profile?.[1]?.time).toBe("2026-05-08T07:29:00.000Z"); // +60s
    expect(profile?.[3]?.time).toBe("2026-05-08T07:34:00.000Z"); // +360s
  });

  it("returns profile without time when segmentStartMs is undefined", () => {
    const profile = profileFromStreams(STREAMS, undefined);
    expect(profile).toHaveLength(4);
    expect(profile?.[0]?.time).toBeUndefined();
    expect(profile?.[0]?.altitude).toBe(400);
  });

  it("returns undefined when no distance stream", () => {
    expect(profileFromStreams({} as StreamSet, 0)).toBeUndefined();
  });
});

describe("enrichTripSegmentFromScraper", () => {
  it("populates startTime + movingDurationS + distanceKm from Activity", () => {
    const out = enrichTripSegmentFromScraper({ id: "strava-18424208164" }, { activity: ACTIVITY });
    expect(out.startTime).toBe("2026-05-08T07:28:00Z");
    expect(out.movingDurationS).toBe(14400);
    expect(out.totalDurationS).toBe(16200);
    expect(out.distanceKm).toBeCloseTo(95.979, 3);
    expect(out.elevationGain).toBe(1761);
    expect(out.averageSpeedKmh).toBe(24); // 6.66 m/s × 3.6 ≈ 23.976 → rounded
  });

  it("populates profile with timestamps when both Activity + streams given", () => {
    const out = enrichTripSegmentFromScraper(
      { id: "strava-18424208164" },
      { activity: ACTIVITY, streams: STREAMS },
    );
    expect(out.profile).toHaveLength(4);
    expect(out.profile?.[1]?.time).toBe("2026-05-08T07:29:00.000Z");
  });

  it("does not mutate the input segment", () => {
    const seg = { id: "strava-1" };
    const out = enrichTripSegmentFromScraper(seg, { activity: ACTIVITY });
    expect(seg).toEqual({ id: "strava-1" });
    expect(out).not.toBe(seg);
  });

  it("preserves existing startTime if scraper has none", () => {
    const out = enrichTripSegmentFromScraper(
      { id: "strava-1", startTime: "2025-01-01T00:00:00Z" },
      { activity: { id: 1 } as Activity },
    );
    expect(out.startTime).toBe("2025-01-01T00:00:00Z");
  });
});

describe("enrichTripSegments (batch)", () => {
  it("only enriches segments that have a matching bundle", () => {
    const result = enrichTripSegments(
      [{ id: "strava-1" }, { id: "strava-2" }, { id: "strava-3" }],
      {
        "strava-1": { activity: ACTIVITY },
        "strava-3": { activity: ACTIVITY, streams: STREAMS },
      },
    );
    expect(result[0]?.movingDurationS).toBe(14400);
    expect(result[1]?.movingDurationS).toBeUndefined();
    expect(result[2]?.profile).toHaveLength(4);
  });
});
