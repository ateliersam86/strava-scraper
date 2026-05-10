/**
 * Photo download module.
 *
 * Strava serves activity photos from CloudFront with the activity ID
 * embedded in the URL but no auth requirement (CloudFront URLs are
 * public-but-unguessable). We grab the highest-resolution variant from
 * each {@link ActivityPhoto.urls} map and stream it to disk.
 *
 * Output: each photo is named `{photoId}.{ext}` where ext is inferred
 * from the response's `content-type` (defaults to `jpg`).
 */

import type { ActivityPhoto } from "../types/activity.ts";

export type PhotoDownloadOptions = {
  /** Custom fetch (tests / instrumentation). */
  fetch?: typeof fetch;
  /** Optional cookie header for authenticated photo URLs (rarely needed). */
  cookieHeader?: string;
  /** User agent override. */
  userAgent?: string;
};

export type DownloadedPhoto = {
  photo: ActivityPhoto;
  filename: string;
  contentType: string;
  body: ReadableStream<Uint8Array>;
};

/**
 * Photo metadata file written alongside the photos. Use it to rebuild a
 * gallery (with captions, GPS, capture timestamps) without re-fetching.
 */
export type PhotosManifest = {
  activityId: number | string;
  generatedAt: string;
  photos: Array<{
    id: number | string;
    filename: string;
    caption?: string;
    capturedAt?: string;
    location?: [number, number];
    sourceUrl: string;
  }>;
};

export class PhotoDownloadError extends Error {
  public readonly photoId: number | string;
  public readonly status: number | undefined;
  constructor(message: string, photoId: number | string, status?: number) {
    super(message);
    this.name = "PhotoDownloadError";
    this.photoId = photoId;
    if (status !== undefined) this.status = status;
  }
}

/**
 * Download a single photo. Returns its body as a stream so the caller can
 * pipe to disk / S3 / wherever.
 */
export async function downloadPhoto(
  photo: ActivityPhoto,
  options: PhotoDownloadOptions = {},
): Promise<DownloadedPhoto> {
  const fetchImpl = options.fetch ?? fetch;
  const headers: Record<string, string> = {
    "user-agent":
      options.userAgent ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  };
  if (options.cookieHeader) headers.cookie = options.cookieHeader;

  const response = await fetchImpl(photo.hdUrl, {
    method: "GET",
    redirect: "follow",
    headers,
  });

  if (response.status !== 200) {
    throw new PhotoDownloadError(
      `Photo ${photo.id} failed: HTTP ${response.status}`,
      photo.id,
      response.status,
    );
  }
  if (!response.body) {
    throw new PhotoDownloadError(`Photo ${photo.id} returned empty body`, photo.id);
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const filename = `${String(photo.id)}.${extensionForContentType(contentType)}`;

  return { photo, filename, contentType, body: response.body };
}

/**
 * Iterate over `photos` and yield a {@link DownloadedPhoto} per item. Errors
 * on individual photos are caught and reported via `onError` (default:
 * console.error) — one bad photo doesn't abort the whole batch.
 *
 * By default, photos with `source: "instagram"` are skipped — they're hosted
 * by Instagram, not Strava, and downloading them is a separate concern (auth,
 * rate limits, ToS). Pass `includeInstagram: true` if you want to attempt
 * downloads from CloudFront-cached Instagram URLs (success rate varies).
 */
export async function* downloadActivityPhotos(
  photos: readonly ActivityPhoto[],
  options: PhotoDownloadOptions & {
    onError?: (err: PhotoDownloadError) => void;
    includeInstagram?: boolean;
  } = {},
): AsyncGenerator<DownloadedPhoto> {
  const onError = options.onError ?? ((err) => console.error(err.message));
  const includeInstagram = options.includeInstagram ?? false;
  for (const photo of photos) {
    if (photo.source === "instagram" && !includeInstagram) {
      continue;
    }
    try {
      yield await downloadPhoto(photo, options);
    } catch (err) {
      if (err instanceof PhotoDownloadError) {
        onError(err);
      } else {
        throw err;
      }
    }
  }
}

/** Build a {@link PhotosManifest} from an activity's photo list. */
export function buildPhotosManifest(
  activityId: number | string,
  photos: readonly ActivityPhoto[],
): PhotosManifest {
  return {
    activityId,
    generatedAt: new Date().toISOString(),
    photos: photos.map((p) => {
      const ext = guessExtensionFromUrl(p.hdUrl) ?? "jpg";
      const entry: PhotosManifest["photos"][number] = {
        id: p.id,
        filename: `${String(p.id)}.${ext}`,
        sourceUrl: p.hdUrl,
      };
      if (p.caption) entry.caption = p.caption;
      if (p.capturedAt) entry.capturedAt = p.capturedAt;
      if (p.location) entry.location = [p.location[0], p.location[1]];
      return entry;
    }),
  };
}

function extensionForContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("heic")) return "heic";
  if (ct.includes("gif")) return "gif";
  return "bin";
}

function guessExtensionFromUrl(url: string): string | undefined {
  const match = url.match(/\.(jpe?g|png|webp|heic|gif)(?:\?.*)?$/i);
  return match?.[1]?.toLowerCase().replace("jpeg", "jpg");
}
