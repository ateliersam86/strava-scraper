import { describe, expect, it, vi } from "vitest";
import { RateLimitedError, StravaApiClient, StravaApiError } from "../src/api/client.ts";

function jsonResponse(data: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("StravaApiClient", () => {
  it("getAthlete sends Bearer token and returns parsed JSON", async () => {
    const seenHeaders: Record<string, string> = {};
    const fakeFetch = vi.fn(async (_url, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers?.["authorization"]) seenHeaders.auth = headers["authorization"];
      return jsonResponse({ id: 99, username: "sam" });
    });
    const client = new StravaApiClient({
      accessToken: "abc123",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    const me = await client.getAthlete();
    expect(me).toMatchObject({ id: 99, username: "sam" });
    expect(seenHeaders.auth).toBe("Bearer abc123");
  });

  it("getActivityStreams normalizes array response to StreamSet", async () => {
    // Strava returns an ARRAY of streams (verified against real API 2026-05-10)
    const fakeFetch = vi.fn(async (url) => {
      const u = new URL(String(url));
      expect(u.searchParams.get("keys")).toContain("time");
      expect(u.searchParams.get("key_by_type")).toBe("true");
      return jsonResponse([
        {
          type: "time",
          data: [0, 1, 2],
          original_size: 3,
          resolution: "high",
          series_type: "distance",
        },
        {
          type: "latlng",
          data: [
            [1, 2],
            [3, 4],
          ],
          original_size: 2,
          resolution: "high",
          series_type: "distance",
        },
      ]);
    });
    const client = new StravaApiClient({
      accessToken: "x",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    const streams = await client.getActivityStreams(123, ["time", "latlng"]);
    expect(streams.time?.data).toEqual([0, 1, 2]);
    expect(streams.latlng?.data).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("getActivityStreams also accepts already-keyed object (legacy shape)", async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse({
        time: {
          type: "time",
          data: [0, 1, 2],
          original_size: 3,
          resolution: "high",
          series_type: "distance",
        },
      }),
    );
    const client = new StravaApiClient({
      accessToken: "x",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    const streams = await client.getActivityStreams(123, ["time"]);
    expect(streams.time?.data).toEqual([0, 1, 2]);
  });

  it("listActivities serializes after/before/page/perPage", async () => {
    const fakeFetch = vi.fn(async (url) => {
      const u = new URL(String(url));
      expect(u.searchParams.get("after")).toBe("1700000000");
      expect(u.searchParams.get("per_page")).toBe("200");
      return jsonResponse([]);
    });
    const client = new StravaApiClient({
      accessToken: "x",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await client.listActivities({ after: 1_700_000_000, perPage: 200 });
  });

  it("throws RateLimitedError on 429 with retry-after", async () => {
    const fakeFetch = vi.fn(
      async () =>
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "60" },
        }),
    );
    const client = new StravaApiClient({
      accessToken: "x",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await expect(client.getAthlete()).rejects.toMatchObject({
      name: "RateLimitedError",
      retryAfterSeconds: 60,
    });
  });

  it("throws StravaApiError on non-2xx", async () => {
    const fakeFetch = vi.fn(async () => new Response("forbidden", { status: 403 }));
    const client = new StravaApiClient({
      accessToken: "x",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await expect(client.getAthlete()).rejects.toBeInstanceOf(StravaApiError);
  });

  it("updates lastRateLimit from response headers", async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse(
        { id: 1 },
        {
          "x-ratelimit-limit": "200,2000",
          "x-ratelimit-usage": "42,300",
        },
      ),
    );
    const client = new StravaApiClient({
      accessToken: "x",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await client.getAthlete();
    expect(client.lastRateLimit).toEqual({
      shortLimit: 200,
      longLimit: 2000,
      shortUsage: 42,
      longUsage: 300,
    });
  });
});
