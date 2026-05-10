/**
 * Activity HTML stats extractor — locale-aware, label-driven.
 *
 * Strava activity pages render stats in two regions:
 *
 *   1. `ul.inline-stats` (top of page, "primary" stats):
 *      <li><strong>VALUE<abbr class="unit">UNIT</abbr></strong>
 *          <div class="label">LABEL</div></li>
 *
 *   2. `div.more-stats > table` (Avg/Max table, expandable):
 *      <thead><tr><th></th><th>Moy.</th><th>Max.</th></tr></thead>
 *      <tbody>
 *        <tr><th>Vitesse</th>
 *            <td>22,4 km/h</td><td>57,3 km/h</td></tr>      ← avg/max
 *        <tr><th>Calories</th>
 *            <td colspan="2">3 197</td></tr>                ← single value
 *      </tbody>
 *
 * We map the LABEL text (French + English) to a typed stats field.
 * Unknown labels are ignored — Strava adds new stats over time.
 *
 * Verified against the reference account's "Jour 7 partie 1/2" activity (FR locale)
 * on 2026-05-10. Strings extracted: Distance, Durée de déplacement,
 * Dénivelé positif, Puissance moy. estimée, Dépense d'énergie, Vitesse
 * (moy + max), Calories, Température, Temps écoulé, Garmin Edge 1030 Plus.
 */

import * as cheerio from "cheerio";
import type { ActivityStats } from "../types/activity.ts";

// Label canonicalization: lowercase + strip accents so we can match
// French + English without an alias table that grows forever.
const LABEL_MAP: Record<string, keyof ActivityStats | "device" | "ignore"> = {
  // Distance
  distance: "distanceMeters",
  // Moving time
  "duree de deplacement": "movingTimeSeconds",
  "moving time": "movingTimeSeconds",
  // Elapsed time
  "temps ecoule": "elapsedTimeSeconds",
  "elapsed time": "elapsedTimeSeconds",
  // Total time (some pages use this)
  "temps total": "elapsedTimeSeconds",
  "total time": "elapsedTimeSeconds",
  // Elevation
  "denivele positif": "totalElevationGainMeters",
  "elevation gain": "totalElevationGainMeters",
  denivele: "totalElevationGainMeters",
  elevation: "totalElevationGainMeters",
  // Speed
  vitesse: "averageSpeedMetersPerSecond", // resolved by avg vs max in table
  speed: "averageSpeedMetersPerSecond",
  pace: "averageSpeedMetersPerSecond",
  allure: "averageSpeedMetersPerSecond",
  // Heart rate
  "frequence cardiaque": "averageHeartrateBpm",
  fc: "averageHeartrateBpm",
  "heart rate": "averageHeartrateBpm",
  // Power
  "puissance moy. estimee": "averageWatts",
  "puissance moyenne estimee": "averageWatts",
  "estimated avg power": "averageWatts",
  "puissance moyenne": "averageWatts",
  "average power": "averageWatts",
  "puissance ponderee": "weightedAverageWatts",
  "weighted avg power": "weightedAverageWatts",
  puissance: "averageWatts", // fallback
  // Energy / calories
  "depense d'energie": "kilojoules",
  "depense denergie": "kilojoules",
  "energy output": "kilojoules",
  calories: "caloriesKcal",
  // Cadence
  cadence: "averageCadence",
  // Temperature
  temperature: "averageTemperatureCelsius",
  // Device (treated specially, not a stat)
  device: "device",
};

export function extractActivityStatsFromHtml(html: string): {
  stats: ActivityStats;
  deviceName?: string;
} {
  const $ = cheerio.load(html);
  const out: ActivityStats = {};
  let deviceName: string | undefined;

  // ── Pass 1: ul.inline-stats <li> entries ────────────────────────────────
  $("ul.inline-stats li").each((_, li) => {
    const valueText = $(li).find("strong").first().text().trim();
    const labelText = $(li).find(".label").first().text().trim();
    if (!valueText || !labelText) return;
    assignByLabel(out, labelText, valueText, "single");
  });

  // ── Pass 2: .more-stats > table (Avg/Max + colspan=2 single values) ───
  $(".more-stats table tbody tr").each((_, tr) => {
    const labelText = $(tr).find("th").first().text().trim();
    if (!labelText) return;
    const tds = $(tr).find("td");
    if (tds.length === 0) return;
    if (tds.length === 1 || $(tds[0]).attr("colspan") === "2") {
      // Single value (Calories, Température, Temps écoulé, ...)
      const value = $(tds[0]).text().trim();
      assignByLabel(out, labelText, value, "single");
    } else if (tds.length >= 2) {
      // Avg / Max columns
      const avg = $(tds[0]).text().trim();
      const max = $(tds[1]).text().trim();
      assignByLabel(out, labelText, avg, "avg");
      if (max) assignByLabel(out, labelText, max, "max");
    }
  });

  // ── Device name (separate from stats) ────────────────────────────────────
  const dev = $(".device").first().text().trim();
  if (dev) deviceName = dev;

  if (deviceName) {
    return { stats: out, deviceName };
  }
  return { stats: out };
}

