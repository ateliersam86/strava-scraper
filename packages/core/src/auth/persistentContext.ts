/**
 * Playwright-based persistent context auth.
 *
 * On first run, opens a Chromium window and lets the user log in manually
 * (handles 2FA without code). The browser context is saved to disk via
 * `storageState`, so subsequent runs are headless and use the saved session.
 *
 * Survives much longer than a JWT (until Strava forcibly invalidates the
 * session). Recommended for long-lived cron jobs and dev work.
 */

import { AuthError, LoginFailedError, type StravaSessionCookies } from "../types/auth.ts";
import type { AuthStrategy } from "./strategy.ts";

const STRAVA_LOGIN_URL = "https://www.strava.com/login";
const STRAVA_DASHBOARD_URL = "https://www.strava.com/dashboard";

export type PersistentContextAuthOptions = {
  /**
   * Filesystem path where the Playwright `storageState` JSON is read/written.
   * Default: `./.auth/strava-storage-state.json`.
   */
  storageStatePath?: string;
  /**
   * Force a re-login even if the storage state file exists.
   */
  forceLogin?: boolean;
  /**
   * Time to wait (ms) for the user to complete the login before timing out.
   * Default: 5 minutes.
   */
  loginTimeoutMs?: number;
  /**
   * Run the browser headless on first use. Default: `false` (login UI must be
   * visible). Subsequent runs always run headless.
   */
  headedOnFirstRun?: boolean;
  /**
   * Custom user-agent.
   */
  userAgent?: string;
};

/**
 * Lightweight Playwright wrapper. We purposely don't statically import
 * `playwright` — it's a heavy peer dependency, and we want users who only
 * use {@link JwtCookieAuth} to skip installing it. The dynamic import only
 * runs when this strategy is actually instantiated.
 */
export class PersistentContextAuth implements AuthStrategy {
  private readonly options: Required<PersistentContextAuthOptions>;
  private athleteId: string | null = null;
  private cookies: StravaSessionCookies | null = null;

  // Held only between prepare() and dispose(); typed loosely to avoid a hard
  // playwright dependency in the type graph.
  private browser: { close: () => Promise<void> } | null = null;

  constructor(options: PersistentContextAuthOptions = {}) {
    this.options = {
      storageStatePath: options.storageStatePath ?? "./.auth/strava-storage-state.json",
      forceLogin: options.forceLogin ?? false,
      loginTimeoutMs: options.loginTimeoutMs ?? 5 * 60_000,
      headedOnFirstRun: options.headedOnFirstRun ?? true,
      userAgent:
        options.userAgent ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    };
  }

  async prepare(): Promise<void> {
    const { chromium } = await import("playwright");

    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const stateDir = path.dirname(this.options.storageStatePath);
    await fs.mkdir(stateDir, { recursive: true });

    const storageStateExists =
      !this.options.forceLogin && (await fileExists(this.options.storageStatePath));

    const launchOptions = { headless: !this.options.headedOnFirstRun || storageStateExists };
    this.browser = await chromium.launch(launchOptions);

    const contextOptions: Record<string, unknown> = {
      userAgent: this.options.userAgent,
    };
    if (storageStateExists) {
      contextOptions.storageState = this.options.storageStatePath;
    }

    // biome-ignore lint/suspicious/noExplicitAny: playwright BrowserContext is typed at runtime
    const context: any = await (this.browser as any).newContext(contextOptions);
    const page = await context.newPage();

    // Sanity check: if existing state is valid, the dashboard renders.
    // If not, fall through to interactive login.
    let needsLogin = !storageStateExists;
    if (storageStateExists) {
      await page.goto(STRAVA_DASHBOARD_URL, { waitUntil: "domcontentloaded" });
      if (page.url().includes("/login")) {
        needsLogin = true;
      }
    }

    if (needsLogin) {
      if (!this.options.headedOnFirstRun) {
        await context.close();
        await this.browser.close();
        this.browser = null;
        throw new LoginFailedError(
          "No saved session and headedOnFirstRun is false — cannot prompt user for login",
        );
      }
      await page.goto(STRAVA_LOGIN_URL, { waitUntil: "domcontentloaded" });
      // Wait for the user to navigate away from /login (i.e., complete the form + 2FA)
      try {
        await page.waitForURL((url: URL) => !url.pathname.startsWith("/login"), {
          timeout: this.options.loginTimeoutMs,
        });
      } catch (err) {
        await context.close();
        await this.browser.close();
        this.browser = null;
        throw new LoginFailedError(
          `Login did not complete within ${this.options.loginTimeoutMs}ms`,
          err,
        );
      }
      await context.storageState({ path: this.options.storageStatePath });
    }

    // Pull the cookies we need.
    const cookies = (await context.cookies("https://www.strava.com")) as Array<{
      name: string;
      value: string;
    }>;
    const find = (name: string): string | undefined => cookies.find((c) => c.name === name)?.value;
    const remember_id = find("strava_remember_id");
    const remember_token = find("strava_remember_token");

    if (!remember_id || !remember_token) {
      await context.close();
      await this.browser.close();
      this.browser = null;
      throw new AuthError(
        "Could not extract strava_remember_id / strava_remember_token after login",
      );
    }

    this.athleteId = remember_id;
    this.cookies = {
      strava_remember_id: remember_id,
      strava_remember_token: remember_token,
    };

    await context.close();
  }

  getCookies(): StravaSessionCookies {
    if (!this.cookies) {
      throw new AuthError("Call prepare() before getCookies()");
    }
    return this.cookies;
  }

  getAthleteId(): string {
    if (!this.athleteId) {
      throw new AuthError("Call prepare() before getAthleteId()");
    }
    return this.athleteId;
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

async function fileExists(path: string): Promise<boolean> {
  const fs = await import("node:fs/promises");
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
