import { stat } from "node:fs/promises";
import {
  JwtCookieAuth,
  JwtExpiredError,
  PersistentContextAuth,
  decodeJwtPayload,
} from "@atelier/strava-scraper-core";

export async function authLogin(options: { statePath: string; force: boolean }): Promise<void> {
  const auth = new PersistentContextAuth({
    storageStatePath: options.statePath,
    forceLogin: options.force,
    headedOnFirstRun: true,
  });
  console.log(`Opening Chrome for interactive login. Storage state → ${options.statePath}`);
  try {
    await auth.prepare();
    console.log(`✓ Logged in as athlete ${auth.getAthleteId()}`);
  } finally {
    await auth.dispose();
  }
}

export async function authStatus(options: { jwt?: string; statePath: string }): Promise<void> {
  const jwt = options.jwt ?? process.env["STRAVA_JWT"];
  if (jwt) {
    try {
      const payload = decodeJwtPayload(jwt);
      const expiresAt = new Date(payload.exp * 1000);
      const remainingMs = expiresAt.getTime() - Date.now();
      const remainingDays = Math.round(remainingMs / 86_400_000);
      console.log("Auth: JWT");
      console.log(`Athlete: ${payload.sub}`);
      console.log(`Expires: ${expiresAt.toISOString()} (${remainingDays} days remaining)`);
      // Round-trip a /me check for completeness
      const auth = new JwtCookieAuth({ jwt });
      try {
        await auth.prepare();
        console.log("Server validation: ✓ accepted by /me");
      } catch (err: unknown) {
        if (err instanceof JwtExpiredError) {
          console.log(`Server validation: ✗ expired (${err.expiredAt.toISOString()})`);
        } else {
          console.log(`Server validation: ✗ ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return;
    } catch (err) {
      console.error(`JWT failed to decode: ${(err as Error).message}`);
      process.exitCode = 2;
      return;
    }
  }

  if (await fileExists(options.statePath)) {
    console.log(`Auth: Playwright session at ${options.statePath}`);
    console.log("Run any command — the session will be reused.");
    return;
  }

  console.log("Auth: NONE");
  console.log("Hint: run `strava-scraper auth login` to start a session, or set STRAVA_JWT.");
  process.exitCode = 2;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