/**
 * Map a label + value into the right ActivityStats field.
 * `column` indicates whether the value is the avg, max, or a single value.
 */
function assignByLabel(
  out: ActivityStats,
  rawLabel: string,
  rawValue: string,
  column: "avg" | "max" | "single",
): void {
  const key = canonicalLabel(rawLabel);
  const target = LABEL_MAP[key];
  if (!target || target === "device" || target === "ignore") return;

  // Avg/Max disambiguation for the few labels that have both.
  let field: keyof ActivityStats = target;
  if (column === "max") {
    if (target === "averageSpeedMetersPerSecond") field = "maxSpeedMetersPerSecond";
    else if (target === "averageHeartrateBpm") field = "maxHeartrateBpm";
    else if (target === "averageWatts") field = "maxWatts";
    else if (target === "averageCadence") field = "maxCadence";
    else return; // unknown max-target
  }

  // Convert the value to the field's expected unit.
  const numeric = parseValueToNumber(field, rawValue);
  if (numeric == null) return;
  out[field] = numeric;
}

function canonicalLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: matches combining diacritical marks U+0300–U+036F
      .replace(/[̀-ͯ]/g, "")
      .replace(/[‘’ʼ]/g, "'") // smart-quotes → ASCII
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Parse a Strava-rendered value (e.g. "22,4 km/h", "1 448 kJ", "4:16:00",
 * "15 ℃", "3 197", "94 W") to its canonical numeric type for the given field.
 */
function parseValueToNumber(field: keyof ActivityStats, value: string): number | null {
  const numStr = canonicalNumeric(value);
  // Time fields (HH:MM:SS or MM:SS)
  if (field === "movingTimeSeconds" || field === "elapsedTimeSeconds") {
    const seconds = parseHmsToSeconds(value);
    return seconds;
  }
  const n = numStr ? Number.parseFloat(numStr) : Number.NaN;
  if (!Number.isFinite(n)) return null;

  switch (field) {
    case "distanceMeters": {
      // Strava renders distance in km (FR/EN) or mi (EN). Multiply accordingly.
      const isMiles = /\bmi\b/i.test(value);
      return Math.round(n * (isMiles ? 1609.34708 : 1000));
    }
    case "totalElevationGainMeters":
      // "ft" if user prefers feet, "m" otherwise
      return /\bft\b/i.test(value) ? Math.round(n * 0.3048) : Math.round(n);
    case "averageSpeedMetersPerSecond":
    case "maxSpeedMetersPerSecond": {
      const isMph = /\bmph\b/i.test(value);
      return isMph ? n * 0.44704 : n / 3.6; // km/h → m/s
    }
    case "averageHeartrateBpm":
    case "maxHeartrateBpm":
    case "averageCadence":
    case "maxCadence":
    case "caloriesKcal":
    case "kilojoules":
    case "averageWatts":
    case "maxWatts":
    case "weightedAverageWatts":
      return Math.round(n);
    case "averageTemperatureCelsius": {
      // "°F" if user prefers Fahrenheit
      if (/°?\s*F\b/.test(value)) return Math.round(((n - 32) * 5) / 9);
      return Math.round(n);
    }
    default:
      return n;
  }
}

/** Parse "1:23:45" / "23:45" / "1 234,5" / "1,234.5" → numeric seconds for time, raw number otherwise. */
function parseHmsToSeconds(text: string): number | null {
  const matches = text.match(/(\d+):(\d{1,2})(?::(\d{1,2}))?/);
  if (!matches) {
    // Maybe just "45min" or "1h30min" formats — minimal support.
    const minMatch = text.match(/(\d+)\s*min/i);
    if (minMatch) {
      const m = Number.parseInt(minMatch[1] ?? "0", 10);
      return m * 60;
    }
    return null;
  }
  const a = Number.parseInt(matches[1] ?? "0", 10);
  const b = Number.parseInt(matches[2] ?? "0", 10);
  const c = matches[3] ? Number.parseInt(matches[3], 10) : null;
  if (c !== null) {
    // H:MM:SS
    return a * 3600 + b * 60 + c;
  }
  // MM:SS
  return a * 60 + b;
}

/**
 * Convert "22,4" / "1 448" / "1,234.5" → "22.4" / "1448" / "1234.5".
 * Locale-aware: French uses ",". English uses ",".
 */
function canonicalNumeric(text: string): string | null {
  // Strip everything except digits, comma, dot
  const stripped = text.replace(/[^\d.,-]/g, "");
  if (!stripped) return null;
  const hasDot = stripped.includes(".");
  const commas = stripped.match(/,/g)?.length ?? 0;
  let s = stripped;
  if (hasDot || commas > 1) {
    s = s.replace(/,/g, "");
  } else if (commas === 1) {
    const after = s.split(",")[1] ?? "";
    if (after.length === 3 && /^\d{3}$/.test(after)) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(/,/g, ".");
    }
  }
  return s;
}
