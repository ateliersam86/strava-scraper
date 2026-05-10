import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fetchCsrf, parseCsrfFromHtml } from "../src/http/csrf.ts";
import { AuthError } from "../src/types/auth.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "fixtures", "about-page.html");

describe("parseCsrfFromHtml", () => {
  it("extracts param + token from valid HTML fixture", async () => {
    const html = await readFile(FIXTURE_PATH, "utf-8");
    const csrf = parseCsrfFromHtml(html);
    expect(csrf.param).toBe("authenticity_token");
    expect(csrf.token).toBe("abc123-fake-token-for-tests");
  });

  it("throws AuthError when meta tags are missing", () => {
    expect(() => parseCsrfFromHtml("<html><body>no meta</body></html>")).toThrow(AuthError);
  });
});

describe("fetchCsrf", () => {
  it("hits /about with cookies and parses the response", async () => {
    const html = await readFile(FIXTURE_PATH, "utf-8");
    const fakeFetch = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("/about");
      return new Response(html, { status: 200 });
    });
    const csrf = await fetchCsrf(
      "strava_remember_id=1; strava_remember_token=jwt",
      fakeFetch as unknown as typeof fetch,
    );
    expect(csrf.token).toBe("abc123-fake-token-for-tests");
  });

  it("rejects on non-2xx", async () => {
    const fakeFetch = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(fetchCsrf("", fakeFetch as unknown as typeof fetch)).rejects.toBeInstanceOf(
      AuthError,
    );
  });
});
