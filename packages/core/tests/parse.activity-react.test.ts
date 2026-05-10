import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractReactComponents,
  findComponent,
  parseActivityPageReact,
} from "../src/parse/activity-react.ts";
import { parseActivityPage } from "../src/parse/activity.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "activity-page-react.html");

describe("extractReactComponents", () => {
  it("returns every data-react-class element with parsed props", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const components = extractReactComponents(html);
    const classes = components.map((c) => c.className);
    expect(classes).toEqual(["ADPKudosAndComments", "MediaThumbnailList", "ExcludedEfforts"]);
  });

  it("findComponent returns first match by string or RegExp", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const components = extractReactComponents(html);
    expect(findComponent(components, "ADPKudosAndComments")?.props.kudosCount).toBe(42);
    expect(findComponent(components, /^Media/)?.className).toBe("MediaThumbnailList");
    expect(findComponent(components, "DoesNotExist")).toBeUndefined();
  });

  it("returns empty array on a page with no react components", () => {
    expect(extractReactComponents("<html><body>nothing</body></html>")).toEqual([]);
  });
});

describe("parseActivityPageReact (Strava 2025+ format)", () => {
  it("extracts name, owner, kudos, comments from ADPKudosAndComments", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const a = parseActivityPageReact(html, "99887766");
    // entityId from ADP arrives as a string; we preserve it as-is.
    expect(a.id).toBe("99887766");
    expect(a.name).toBe("Synthetic Test Ride");
    expect(a.athleteId).toBe(12345);
    expect(a.kudosCount).toBe(42);
    expect(a.commentsCount).toBe(3);
  });

  it("extracts photos with HD URL, UUID, caption, location, and source label", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const a = parseActivityPageReact(html, "99887766");
    expect(a.photos).toHaveLength(2);

    const photos = a.photos ?? [];
    const first = photos[0];
    const second = photos[1];
    expect(first).toMatchObject({
      id: 1001,
      uniqueId: "uuid-photo-1",
      caption: "Sunrise on the climb",
      hdUrl: "https://cdn.example.com/photo1-1536x2048.jpg",
      location: [43.5, 5.7],
      source: "strava",
    });
    expect(second).toMatchObject({
      id: 1002,
      caption: "From an Insta post & tagged", // HTML entities decoded
      source: "instagram",
    });
  });

  it("extracts gear name from the .gear .gear-name span", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const a = parseActivityPageReact(html, "99887766");
    expect(a.gear).toMatchObject({ name: "Specialized Diverge" });
    // Strava doesn't expose the gear ID on the activity page; we leave id as ""
    expect(a.gear?.id).toBe("");
  });

  it("extracts trace bounds from the chained .mbr() JS builder", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const a = parseActivityPageReact(html, "99887766");
    expect(a.bounds).toEqual({
      southwest: [43.526542, 5.762242],
      northeast: [43.831069, 6.468055],
    });
  });

  it("returns id-only Activity when no recognized components are present", () => {
    const html = "<html><body>no components</body></html>";
    const a = parseActivityPageReact(html, "abc");
    expect(a).toEqual({ id: "abc" });
  });
});

describe("parseActivityPage (combined pipeline)", () => {
  it("uses React parser first when modern components are present", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const a = parseActivityPage(html, "99887766");
    expect(a.name).toBe("Synthetic Test Ride");
    expect(a.kudosCount).toBe(42);
    expect(a.photos).toHaveLength(2);
  });

  it("falls back to legacy __INITIAL_STATE__ blob if no React components", async () => {
    // Reuse the legacy fixture from the existing test suite
    const legacyHtml = await readFile(join(__dirname, "fixtures", "activity-page.html"), "utf-8");
    const a = parseActivityPage(legacyHtml, 18424208164);
    expect(a.name).toBe("Jour 7 tour d'Europe partie 1/2");
    expect(a.stats?.distanceMeters).toBe(95979);
  });
});
