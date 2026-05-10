import { StravaApiClient, parseBikeComponentsHtml } from "@atelier/strava-scraper-core";
import { normalizeGear } from "@atelier/strava-scraper-core/api/gear";
import type { AthleteSummary, Gear } from "@atelier/strava-scraper-core/types/gear";
import { FilesystemAdapter } from "@atelier/strava-scraper-storage";
import { resolveAuth } from "../auth-resolver.ts";

const STRAVA_BASE_URL = "https://www.strava.com";

export type DownloadGearCommandOptions = {
  outDir: string;
  /** OAuth access token (env STRAVA_API_TOKEN or --api-token). Required for /api/v3/gear and /athlete. */
  apiToken?: string;
  /** JWT cookie for HTML-scraping bike components page. */
  jwt?: string;
  statePath: string;
  /** Skip components scraping (faster, API metadata only). */
  noComponents?: boolean;
};

export async function downloadGearCommand(options: DownloadGearCommandOptions): Promise<void> {
  const apiToken = options.apiToken ?? process.env["STRAVA_API_TOKEN"];
  if (!apiToken) {
    throw new Error(
      "Gear backup requires an OAuth access token (STRAVA_API_TOKEN or --api-token). " +
        "See docs/oauth.md to obtain one. The HTML scraper alone can't list your gear.",
    );
  }
  const api = new StravaApiClient({ accessToken: apiToken });

  const fs = new FilesystemAdapter({ rootDir: options.outDir });

  // 1. Get athlete summary → list of bike + shoe ids
  console.log("→ /api/v3/athlete");
  const athlete = (await api.getAthlete()) as AthleteSummary;
  const bikes = athlete.bikes ?? [];
  const shoes = athlete.shoes ?? [];
  console.log(`  ↳ ${bikes.length} bike(s), ${shoes.length} shoe(s)`);

  // 2. For each gear: GET /gear/{id} → metadata
  let processed = 0;
  for (const ref of [...bikes, ...shoes]) {
    if (!ref.id) continue;
    console.log(`→ /api/v3/gear/${ref.id}`);
    const raw = await api.getGear(ref.id);
    const gear: Gear = normalizeGear(ref.id, raw);

    // 3. For bikes: scrape /bikes/{id} for components if not skipped
    if (gear.kind === "bike" && !options.noComponents) {
      try {
        const components = await fetchBikeComponents(ref.id, options);
        if (components.length) gear.components = components;
        console.log(`  ↳ ${components.length} component(s)`);
      } catch (err) {
        console.warn(`  ! components scrape failed for ${ref.id}: ${(err as Error).message}`);
      }
    }

    await fs.writeGear(gear);
    const subdir = gear.kind === "bike" ? "bikes" : "shoes";
    console.log(`  ↳ saved ${subdir}/${gear.id}/gear.json`);
    processed++;
  }

  console.log(`✓ ${processed} gear item(s) backed up`);
}

async function fetchBikeComponents(
  bikeId: string,
  options: DownloadGearCommandOptions,
): Promise<ReturnType<typeof parseBikeComponentsHtml>> {
  if (!bikeId.startsWith("b")) return [];
  const auth = await resolveAuth(options);
  await auth.prepare();
  const cookies = auth.getCookies();
  const cookieHeader = `${"strava_remember_id"}=${cookies.strava_remember_id}; ${"strava_remember_token"}=${cookies.strava_remember_token}`;
  try {
    const url = `${STRAVA_BASE_URL}/bikes/${bikeId.slice(1)}`;
    const response = await fetch(url, {
      headers: {
        cookie: cookieHeader,
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    return parseBikeComponentsHtml(html);
  } finally {
    await auth.dispose();
  }
}
