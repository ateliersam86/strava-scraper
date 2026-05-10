/**
 * JWT-cookie auth strategy.
 *
 * The user logs in to strava.com in any browser, copies the
 * `strava_remember_token` cookie value (a JWT), and passes it to this
 * strategy. We validate the JWT locally (no network round-trip), then
 * confirm against Strava once via GET `/me` (which redirects to
 * `/athletes/{id}` when authenticated).
 *
 * Ported from `pR0Ps/stravaweblib._login_with_jwt` (MPL-2.0). Differences:
 * - TypeScript with strict types
 * - Returns the cookie pair instead of mutating a session
 * - Distinguishes `JwtExpiredError` from generic `LoginFailedError`
 */

import {
  AuthError,
  JwtExpiredError,
  LoginFailedError,
  type StravaJwtPayload,
  type StravaSessionCookies,
} from "../types/auth.ts";
import type { AuthStrategy } from "./strategy.ts";

const STRAVA_BASE_URL = "https://www.strava.com";

/** Decode the payload of a JWT without verifying its signature. */
export function decodeJwtPayload(jwt: string): StravaJwtPayload {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new AuthError("Invalid JWT structure: expected 3 dot-separated parts");
  }
  const payloadSegment = parts[1];
  if (!payloadSegment) {
    throw new AuthError("Invalid JWT: empty payload segment");
  }
  // base64url → base64
  const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
  // Pad to 4-char alignment
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let json: string;
  try {
    json = atob(padded);
  } catch (err) {
    throw new AuthError("Failed to base64-decode JWT payload", err);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch (err) {
    throw new AuthError("Failed to JSON-parse JWT payload", err);
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("sub" in payload) ||
    !("exp" in payload)
  ) {
    throw new AuthError("JWT payload missing required fields (sub, exp)");
  }
  return payload as StravaJwtPayload;
}

export type JwtCookieAuthOptions = {
  /** The `strava_remember_token` JWT value (no `=` prefix, no quotes). */
  jwt: string;
  /**
   * Skip the `/me` round-trip after decoding the JWT. Faster, but won't catch
   * a server-side revoked session. Defaults to `false`.
   */
  skipServerValidation?: boolean;
  /**
   * Custom fetch implementation. Defaults to global `fetch`. Useful for tests
   * or to inject rate-limit / retry middleware.
   */
  fetch?: typeof fetch;
};

export class JwtCookieAuth implements AuthStrategy {
  private readonly jwt: string;
  private readonly skipServerValidation: boolean;
  private readonly fetchImpl: typeof fetch;
  private athleteId: string | null = null;
  private prepared = false;

  constructor(options: JwtCookieAuthOptions) {
    if (!options.jwt || typeof options.jwt !== "string") {
      throw new AuthError("JwtCookieAuth requires a non-empty `jwt` string");
    }
    this.jwt = options.jwt.trim();
    this.skipServerValidation = options.skipServerValidation ?? false;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async prepare(): Promise<void> {
    if (this.prepared) return;

    const payload = decodeJwtPayload(this.jwt);
    const expiryDate = new Date(payload.exp * 1000);
    if (payload.exp * 1000 < Date.now()) {
      throw new JwtExpiredError(expiryDate);
    }

    this.athleteId = String(payload.sub);

    if (!this.skipServerValidation) {
      await this.validateAgainstStrava();
    }

    this.prepared = true;
  }

  getCookies(): StravaSessionCookies {
    if (!this.athleteId) {
      throw new AuthError("Call prepare() before getCookies()");
    }
    return {
      strava_remember_id: this.athleteId,
      strava_remember_token: this.jwt,
    };
  }

  getAthleteId(): string {
    if (!this.athleteId) {
      throw new AuthError("Call prepare() before getAthleteId()");
    }
    return this.athleteId;
  }

  async dispose(): Promise<void> {
    // No resources to clean up — pure stateless cookie pair.
  }

  /** Validate the cookie by hitting `/me` and checking the redirect target. */
  private async validateAgainstStrava(): Promise<void> {
    if (!this.athleteId) {
      // Should be set by prepare() before calling this.
      throw new AuthError("Internal: athleteId unset during validation");
    }
    const cookieHeader = serializeCookies({
      strava_remember_id: this.athleteId,
      strava_remember_token: this.jwt,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(`${STRAVA_BASE_URL}/me`, {
        method: "GET",
        redirect: "manual",
        headers: {
          cookie: cookieHeader,
          "user-agent": defaultUserAgent(),
        },
      });
    } catch (err) {
      throw new LoginFailedError("Network error during /me validation", err);
    }

    if (response.status < 300 || response.status >= 400) {
      throw new LoginFailedError(
        `Expected redirect from /me, got HTTP ${response.status}. JWT may be invalid.`,
      );
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new LoginFailedError("No Location header on /me redirect");
    }

    // Strava redirects /me → /athletes/{id} when authenticated, /login otherwise.
    if (location.endsWith("/login") || location.includes("/login?")) {
      throw new LoginFailedError(
        "Redirected to /login — JWT was rejected by Strava (likely revoked or expired server-side)",
      );
    }
    if (!location.endsWith(`/${this.athleteId}`)) {
      throw new LoginFailedError(
        `/me redirected to '${location}' but expected suffix '/${this.athleteId}'. Cookie may belong to a different athlete.`,
      );
    }
  }
}

function serializeCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function defaultUserAgent(): string {
  return (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15"
  );
}
