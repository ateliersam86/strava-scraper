import { describe, expect, it, vi } from "vitest";
import {
  PhotoDownloadError,
  buildPhotosManifest,
  downloadActivityPhotos,
  downloadPhoto,
} from "../src/download/photos.ts";
import type { ActivityPhoto } from "../src/types/activity.ts";

const PHOTO_A: ActivityPhoto = {
  id: 9001,
  caption: "Sunrise",
  capturedAt: "2026-05-08T08:00:00Z",
  hdUrl: "https://cdn.example/photos/9001.jpg",
};

const PHOTO_B: ActivityPhoto = {
  id: 9002,
  hdUrl: "https://cdn.example/photos/9002.png",
};

function imageResponse(contentType = "image/jpeg"): Response {
  return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

describe("downloadPhoto", () => {
  it("fetches the hdUrl and infers extension from content-type", async () => {
    const fakeFetch = vi.fn(async (url) => {
      expect(String(url)).toBe(PHOTO_A.hdUrl);
      return imageResponse("image/jpeg");
    });
    const result = await downloadPhoto(PHOTO_A, {
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(result.filename).toBe("9001.jpg");
    expect(result.contentType).toBe("image/jpeg");
  });

  it("infers png extension from content-type", async () => {
    const fakeFetch = vi.fn(async () => imageResponse("image/png"));
    const result = await downloadPhoto(PHOTO_B, {
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(result.filename).toBe("9002.png");
  });

  it("throws PhotoDownloadError on non-200", async () => {
    const fakeFetch = vi.fn(async () => new Response(null, { status: 404 }));
    await expect(
      downloadPhoto(PHOTO_A, { fetch: fakeFetch as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(PhotoDownloadError);
  });
});

describe("downloadActivityPhotos", () => {
  it("yields each photo and continues past failures", async () => {
    const fakeFetch = vi.fn(async (url) => {
      if (String(url).includes("9002")) {
        return new Response(null, { status: 404 });
      }
      return imageResponse();
    });
    const errors: PhotoDownloadError[] = [];
    const downloaded: string[] = [];
    for await (const item of downloadActivityPhotos([PHOTO_A, PHOTO_B], {
      fetch: fakeFetch as unknown as typeof fetch,
      onError: (e) => errors.push(e),
    })) {
      downloaded.push(item.filename);
      // Drain the body so streams aren't dangling.
      await item.body.cancel();
    }
    expect(downloaded).toEqual(["9001.jpg"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.photoId).toBe(9002);
  });
});

describe("buildPhotosManifest", () => {
  it("builds a JSON-serializable manifest with capturedAt + location preserved", () => {
    const manifest = buildPhotosManifest("123", [{ ...PHOTO_A, location: [45.5, 1.6] }, PHOTO_B]);
    expect(manifest.activityId).toBe("123");
    expect(manifest.photos).toHaveLength(2);
    expect(manifest.photos[0]).toMatchObject({
      id: 9001,
      filename: "9001.jpg",
      caption: "Sunrise",
      capturedAt: "2026-05-08T08:00:00Z",
      location: [45.5, 1.6],
    });
    // PHOTO_B has no caption/captured/location → those keys should be absent
    expect(manifest.photos[1]).toEqual({
      id: 9002,
      filename: "9002.png",
      sourceUrl: "https://cdn.example/photos/9002.png",
    });
  });
});
