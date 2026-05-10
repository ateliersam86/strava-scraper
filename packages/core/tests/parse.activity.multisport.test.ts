import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseActivityPage } from "../src/parse/activity.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures");

describe("parseActivityPage — multi-sport coverage", () => {
  it("parses a Run via window.pageView shape", async () => {
    const html = await readFile(join(FIXTURE_DIR, "activity-page-run.html"), "utf-8");
    const a = parseActivityPage(html, 99887766);
    expect(a.id).toBe(99887766);
    expect(a.type).toBe("Run");
    expect(a.sportType).toBe("TrailRun");
    expect(a.stats?.averageHeartrateBpm).toBe(158);
    expect(a.splits).toHaveLength(2);
    expect(a.kudosCount).toBe(5);
    expect(a.commentsCount).toBe(0);
    // No photos / segments / weather → undefined, not empty array
    expect(a.photos).toBeUndefined();
    expect(a.segmentEfforts).toBeUndefined();
    expect(a.weather).toBeUndefined();
  });

  it("parses a manual Hike entry (private, no GPS)", async () => {
    const html = await readFile(join(FIXTURE_DIR, "activity-page-manual.html"), "utf-8");
    const a = parseActivityPage(html, 7777);
    expect(a.id).toBe(7777);
    expect(a.type).toBe("Hike");
    expect(a.manual).toBe(true);
    expect(a.private).toBe(true);
    expect(a.visibility).toBe("only_me");
    expect(a.summaryPolyline).toBeUndefined();
    expect(a.detailPolyline).toBeUndefined();
    expect(a.stats?.distanceMeters).toBe(5000);
  });
});
