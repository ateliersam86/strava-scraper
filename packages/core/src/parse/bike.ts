/**
 * Gear page parsers — `/bikes/{id}` and `/shoes/{id}`.
 *
 * Each Strava gear page contains:
 * - The gear's metadata at the top (name, brand, model, year, frame type
 *   for bikes; distance counter; description).
 * - For bikes: a `<table>` with a row per component
 *   (chain, tires, cassette, ...): Type | Brand | Model | Added | Removed
 *   | Distance | <delete link>
 *
 * Distances are normalized to meters regardless of the user's unit
 * preference (Strava renders "1,234.5 mi" or "1,234.5 km"). Dates that read
 * "Since beginning" are normalized to `1970-01-01`.
 *
 * Metadata extraction is **lenient**: Strava's HTML evolves; we try several
 * selectors and return whatever we find. Missing fields stay `undefined`.
 */

import * as cheerio from "cheerio";
import type { BikeComponent } from "../types/activity.ts";
import { FrameType } from "../types/enums.ts";
import type { Bike, Shoe } from "../types/gear.ts";

const MILES_PER_KM = 1.609_347_08;

export class BikePageParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BikePageParseError";
  }
}

/**
 * Parse the bike metadata block at the top of `/bikes/{id}`. Best-effort —
 * Strava varies markup between athlete dashboards. Tries:
 *   1. JSON-LD (`<script type="application/ld+json">`)
 *   2. <meta name="bike:*"> tags (rare but observed in some snapshots)
 *   3. .gear-info / .bike-info <dl><dt><dd> pairs
 *   4. <h1> for the name + heuristic fallback
 */
export function parseBikeMetadataHtml(html: string, bikeId: string): Partial<Bike> {
  const $ = cheerio.load(html);
  const out: Partial<Bike> = { id: bikeId, kind: "bike" };

  // 1. Try JSON-LD first — cleanest
  $("script[type='application/ld+json']").each((_, el) => {
    const text = $(el).contents().text().trim();
    if (!text) return;
    try {
      const data = JSON.parse(text);
      if (typeof data?.name === "string" && !out.name) out.name = data.name;
      if (typeof data?.brand?.name === "string" && !out.brandName) out.brandName = data.brand.name;
      if (typeof data?.model === "string" && !out.modelName) out.modelName = data.model;
      if (typeof data?.description === "string" && !out.description)
        out.description = data.description;
    } catch {
      // skip invalid JSON-LD
    }
  });

  // 2. Read <h1> for name (most reliable signal)
  if (!out.name) {
    const h1 = $("h1").first().text().trim();
    if (h1) out.name = h1;
  }

  // 3. <dl> definition lists — Strava commonly renders gear info as dl pairs
  $("dl").each((_, dl) => {
    const dts = $(dl).find("dt");
    const dds = $(dl).find("dd");
    const len = Math.min(dts.length, dds.length);
    for (let i = 0; i < len; i++) {
      const labelEl = dts.eq(i);
      const valueEl = dds.eq(i);
      const label = (labelEl.text() ?? "").trim().toLowerCase();
      const value = (valueEl.text() ?? "").trim();
      if (!label || !value) continue;
      assignFromLabel(out, label, value);
    }
  });

  // 4. Total distance — frequently exposed via `.gear-distance`, `[data-cy*='distance']`
  if (out.distanceMeters == null) {
    const distText =
      $("[data-cy*='distance']").first().text().trim() ||
      $(".gear-distance, .distance").first().text().trim();
    if (distText) {
      const parsed = parseStravaDistanceToMeters(distText);
      if (parsed > 0) out.distanceMeters = parsed;
    }
  }

  return out;
}

/**
 * Parse a `/shoes/{id}` page. Same lenient strategy as
 * {@link parseBikeMetadataHtml} but no components table.
 */
