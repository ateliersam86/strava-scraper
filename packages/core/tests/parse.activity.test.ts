import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ActivityPageParseError,
  extractEmbeddedState,
  parseActivityPage,
} from "../src/parse/activity.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "activity-page.html");

describe("extractEmbeddedState", () => {
  it("extracts the __INITIAL_STATE__ blob from the fixture", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const state = extractEmbeddedState(html);
    expect(state).toHaveProperty("activity");
    const activity = (state as { activity: { id: number } }).activity;
    expect(activity.id).toBe(18424208164);
  });

  it("throws when no known state variable is present", () => {
    expect(() => extractEmbeddedState("<html><body>no state</body></html>")).toThrow(
      ActivityPageParseError,
    );
  });

  it("falls back to data-react-props if no script-assignment is found", () => {
    const html = `<html><body>
      <div data-react-class="ActivityPage" data-react-props='{"activity":{"id":42,"name":"X","start_date":"2020-01-01"}}'></div>
    </body></html>`;
    const state = extractEmbeddedState(html);
    expect(state).toMatchObject({ activity: { id: 42, name: "X" } });
  });
});

describe("parseActivityPage", () => {
  it("normalizes fixture into our Activity shape", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const a = parseActivityPage(html, 18424208164);

    expect(a.id).toBe(18424208164);
    expect(a.name).toBe("Jour 7 tour d'Europe partie 1/2");
    expect(a.athleteId).toBe(99);
    expect(a.type).toBe("Ride");
    expect(a.sportType).toBe("GravelRide");
    expect(a.startDateUtc).toBe("2026-05-08T07:28:00Z");
    expect(a.startDateLocal).toBe("2026-05-08T09:28:00");
    expect(a.summaryPolyline).toBe("encoded_summary_xyz");
    expect(a.detailPolyline).toBe("encoded_full_abc");
  });

  it("normalizes stats into typed fields", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const a = parseActivityPage(html, 18424208164);
    expect(a.stats).toMatchObject({
      distanceMeters: 95979,
      movingTimeSeconds: 14400,
      elapsedTimeSeconds: 16200,
      totalElevationGainMeters: 1761,
      averageHeartrateBpm: 142,
      maxHeartrateBpm: 178,
      caloriesKcal: 2300,
    });
  });

  it("extracts photos with HD URL preference", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const a = parseActivityPage(html, 18424208164);
    expect(a.photos).toHaveLength(2);
    const first = a.photos?.[0];
    expect(first?.id).toBe(9001);
    expect(first?.uniqueId).toBe("uuid-9001");
    expect(first?.caption).toBe("Sunrise on the climb");
    expect(first?.hdUrl).toBe("https://dgtzuqphqg23d.cloudfront.net/2048/abc.jpg");
    expect(first?.urls).toMatchObject({
      "100": expect.stringContaining("100"),
      "768": expect.stringContaining("768"),
      "2048": expect.stringContaining("2048"),
    });
  });

  it("extracts splits + segment efforts + weather + counters", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const a = parseActivityPage(html, 18424208164);

    expect(a.splits).toHaveLength(2);
    expect(a.splits?.[0]).toMatchObject({
      number: 1,
      distanceMeters: 1000,
      movingTimeSeconds: 175,
      elevationDifferenceMeters: 12,
    });

    expect(a.segmentEfforts).toHaveLength(1);
    expect(a.segmentEfforts?.[0]).toMatchObject({
      id: 1,
      segmentId: 555,
      name: "Col du fake",
      elapsedTimeSeconds: 600,
      averageWatts: 220,
      prRank: null,
      komRank: null,
      achievementCount: 1,
    });

    expect(a.weather).toMatchObject({
      temperatureCelsius: 22,
      humidityPercent: 65,
      windSpeedMetersPerSecond: 3.2,
      description: "Clear",
    });

    expect(a.kudosCount).toBe(14);
    expect(a.commentsCount).toBe(2);
    expect(a.achievementsCount).toBe(1);
    expect(a.prCount).toBe(0);
  });
});
