/**
 * Bike-components-table parser.
 *
 * Strava's `/bikes/{id}` page contains a `<table>` with a row per component
 * (chain, tires, cassette, ...). Each row exposes:
 *   Type | Brand | Model | Added | Removed | Distance | <delete link>
 *
 * Direct port of `stravaweblib.WebClient._get_all_bike_components` with the
 * same heuristics for parsing distances, dates, and component IDs.
 *
 * Distances are normalized to meters regardless of the user's unit
 * preference (Strava renders "1,234.5 mi" or "1,234.5 km"). Dates that read
 * "Since beginning" are normalized to `1970-01-01`.
 */

import * as cheerio from "cheerio";
import type { BikeComponent } from "../types/activity.ts";

const MILES_PER_KM = 1.609_347_08;

export class BikePageParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BikePageParseError";
  }
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
 * Convert "1,234.5 mi" / "987.6 km" / "" → meters.
 */
export function parseStravaDistanceToMeters(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const isMiles = /\bmi\b/i.test(trimmed);
  const numericRaw = trimmed.replace(/,/g, "").replace(/[^\d.]/g, "");
  const numeric = Number.parseFloat(numericRaw);
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
