import { describe, expect, it, vi } from "vitest";
import { downloadActivityPhotos } from "../src/download/photos.ts";
import { parseActivityPage } from "../src/parse/activity.ts";
import type { ActivityPhoto } from "../src/types/activity.ts";

const HTML_WITH_INSTAGRAM = `<!DOCTYPE html>
<html><body><script>
window.__INITIAL_STATE__ = {
  "activity": {
    "id": 1,
    "start_date": "2026-05-01T08:00:00Z",
    "photos": {
      "all": [
        {"id": 100, "source": 1, "urls": {"2048": "https://cdn.example/100.jpg"}},
        {"id": 200, "source": 2, "urls": {"2048": "https://insta.example/200.jpg"}}
      ]
    }
  }
};
</script></body></html>
`;

describe("parseActivityPage — photo source field", () => {
  it("tags photos with source 'strava' or 'instagram'", () => {
    const a = parseActivityPage(HTML_WITH_INSTAGRAM, 1);
    expect(a.photos).toHaveLength(2);
    expect(a.photos?.[0]?.source).toBe("strava");
    expect(a.photos?.[1]?.source).toBe("instagram");
  });
});

describe("downloadActivityPhotos — Instagram filtering", () => {
  const photos: ActivityPhoto[] = [
    { id: 1, hdUrl: "https://cdn.example/1.jpg", source: "strava" },
    { id: 2, hdUrl: "https://insta.example/2.jpg", source: "instagram" },
    { id: 3, hdUrl: "https://cdn.example/3.jpg", source: "strava" },
  ];

  it("skips Instagram photos by default", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
    );
    const downloaded: number[] = [];
    for await (const item of downloadActivityPhotos(photos, {
      fetch: fakeFetch as unknown as typeof fetch,
    })) {
      downloaded.push(Number(item.photo.id));
      await item.body.cancel();
    }
    expect(downloaded).toEqual([1, 3]);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it("includes Instagram when explicitly opted in", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
    );
    const downloaded: number[] = [];
    for await (const item of downloadActivityPhotos(photos, {
      fetch: fakeFetch as unknown as typeof fetch,
      includeInstagram: true,
    })) {
      downloaded.push(Number(item.photo.id));
      await item.body.cancel();
    }
    expect(downloaded).toEqual([1, 2, 3]);
  });
});
