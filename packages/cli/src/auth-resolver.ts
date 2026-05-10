/**
 * Resolve the auth strategy from CLI flags + env + filesystem.
 *
 * Order of precedence:
 * 1. `--jwt <value>` flag
 * 2. `STRAVA_JWT` env var
 * 3. `<statePath>` file → `PersistentContextAuth`
 * 4. Throw with a helpful message.
 */

import { stat } from "node:fs/promises";
import {
  type AuthStrategy,
  JwtCookieAuth,
  PersistentContextAuth,
} from "@atelier/strava-scraper-core";

export type AuthResolveOptions = {
  jwt?: string;
  statePath?: string;
};

export async function resolveAuth(options: AuthResolveOptions): Promise<AuthStrategy> {
  const explicitJwt = options.jwt ?? process.env["STRAVA_JWT"];
  if (explicitJwt) {
    return new JwtCookieAuth({ jwt: explicitJwt });
  }
  const statePath = options.statePath ?? ".auth/strava-storage-state.json";
  if (await fileExists(statePath)) {
    return new PersistentContextAuth({ storageStatePath: statePath, headedOnFirstRun: false });
  }
  throw new Error(
    `No auth available. Either:
  - Set STRAVA_JWT env var (or pass --jwt)
  - Or run \`strava-scraper auth login\` to save a Playwright session
  - Or pass --state <path> to point at an existing session file
Looked for state file at: ${statePath}`,
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
