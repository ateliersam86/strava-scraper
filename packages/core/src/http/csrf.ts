import * as cheerio from "cheerio";
import { AuthError, type StravaCsrf } from "../types/auth.ts";

const STRAVA_BASE_URL = "https://www.strava.com";

/**
 * Fetch the CSRF token Strava embeds in the `<meta>` tags on the about page.
 *
 * Strava embeds CSRF tokens that change per session. We use them when POSTing
 * to mutation endpoints (delete activity, update gear, etc.). The about page
 * is small, public, and never redirects based on auth state — making it a
 * cheap and reliable source for the token.
 */
export async function fetchCsrf(
  cookieHeader: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StravaCsrf> {
  const response = await fetchImpl(`${STRAVA_BASE_URL}/about`, {
    method: "GET",
    headers: {
      cookie: cookieHeader,
      accept: "text/html",
    },
  });
  if (!response.ok) {
    throw new AuthError(`Failed to fetch /about for CSRF: HTTP ${response.status}`);
  }
  const html = await response.text();
  return parseCsrfFromHtml(html);
}

export function parseCsrfFromHtml(html: string): StravaCsrf {
  const $ = cheerio.load(html);
  const param = $('meta[name="csrf-param"]').attr("content");
  const token = $('meta[name="csrf-token"]').attr("content");
  if (!param || !token) {
    throw new AuthError(
      "Could not find <meta name='csrf-param'> or <meta name='csrf-token'> in HTML",
    );
  }
  return { param, token };
}
