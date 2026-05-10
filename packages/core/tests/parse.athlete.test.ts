import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAthleteProfileHtml } from "../src/parse/athlete.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "athlete-profile.html");

describe("parseAthleteProfileHtml (Strava 2025+ profile page)", () => {
  it("extracts name, avatar, activity ids, and recent activities (deduped)", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const profile = parseAthleteProfileHtml(html, 12345);

    expect(profile.id).toBe(12345);
    expect(profile.name).toBe("Synthetic Athlete Name");
    expect(profile.avatarUrl).toBe("https://cdn.example.com/avatar-large.jpg");

    // Activity IDs from feed anchors, deduped (777 appears twice)
    expect(profile.recentActivityIds).toEqual([777, 888, 999]);

    // recentActivities: deduped — 777 appears twice in MediaGrid but only once here
    expect(profile.recentActivities).toHaveLength(2);

    const ride = profile.recentActivities[0];
    expect(ride).toMatchObject({
      id: 777,
      athleteId: 12345,
      name: "Morning Ride",
      description: "Quick spin",
      type: "Ride",
      startDate: "2026-05-09T07:00:00Z",
      distanceMeters: 35000.5,
      movingTimeSeconds: 4500,
      elevationGainMeters: 420,
    });

    const run = profile.recentActivities[1];
    expect(run?.id).toBe(888);
    expect(run?.type).toBe("TrailRun");
  });

  it("extracts photos with HD URL + decoded caption", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const profile = parseAthleteProfileHtml(html, 12345);
    expect(profile.recentPhotos).toHaveLength(2);
    expect(profile.recentPhotos?.[0]).toMatchObject({
      id: 1001,
      hdUrl: "https://cdn.example.com/p1.jpg",
      caption: "Sunrise",
      source: "strava",
    });
  });

  it("extracts public bikes + shoes from sidebar gear tables", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const profile = parseAthleteProfileHtml(html, 12345);
    expect(profile.bikes).toEqual([
      { name: "Specialized Diverge", distanceMeters: 14_018_400 },
      { name: "le Kona", distanceMeters: 2_209_400 },
    ]);
    expect(profile.shoes).toEqual([
      // 500 mi × 1609.34708 = 804,673 m (Math.trunc to match Python int())
      { name: "Salomon Sense Ride", distanceMeters: 804_673 },
    ]);
  });

  it("returns minimal profile when there are no React components", () => {
    const html = `<html><body><h1>Just Name</h1><a href="/activities/123">go</a></body></html>`;
    const profile = parseAthleteProfileHtml(html, "abc");
    expect(profile.name).toBe("Just Name");
    expect(profile.recentActivityIds).toEqual([123]);
    expect(profile.recentActivities).toEqual([]);
    expect(profile.recentPhotos).toBeUndefined();
  });
});
