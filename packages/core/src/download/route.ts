/**
 * Route file downloader. `/routes/{id}/export_{gpx,tcx}`.
 * Routes don't have an "original" file — Strava generates them server-side.
 *
 * Ported from `pR0Ps/stravaweblib.WebClient.get_route_data`.
 */

import type { DataFormat } from "../types/enums.ts";
import {
  type ActivityFile,
  type DownloadActivityOptions,
  StravaDownloadError,
  parseFilenameFromContentDisposition,
} from "./activity.ts";

const STRAVA_BASE_URL = "https://www.strava.com";

export type DownloadRouteOptions = Omit<DownloadActivityOptions, "format" | "jsonFallback"> & {
  /** `gpx` or `tcx`. `original` is coerced to `gpx` (no original for routes). */
  format?: Exclude<DataFormat, "original"> | "original";
};

export async function downloadRoute(
  routeId: number | string,
  options: DownloadRouteOptions,
): Promise<ActivityFile> {
  const fetchImpl = options.fetch ?? fetch;
  const requested = options.format ?? "gpx";
  const format: Exclude<DataFormat, "original"> = requested === "original" ? "gpx" : requested;

  const url = `${STRAVA_BASE_URL}/routes/${routeId}/export_${format}`;
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      cookie: options.cookieHeader,
      "user-agent":
        options.userAgent ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    },
  });

  if (response.status !== 200) {
    throw new StravaDownloadError(
      `Failed to download route ${routeId} as ${format}: HTTP ${response.status}`,
      response.status,
      url,
    );
  }
  if (!response.body) {
    throw new StravaDownloadError(`Empty body returned from ${url}`, response.status, url);
  }

  return {
    filename: parseFilenameFromContentDisposition(
      response.headers.get("content-disposition"),
      routeId,
      format,
    ),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    body: response.body,
  };
}