export function parseShoeMetadataHtml(html: string, shoeId: string): Partial<Shoe> {
  const $ = cheerio.load(html);
  const out: Partial<Shoe> = { id: shoeId, kind: "shoe" };

  $("script[type='application/ld+json']").each((_, el) => {
    const text = $(el).contents().text().trim();
    if (!text) return;
    try {
      const data = JSON.parse(text);
      if (typeof data?.name === "string" && !out.name) out.name = data.name;
      if (typeof data?.brand?.name === "string" && !out.brandName) out.brandName = data.brand.name;
      if (typeof data?.model === "string" && !out.modelName) out.modelName = data.model;
      if (typeof data?.description === "string" && !out.description)
        out.description = data.description;
    } catch {
      // skip
    }
  });

  if (!out.name) {
    const h1 = $("h1").first().text().trim();
    if (h1) out.name = h1;
  }

  $("dl").each((_, dl) => {
    const dts = $(dl).find("dt");
    const dds = $(dl).find("dd");
    const len = Math.min(dts.length, dds.length);
    for (let i = 0; i < len; i++) {
      const label = (dts.eq(i).text() ?? "").trim().toLowerCase();
      const value = (dds.eq(i).text() ?? "").trim();
      if (!label || !value) continue;
      assignFromLabel(out, label, value);
    }
  });

  return out;
}

/**
 * Mutable shape that accepts both Bike and Shoe fields. We use this loose
 * type for the assignment helper because `Partial<Bike & Shoe>` collapses
 * to `never` (Bike.kind="bike" vs Shoe.kind="shoe" are mutually exclusive).
 */
type GearAssignTarget = {
  brandName?: string;
  modelName?: string;
  description?: string;
  distanceMeters?: number;
  frameType?: FrameType;
};

function assignFromLabel(out: GearAssignTarget, label: string, value: string): void {
  if ((label.includes("brand") || label.includes("marque")) && !out.brandName) {
    out.brandName = value;
  } else if ((label.includes("model") || label.includes("modèle")) && !out.modelName) {
    out.modelName = value;
  } else if ((label.includes("description") || label.includes("notes")) && !out.description) {
    out.description = value;
  } else if (
    (label.includes("distance") || label.includes("total")) &&
    out.distanceMeters == null
  ) {
    const parsed = parseStravaDistanceToMeters(value);
    if (parsed > 0) out.distanceMeters = parsed;
  } else if (label.includes("frame") || label.includes("type") || label.includes("cadre")) {
    const ft = labelToFrameType(value);
    if (ft != null) out.frameType = ft;
  }
}

function labelToFrameType(value: string): FrameType | undefined {
  const v = value.toLowerCase();
  if (v.includes("mountain") || v.includes("vtt")) return FrameType.MOUNTAIN_BIKE;
  if (v.includes("cross") || v.includes("cyclo")) return FrameType.CROSS_BIKE;
  if (v.includes("road") || v.includes("route")) return FrameType.ROAD_BIKE;
  if (v.includes("time trial") || v.includes("contre")) return FrameType.TIME_TRIAL_BIKE;
  if (v.includes("gravel")) return FrameType.GRAVEL_BIKE;
  return undefined;
}

/**
 * Parse `/bikes/{id}` HTML for both metadata AND components in one pass.
 * Returns a complete `Bike` (best-effort metadata + verified components).
 */
export function parseBikePageHtml(html: string, bikeId: string): Bike {
  const meta = parseBikeMetadataHtml(html, bikeId);
  let components: BikeComponent[] = [];
  try {
    components = parseBikeComponentsHtml(html);
  } catch {
    // Empty / non-existent components table is fine.
  }
  return { ...meta, id: bikeId, kind: "bike", components } as Bike;
}

/**
 * Parse `/shoes/{id}` HTML for shoe metadata. (No components.)
 */
export function parseShoePageHtml(html: string, shoeId: string): Shoe {
  return parseShoeMetadataHtml(html, shoeId) as Shoe;
}

/**
 * Parse the gear list page (e.g. `/settings/gear`) and return all gear refs.
 * Reads anchors of the form `/bikes/<digits>` and `/shoes/<digits>`,
 * deduplicating ids. Strava's settings page is the canonical "all my gear"
 * surface — both bikes (active + retired) and shoes appear.
 */
export function parseGearListHtml(html: string): Array<{ id: string; kind: "bike" | "shoe" }> {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: Array<{ id: string; kind: "bike" | "shoe" }> = [];
  $("a[href*='/bikes/'], a[href*='/shoes/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const bikeMatch = href.match(/\/bikes\/(\d+)/);
    const shoeMatch = href.match(/\/shoes\/(\d+)/);
    if (bikeMatch?.[1]) {
      const id = `b${bikeMatch[1]}`;
      if (!seen.has(id)) {
        seen.add(id);
        out.push({ id, kind: "bike" });
      }
    } else if (shoeMatch?.[1]) {
      const id = `g${shoeMatch[1]}`;
      if (!seen.has(id)) {
        seen.add(id);
        out.push({ id, kind: "shoe" });
      }
    }
  });
  return out;
}

