import { type DataFormat, downloadActivity, parseActivityPage } from "@atelier/strava-scraper-core";
import { FilesystemAdapter } from "@atelier/strava-scraper-storage";
import { resolveAuth } from "../auth-resolver.ts";

const STRAVA_BASE_URL = "https://www.strava.com";

export type DownloadActivityCommandOptions = {
  activityId: string;
  format: DataFormat;
  outDir: string;
  jwt?: string;
  statePath: string;
  parsePage: boolean;
};

export async function downloadActivityCommand(
  options: DownloadActivityCommandOptions,
): Promise<void> {
  const auth = await resolveAuth(options);
  await auth.prepare();
  const cookies = auth.getCookies();
  const cookieHeader = `${"strava_remember_id"}=${cookies.strava_remember_id}; ${"strava_remember_token"}=${cookies.strava_remember_token}`;
  try {
    const fs = new FilesystemAdapter({ rootDir: options.outDir });

    // 1. Download the file (original / gpx / tcx)
    console.log(`→ /activities/${options.activityId}/export_${options.format}`);
    const file = await downloadActivity(options.activityId, {
      cookieHeader,
      format: options.format,
      jsonFallback: options.format === "original" ? "gpx" : undefined,
    });
    const ext = file.filename.split(".").pop() ?? "dat";
    const targetName =
      options.format === "original" ? `original.${ext}` : `${options.format}.${ext}`;
    await fs.writeFile(options.activityId, targetName, file.body, {
      contentType: file.contentType,
    });
    console.log(`  ↳ saved ${fs.activityDir(options.activityId)}/${targetName}`);

    // 2. Parse the activity page (unless --no-page-parse)
    if (options.parsePage) {
      console.log(`→ /activities/${options.activityId}`);
      const html = await fetchActivityHtml(options.activityId, cookieHeader);
      const activity = parseActivityPage(html, options.activityId);
      await fs.writeActivity(activity);
      console.log(`  ↳ parsed → ${fs.activityDir(options.activityId)}/activity.json`);
      console.log(
        `     name="${activity.name ?? "?"}" type=${activity.type ?? "?"} ` +
          `dist=${activity.stats?.distanceMeters ?? "?"}m photos=${activity.photos?.length ?? 0}`,
      );
    }
  } finally {
    await auth.dispose();
  }
}

async function fetchActivityHtml(activityId: string, cookieHeader: string): Promise<string> {
  const url = `${STRAVA_BASE_URL}/activities/${activityId}`;
  const response = await fetch(url, {
    headers: {
      cookie: cookieHeader,
      accept: "text/html,application/xhtml+xml",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to GET ${url}: HTTP ${response.status}`);
  }
  return response.text();
}
