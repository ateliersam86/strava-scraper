/**
 * `strava-scraper athlete <id>` — scrape any athlete's public profile.
 *
 * Default: profile metadata + activity ID list.
 * --activities: also batch-download each activity (file + page parse).
 * --photos:     also fetch HD photos for each activity.
 * --limit N:    cap how many activities to download (most-recent first).
 *
 * The viewer (logged-in cookie) needs follow access OR the target's profile
 * must be public for non-self athletes. For the user's own ID, everything
 * is accessible.
 */

import {
  downloadActivity,
  parseActivityPage,
  parseAthleteProfileHtml,
} from "@atelier/strava-scraper-core";
import { FilesystemAdapter } from "@atelier/strava-scraper-storage";
import { resolveAuth } from "../auth-resolver.ts";

const STRAVA_BASE_URL = "https://www.strava.com";

export type AthleteCommandOptions = {
  athleteId: string;
  outDir: string;
  jwt?: string;
  statePath: string;
  /** If true, also download each recent activity (file + parse). */
  downloadActivities: boolean;
  /** Cap on activities downloaded (most-recent first). 0 = no cap. */
  limit: number;
};

export async function downloadAthleteCommand(options: AthleteCommandOptions): Promise<void> {
  const auth = await resolveAuth(options);
  await auth.prepare();
  const cookies = auth.getCookies();
  const cookieHeader = `${"strava_remember_id"}=${cookies.strava_remember_id}; ${"strava_remember_token"}=${cookies.strava_remember_token}`;

  try {
    const fs = new FilesystemAdapter({ rootDir: options.outDir });
    const profileUrl = `${STRAVA_BASE_URL}/athletes/${options.athleteId}`;

    console.log(`→ ${profileUrl}`);
    const html = await fetchHtml(profileUrl, cookieHeader);
    const profile = parseAthleteProfileHtml(html, options.athleteId);

    // Save profile JSON to <out>/athletes/{id}/profile.json
    const profileJsonPath = `athletes/${options.athleteId}/profile.json`;
    await writeJson(options.outDir, profileJsonPath, profile);
    console.log(
      `  ↳ saved ${profileJsonPath} — name="${profile.name ?? "?"}", ` +
        `${profile.recentActivityIds.length} activity id(s), ` +
        `${profile.recentActivities.length} with extended metadata, ` +
        `${profile.recentPhotos?.length ?? 0} photos`,
    );

    if (!options.downloadActivities) {
      console.log("(use --activities to also download each activity)");
      return;
    }

    const total =
      options.limit > 0
        ? Math.min(options.limit, profile.recentActivityIds.length)
        : profile.recentActivityIds.length;
    console.log(`\n→ Downloading ${total}/${profile.recentActivityIds.length} activities`);

    let success = 0;
    let failed = 0;
    for (let i = 0; i < total; i++) {
      const aid = profile.recentActivityIds[i];
      if (!aid) continue;
      try {
        // 1. original file (FIT/TCX/GPX)
        const file = await downloadActivity(aid, {
          cookieHeader,
          format: "original",
          jsonFallback: "gpx",
        });
        const ext = file.filename.split(".").pop() ?? "dat";
        await fs.writeFile(aid, `original.${ext}`, file.body, { contentType: file.contentType });

        // 2. page HTML → parsed Activity
        const ahtml = await fetchHtml(`${STRAVA_BASE_URL}/activities/${aid}`, cookieHeader);
        const activity = parseActivityPage(ahtml, aid);
        await fs.writeActivity(activity);

        success++;
        console.log(
          `  [${(i + 1).toString().padStart(3)}/${total}] ${aid} ✓ "${activity.name ?? "?"}" (kudos=${activity.kudosCount ?? "?"}, photos=${activity.photos?.length ?? 0})`,
        );
      } catch (err) {
        failed++;
        console.warn(`  [${i + 1}/${total}] ${aid} ✗ ${(err as Error).message}`);
      }
    }
    console.log(`\n✓ ${success} succeeded, ${failed} failed`);
  } finally {
    await auth.dispose();
  }
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

async function writeJson(outDir: string, relPath: string, value: unknown): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const target = path.resolve(outDir, relPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}
