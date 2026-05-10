/**
 * `strava-scraper gear` — backup all bikes + shoes via HTML scraping.
 *
 * Default flow (no OAuth needed):
 *   1. GET `/settings/gear` → list of bike + shoe ids
 *   2. For each bike: GET `/bikes/{id}` → metadata + components
 *   3. For each shoe: GET `/shoes/{id}` → metadata
 *   4. Persist via FilesystemAdapter.writeGear
 *
 * Optional OAuth enrichment (--api-token):
 *   5. For each gear: GET `/api/v3/gear/{id}` to fill any missing field the
 *      HTML didn't expose (frame_type, brand_name, etc.)
 *
 * The HTML approach is preferred because the user pushed for "tout via
 * scraping". The API enrichment is purely additive — never overwrites HTML
 * values.
 */

import {
  StravaApiClient,
  parseBikePageHtml,
  parseGearListHtml,
  parseShoePageHtml,
} from "@atelier/strava-scraper-core";
import { normalizeGear } from "@atelier/strava-scraper-core/api/gear";
import type { Bike, Gear, Shoe } from "@atelier/strava-scraper-core/types/gear";
import { FilesystemAdapter } from "@atelier/strava-scraper-storage";
import { resolveAuth } from "../auth-resolver.ts";

const STRAVA_BASE_URL = "https://www.strava.com";

// Strava sometimes routes /settings/gear → /settings/gear/bikes — both work.
const GEAR_LIST_URLS = ["/settings/gear", "/settings/gear/bikes", "/athlete/gear"];

export type DownloadGearCommandOptions = {
  outDir: string;
  /** JWT cookie for HTML scraping. Required. */
  jwt?: string;
  statePath: string;
  /** Optional: OAuth access token to enrich missing fields from /api/v3/gear/{id}. */
  apiToken?: string;
  /** Skip the components scrape (faster, gear metadata only). */
  noComponents?: boolean;
};

export async function downloadGearCommand(options: DownloadGearCommandOptions): Promise<void> {
  const auth = await resolveAuth(options);
  await auth.prepare();
  const cookies = auth.getCookies();
  const cookieHeader = `${"strava_remember_id"}=${cookies.strava_remember_id}; ${"strava_remember_token"}=${cookies.strava_remember_token}`;
  const fs = new FilesystemAdapter({ rootDir: options.outDir });
  const apiClient = options.apiToken
    ? new StravaApiClient({ accessToken: options.apiToken })
    : null;

  try {
    // 1. List gear via HTML scrape of settings page
    const refs = await listGearViaHtml(cookieHeader);
    console.log(
      `→ ${refs.filter((r) => r.kind === "bike").length} bike(s), ` +
        `${refs.filter((r) => r.kind === "shoe").length} shoe(s) found`,
    );

    // 2. For each: scrape individual page → metadata + components (bikes only)
    let processed = 0;
    for (const ref of refs) {
      const numericId = ref.id.slice(1);
      const path = ref.kind === "bike" ? `/bikes/${numericId}` : `/shoes/${numericId}`;
      console.log(`→ ${path}`);
      try {
        const html = await fetchHtml(`${STRAVA_BASE_URL}${path}`, cookieHeader);
        let gear: Gear =
          ref.kind === "bike" ? parseBikePageHtml(html, ref.id) : parseShoePageHtml(html, ref.id);

        // Drop components if --no-components was passed
        if (options.noComponents && gear.kind === "bike") {
          const stripped: Bike = { ...gear };
          delete stripped.components;
          gear = stripped;
        }

        // 3. Optional API enrichment
        if (apiClient) {
          gear = await enrichWithApi(gear, apiClient);
        }

        await fs.writeGear(gear);
        const subdir = gear.kind === "bike" ? "bikes" : "shoes";
        const compStr =
          gear.kind === "bike" && gear.components ? ` + ${gear.components.length} comp` : "";
        console.log(
          `  ↳ ${subdir}/${gear.id}/gear.json — ${gear.brandName ?? ""} ${gear.modelName ?? gear.name ?? ""}${compStr}`,
        );
        processed++;
      } catch (err) {
        console.warn(`  ! ${ref.id} failed: ${(err as Error).message}`);
      }
    }
    console.log(`✓ ${processed}/${refs.length} gear item(s) backed up`);
  } finally {
    await auth.dispose();
  }
}

async function listGearViaHtml(
  cookieHeader: string,
): Promise<Array<{ id: string; kind: "bike" | "shoe" }>> {
  for (const path of GEAR_LIST_URLS) {
    try {
      const html = await fetchHtml(`${STRAVA_BASE_URL}${path}`, cookieHeader);
      const refs = parseGearListHtml(html);
      if (refs.length > 0) return refs;
    } catch {
      // try next URL
    }
  }
  throw new Error(
    `Could not extract gear list from any of: ${GEAR_LIST_URLS.join(", ")}. Either you have no gear configured, or Strava's settings page layout changed.`,
  );
}

async function enrichWithApi(gear: Gear, api: StravaApiClient): Promise<Gear> {
  try {
    const raw = await api.getGear(gear.id);
    const fromApi = normalizeGear(gear.id, raw);
    // Merge: API fills only fields that HTML didn't capture.
    const merged: Gear =
      gear.kind === "bike"
        ? mergeBike(gear, fromApi as Bike)
        : (mergeShoe(gear as Shoe, fromApi as Shoe) as Gear);
    return merged;
  } catch (err) {
    console.warn(`  ! API enrichment failed for ${gear.id}: ${(err as Error).message}`);
    return gear;
  }
}

function mergeBike(html: Bike, api: Bike): Bike {
  return {
    ...api,
    ...html, // HTML wins
    components: html.components ?? api.components,
    brandName: html.brandName ?? api.brandName,
    modelName: html.modelName ?? api.modelName,
    description: html.description ?? api.description,
    distanceMeters: html.distanceMeters ?? api.distanceMeters,
    frameType: html.frameType ?? api.frameType,
    name: html.name ?? api.name,
  };
}

function mergeShoe(html: Shoe, api: Shoe): Shoe {
  return {
    ...api,
    ...html,
    brandName: html.brandName ?? api.brandName,
    modelName: html.modelName ?? api.modelName,
    description: html.description ?? api.description,
    distanceMeters: html.distanceMeters ?? api.distanceMeters,
    name: html.name ?? api.name,
  };
}

async function fetchHtml(url: string, cookieHeader: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      cookie: cookieHeader,
      accept: "text/html,application/xhtml+xml",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on GET ${url}`);
  }
  return response.text();
}