export function parseBikeComponentsHtml(html: string): BikeComponent[] {
  const $ = cheerio.load(html);

  // Look for the first table that has a <thead> — that's the components grid.
  // (Strava's other tables on this page lack a thead.)
  const table = $("table")
    .filter((_i, el) => $(el).find("thead").length > 0)
    .first();

  if (table.length === 0) {
    throw new BikePageParseError(
      "No components table with <thead> found — Strava layout may have changed",
    );
  }

  const components: BikeComponent[] = [];
  table.find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 7) {
      // "No active components" row, or padding row — skip.
      return;
    }
    const cellTexts: string[] = [];
    cells.each((_, c) => {
      cellTexts.push($(c).text().trim());
    });

    const [type, brand, model, addedRaw, removedRaw, distanceRaw] = cellTexts;
    if (!type || !brand || !model || distanceRaw === undefined) return;

    const deleteLink = $(cells[6]).find('a[href*="/components/"]').attr("href");
    if (!deleteLink) return;
    const componentId = deleteLink.split("/").pop();
    if (!componentId) return;

    components.push({
      id: componentId,
      type,
      brand,
      model,
      added: parseStravaDate(addedRaw),
      removed: parseStravaDate(removedRaw),
      distanceMeters: parseStravaDistanceToMeters(distanceRaw),
    });
  });

  return components;
}

/**
 * Convert a distance string Strava renders into meters. Handles both
 * English ("1,234.5 mi") and French ("14 018,4 km") locales.
 *
 * - English: comma = thousands separator, dot = decimal → "1,234.5" = 1234.5
 * - French:  space/NBSP = thousands, comma = decimal     → "14 018,4" = 14018.4
 *
 * Heuristic: if the string contains BOTH `,` and `.`, it's English (commas
 * are thousands). If only `,` exists, treat it as decimal (French).
 */
export function parseStravaDistanceToMeters(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const isMiles = /\bmi\b/i.test(trimmed);

  // Strip everything except digits, commas, dots
  let s = trimmed.replace(/[^\d.,]/g, "");
  if (!s) return 0;

  const hasDot = s.includes(".");
  const commas = s.match(/,/g)?.length ?? 0;
  if (hasDot || commas > 1) {
    // English: comma is thousands separator (e.g. "1,234,567.89")
    s = s.replace(/,/g, "");
  } else if (commas === 1) {
    // Single comma, no dot. Disambiguate by digits AFTER the comma:
    //   "12,000" → exactly 3 digits = English thousands → drop the comma
    //   "14 018,4" / "5,2" → 1-2 digits = French decimal → swap to dot
    const afterComma = s.split(",")[1] ?? "";
    if (afterComma.length === 3 && /^\d{3}$/.test(afterComma)) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(/,/g, ".");
    }
  }
  // If only dot exists, already in canonical form.

  const numeric = Number.parseFloat(s);
  if (Number.isNaN(numeric)) return 0;
  // Truncate (not round) to match stravaweblib's `int()` behaviour exactly.
  return Math.trunc(numeric * (isMiles ? MILES_PER_KM * 1000 : 1000));
}

/**
 * Parse the date strings Strava renders in tables. Returns ISO YYYY-MM-DD or
 * `undefined` if not parseable. The literal "Since beginning" is normalized
 * to the unix epoch date — same convention as stravaweblib.
 */
export function parseStravaDate(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return undefined;
  if (/^since beginning$/i.test(trimmed)) return "1970-01-01";

  // Strava uses "%b %d, %Y" → e.g. "May 8, 2026".
  const match = trimmed.match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) return undefined;
  const [, monthName, day, year] = match;
  const monthIdx = MONTHS.indexOf((monthName ?? "").slice(0, 3).toLowerCase());
  if (monthIdx < 0 || !day || !year) return undefined;
  const dd = day.padStart(2, "0");
  const mm = String(monthIdx + 1).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
