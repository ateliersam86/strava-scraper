import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BikePageParseError,
  parseBikeComponentsHtml,
  parseStravaDate,
  parseStravaDistanceToMeters,
} from "../src/parse/bike.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "bike-page.html");

describe("parseStravaDistanceToMeters", () => {
  it.each([
    ["1,234.5 km", 1_234_500],
    ["500 mi", 804_673], // Math.trunc(500 * 1609.34708) — matches Python int()
    ["0 km", 0],
    ["", 0],
    ["12,000 mi", 19_312_164],
  ])("'%s' → %i m", (input, expected) => {
    expect(parseStravaDistanceToMeters(input)).toBe(expected);
  });
});

describe("parseStravaDate", () => {
  it.each([
    ["May 8, 2026", "2026-05-08"],
    ["Apr 1, 2026", "2026-04-01"],
    ["Jan 1, 2020", "2020-01-01"],
    ["Since beginning", "1970-01-01"],
    ["", undefined],
    ["—", undefined],
    ["bogus date", undefined],
  ])("'%s' → '%s'", (input, expected) => {
    expect(parseStravaDate(input)).toBe(expected);
  });
});

describe("parseBikeComponentsHtml", () => {
  it("parses fixture with 3 rows + 1 placeholder row", async () => {
    const html = await readFile(FIXTURE, "utf-8");
    const components = parseBikeComponentsHtml(html);
    expect(components).toHaveLength(3);

    expect(components[0]).toEqual({
      id: "abc1",
      type: "Chain",
      brand: "SRAM",
      model: "XX1 Eagle",
      added: "2026-05-08",
      removed: undefined,
      distanceMeters: 1_234_500,
    });
    expect(components[1]).toEqual({
      id: "def2",
      type: "Tires",
      brand: "Schwalbe",
      model: "G-One Bite",
      added: "2026-04-01",
      removed: "2026-05-01",
      distanceMeters: 804_673,
    });
    expect(components[2]).toMatchObject({
      id: "ghi3",
      added: "1970-01-01", // "Since beginning"
    });
  });

  it("throws when no <thead> table is present", () => {
    expect(() => parseBikeComponentsHtml("<html><body><p>no table</p></body></html>")).toThrow(
      BikePageParseError,
    );
  });
});
