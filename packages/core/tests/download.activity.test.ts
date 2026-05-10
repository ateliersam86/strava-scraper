import { describe, expect, it, vi } from "vitest";
import {
  StravaDownloadError,
  downloadActivity,
  parseFilenameFromContentDisposition,
} from "../src/download/activity.ts";

describe("parseFilenameFromContentDisposition", () => {
  it("extracts ASCII filename", () => {
    expect(
      parseFilenameFromContentDisposition('attachment; filename="ride.fit"', 1, "original"),
    ).toBe("ride.fit");
  });

  it("extracts RFC 5987 utf-8 filename*", () => {
    expect(
      parseFilenameFromContentDisposition(
        "attachment; filename*=UTF-8''ride%20%C3%A9.fit",
        1,
        "original",
      ),
    ).toBe("ride é.fit");
  });

  it("falls back to <id>.dat when no filename and format=original", () => {
    expect(parseFilenameFromContentDisposition(null, 42, "original")).toBe("42.dat");
  });

  it("falls back to <id>.<format> for gpx/tcx", () => {
    expect(parseFilenameFromContentDisposition(null, 42, "gpx")).toBe("42.gpx");
    expect(parseFilenameFromContentDisposition(null, 42, "tcx")).toBe("42.tcx");
  });

  it("appends extension when filename has no period", () => {
    expect(parseFilenameFromContentDisposition('attachment; filename="ride"', 42, "gpx")).toBe(
      "ride.gpx",
    );
  });
});

describe("downloadActivity", () => {
  it("hits the export_<format> endpoint with cookies", async () => {
    const fakeFetch = vi.fn(async (url: string | URL) => {
      expect(String(url)).toMatch(/\/activities\/123\/export_gpx$/);
      return new Response("<gpx/>", {
        status: 200,
        headers: {
          "content-type": "application/gpx+xml",
          "content-disposition": 'attachment; filename="ride.gpx"',
        },
      });
    });
    const file = await downloadActivity(123, {
      cookieHeader: "strava_remember_id=1; strava_remember_token=jwt",
      format: "gpx",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(file.filename).toBe("ride.gpx");
    expect(file.contentType).toContain("gpx");
    expect(fakeFetch).toHaveBeenCalledOnce();
  });

  it("retries with jsonFallback when original returns JSON", async () => {
    const fakeFetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith("export_original")) {
        return new Response(JSON.stringify({ legacy: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("<gpx/>", {
        status: 200,
        headers: {
          "content-type": "application/gpx+xml",
          "content-disposition": 'attachment; filename="ride.gpx"',
        },
      });
    });
    const file = await downloadActivity(123, {
      cookieHeader: "ck",
      format: "original",
      jsonFallback: "gpx",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(file.filename).toBe("ride.gpx");
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it("throws StravaDownloadError on non-200", async () => {
    const fakeFetch = vi.fn(async () => new Response(null, { status: 404 }));
    await expect(
      downloadActivity(123, { cookieHeader: "ck", fetch: fakeFetch as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(StravaDownloadError);
  });
});
