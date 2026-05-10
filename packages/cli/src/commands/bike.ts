import { parseBikeComponentsHtml } from "@atelier/strava-scraper-core";
import { FilesystemAdapter } from "@atelier/strava-scraper-storage";
import { resolveAuth } from "../auth-resolver.ts";

const STRAVA_BASE_URL = "https://www.strava.com";

export type DownloadBikeCommandOptions = {
  bikeId: string;
  outDir: string;
  jwt?: string;
  statePath: string;
};

export async function downloadBikeCommand(options: DownloadBikeCommandOptions): Promise<void> {
  if (!options.bikeId.startsWith("b")) {
    throw new Error(`Bike id must start with 'b' (got: ${options.bikeId})`);
  }
  const numericId = options.bikeId.slice(1);

  const auth = await resolveAuth(options);
  await auth.prepare();
  const cookies = auth.getCookies();
  const cookieHeader = `${"strava_remember_id"}=${cookies.strava_remember_id}; ${"strava_remember_token"}=${cookies.strava_remember_token}`;
  try {
    const fs = new FilesystemAdapter({ rootDir: options.outDir });
    const url = `${STRAVA_BASE_URL}/bikes/${numericId}`;
    console.log(`→ ${url}`);
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
    const html = await response.text();
    const components = parseBikeComponentsHtml(html);
    await fs.writeBikeComponents(options.bikeId, components);
    console.log(
      `✓ ${components.length} component(s) saved → bikes/${options.bikeId}/components.json`,
    );
    for (const c of components) {
      const dist = (c.distanceMeters / 1000).toFixed(1);
      const removed = c.removed ? ` removed=${c.removed}` : "";
      console.log(`  - ${c.type} ${c.brand} ${c.model} ${dist}km${removed}`);
    }
  } finally {
    await auth.dispose();
  }
}
