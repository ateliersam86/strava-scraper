import type { StravaSessionCookies } from "../types/auth.ts";

/**
 * An authentication strategy provides Strava session cookies on demand.
 *
 * Implementations:
 * - {@link JwtCookieAuth} — caller supplies a `strava_remember_token` JWT (e.g. read
 *   from a logged-in browser). Cheap, but expires every ~14 days.
 * - {@link PersistentContextAuth} — Playwright opens a Chrome window for manual
 *   login on first run; the storage state file persists indefinitely. Survives 2FA.
 *
 * Strategies are stateful and validate the session on `prepare()`; subsequent
 * calls to `getCookies()` should return the cached pair without hitting Strava.
 */
export interface AuthStrategy {
  /**
   * Validate / refresh the auth credentials. Idempotent — safe to call multiple
   * times. Should throw an `AuthError` (or subclass) if the strategy cannot
   * produce a working session.
   */
  prepare(): Promise<void>;

  /**
   * Return the current session cookies. Must only be called after `prepare()`
   * has succeeded.
   */
  getCookies(): StravaSessionCookies;

  /**
   * Athlete id extracted from the cookies (numeric Strava ID).
   * Available after `prepare()`.
   */
  getAthleteId(): string;

  /**
   * Best-effort cleanup (close Playwright browsers, etc.). Idempotent.
   */
  dispose(): Promise<void>;
}
