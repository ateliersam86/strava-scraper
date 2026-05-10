import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseBikePageHtml, parseGearListHtml, parseShoePageHtml } from "../src/parse/bike.ts";
import { FrameType } from "../src/types/enums.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures");

describe("parseBikePageHtml — metadata + components combined", () => {
  it("extracts JSON-LD + dl + components in one call", async () => {
    const html = await readFile(join(FIXTURE_DIR, "bike-page-with-meta.html"), "utf-8");
    const bike = parseBikePageHtml(html, "b12345");
    expect(bike.id).toBe("b12345");
    expect(bike.kind).toBe("bike");
    expect(bike.name).toBe("Gravel Beast");
    expect(bike.brandName).toBe("Specialized");
    expect(bike.modelName).toBe("Diverge Comp");
    expect(bike.description).toBe("All-day adventure rig");
    expect(bike.frameType).toBe(FrameType.GRAVEL_BIKE);
    expect(bike.distanceMeters).toBe(12_345_600); // 12,345.6 km
    expect(bike.components).toHaveLength(1);
    expect(bike.components?.[0]?.type).toBe("Chain");
  });

  it("falls back gracefully when components table is absent", () => {
    const html = "<html><body><h1>My Bike</h1></body></html>";
    const bike = parseBikePageHtml(html, "b1");
    expect(bike.name).toBe("My Bike");
    expect(bike.components).toEqual([]);
  });
});

describe("parseShoePageHtml", () => {
  it("extracts shoe metadata from h1 + dl, miles → meters", async () => {
    const html = await readFile(join(FIXTURE_DIR, "shoe-page.html"), "utf-8");
    const shoe = parseShoePageHtml(html, "g99999");
    expect(shoe.kind).toBe("shoe");
    expect(shoe.id).toBe("g99999");
    expect(shoe.name).toBe("Pegasus 38");
    expect(shoe.brandName).toBe("Nike");
    expect(shoe.modelName).toBe("Pegasus 38");
    expect(shoe.description).toBe("Daily trainer");
    // 320 mi × 1609.34708 ≈ 514,991 m (truncated)
    expect(shoe.distanceMeters).toBe(514_991);
  });
});

describe("parseGearListHtml", () => {
  it("extracts bike + shoe ids from anchors, deduplicating", async () => {
    const html = await readFile(join(FIXTURE_DIR, "gear-list-page.html"), "utf-8");
    const refs = parseGearListHtml(html);
    expect(refs).toEqual([
      { id: "b12345", kind: "bike" },
      { id: "b67890", kind: "bike" },
      { id: "g99999", kind: "shoe" },
      { id: "g11111", kind: "shoe" },
    ]);
  });

  it("returns empty array when page has no gear anchors", () => {
    expect(parseGearListHtml("<html><body>nothing</body></html>")).toEqual([]);
  });

  it("ignores anchors that don't match /bikes/<digits> or /shoes/<digits>", () => {
    const html = `<a href="/bikes/abc">x</a><a href="/shoes/">y</a><a href="/bikes/123">z</a>`;
    expect(parseGearListHtml(html)).toEqual([{ id: "b123", kind: "bike" }]);
  });
});
