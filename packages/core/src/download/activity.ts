/**
 * Activity file downloader.
 *
 * Strava exposes 3 file-format endpoints per activity:
 * - `/activities/{id}/export_original` — bytes of the file the athlete uploaded
 *   (FIT/TCX/GPX, depending on device). The ONLY format guaranteed to preserve
 *   per-point timestamps for non-Strava recorders. Some mobile uploads return
 *   JSON here — pass `jsonFallback` to coerce.
 * - `/activities/{id}/export_gpx` — Strava-converted GPX. No `<time>` tags.
 * - `/activities/{id}/export_tcx` — Strava-converted TCX. Includes timestamps.
 *
 * All endpoints require authenticated cookies and 302 to a signed S3 URL.
 *
 * Ported from `pR0Ps/stravaweblib.WebClient.get_activity_data`.
 */

import type { DataFormat } from "../types/enums.ts";

const STRAVA_BASE_URL = "https://www.strava.com";

export type ActivityFile = {
  /** Suggested filename from Content-Disposition, or `<id>.<ext>` fallback. */
  filename: string;
  /** Detected MIME type. */
  contentType: string;
  /** File bytes. */
  body: ReadableStream<Uint8Array>;
};

export type DownloadActivityOptions = {
  /** Cookie header (`a=1; b=2`) — must contain valid Strava session cookies. */
  cookieHeader: string;
  /** Format to request. Default: `original`. */
  format?: DataFormat;
  /**
   * If the original endpoint returns JSON (mobile uploads), retry with this
   * fallback format. Default: undefined (return the JSON).
   */
  jsonFallback?: Exclude<DataFormat, "original">;
  /** Custom fetch (for tests / instrumentation). */
  fetch?: typeof fetch;
  /** User agent override. */
  userAgent?: string;
};

export class StravaDownloadError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly url?: string,
  ) {
    super(message);
    this.name = "StravaDownloadError";
  }
}

/**
 * Download an activity file. Returns a streaming `ActivityFile`. The caller
 * is responsible for piping `body` to a destination.
 */
export async function downloadActivity(
  activityId: number | string,
  options: DownloadActivityOptions,
): Promise<ActivityFile> {
  const fetchImpl = options.fetch ?? fetch;
  const format = options.format ?? "original";
  const url = `${STRAVA_BASE_URL}/activities/${activityId}/export_${format}`;

  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "follow", // Strava 302s to S3-signed URLs; let fetch follow them
    headers: {
      cookie: options.cookieHeader,
      "user-agent":
        options.userAgent ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    },
  });

  if (response.status !== 200) {
    throw new StravaDownloadError(
      `Failed to download activity ${activityId} as ${format}: HTTP ${response.status}`,
      response.status,
      url,
    );
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  // Mobile-app uploads return JSON when `original` is requested. If the caller
  // gave a fallback format, retry with it; otherwise return the JSON as-is.
  if (
    options.jsonFallback &&
    format === "original" &&
    contentType.toLowerCase().startsWith("application/json")
  ) {
    // Drain the JSON response so we don't leak the connection.
    await response.body?.cancel();
    return downloadActivity(activityId, { ...options, format: options.jsonFallback });
  }

  if (!response.body) {
    throw new StravaDownloadError(`Empty body returned from ${url}`, response.status, url);
  }

  const filename = parseFilenameFromContentDisposition(
    response.headers.get("content-disposition"),
    activityId,
    format,
  );

  return {
    filename,
    contentType,
    body: response.body,
  };
}

/**
 * Pull the suggested filename out of a `Content-Disposition` header.
 *
 * Falls back to `<activityId>.<ext>` where `<ext>` is `dat` for `original`
 * (we don't yet know the extension) or the format itself otherwise. This
 * mirrors stravaweblib's `_make_export_file` heuristic exactly: Strava
 * always strips periods from filenames except the extension.
 */
export function parseFilenameFromContentDisposition(
  header: string | null,
  activityId: number | string,
  format: DataFormat,
): string {
  let filename: string | undefined;
  if (header) {
    // RFC 6266 — handle both `filename="x"` and `filename*=UTF-8''x`.
    const utf = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
    if (utf?.[1]) {
      try {
        filename = decodeURIComponent(utf[1].trim().replace(/^"|"$/g, ""));
      } catch {
        // ignore
      }
    }
    if (!filename) {
      const ascii = header.match(/filename="([^"]+)"/i) ?? header.match(/filename=([^;]+)/i);
      if (ascii?.[1]) filename = ascii[1].trim();
    }
  }

  if (!filename) {
    filename = String(activityId);
  }

  if (!filename.includes(".")) {
    const ext = format === "original" ? "dat" : format;
    filename = `${filename}.${ext}`;
  }
  return filename;
}
