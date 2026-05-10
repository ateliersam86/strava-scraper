import {
  buildPhotosManifest,
  downloadActivityPhotos,
  parseActivityPage,
} from "@atelier/strava-scraper-core";
import { FilesystemAdapter } from "@atelier/strava-scraper-storage";
import { resolveAuth } from "../auth-resolver.ts";

const STRAVA_BASE_URL = "https://www.strava.com";

export type DownloadPhotosCommandOptions = {
  activityId: string;
  outDir: string;
  jwt?: string;
  statePath: string;
};

export async function downloadPhotosCommand(options: DownloadPhotosCommandOptions): Promise<void> {
  const auth = await resolveAuth(options);
  await auth.prepare();
  const cookies = auth.getCookies();
  const cookieHeader = `${"strava_remember_id"}=${cookies.strava_remember_id}; ${"strava_remember_token"}=${cookies.strava_remember_token}`;
  try {
    const fs = new FilesystemAdapter({ rootDir: options.outDir });

    console.log(`→ /activities/${options.activityId} (parse photos list)`);
    const html = await fetchHtml(
      `${STRAVA_BASE_URL}/activities/${options.activityId}`,
      cookieHeader,
    );
    const activity = parseActivityPage(html, options.activityId);
    const photos = activity.photos ?? [];
    if (photos.length === 0) {
      console.log("  ↳ no photos on this activity");
      return;
    }
    console.log(`  ↳ ${photos.length} photo(s) found`);

    const manifest = buildPhotosManifest(options.activityId, photos);
    await fs.writePhotosManifest(options.activityId, manifest);

    let downloaded = 0;
    for await (const item of downloadActivityPhotos(photos, {
      onError: (err: { photoId: number | string; message: string }) =>
        console.error(`  ✗ photo ${err.photoId}: ${err.message}`),
    })) {
      await fs.writeFile(options.activityId, `photos/${item.filename}`, item.body, {
        contentType: item.contentType,
      });
      downloaded++;
      console.log(`  ↳ photos/${item.filename}`);
    }
    console.log(`✓ ${downloaded}/${photos.length} photos saved`);
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
    throw new Error(`Failed to GET ${url}: HTTP ${response.status}`);
  }
  return response.text();
}
