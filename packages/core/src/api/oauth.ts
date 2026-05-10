/**
 * Strava OAuth 2.0 helpers.
 *
 * Strava uses standard OAuth with `authorization_code` and `refresh_token`
 * grants. Tokens have a 6-hour lifetime; refresh tokens are long-lived but
 * single-use (each refresh returns a new refresh token).
 *
 * https://developers.strava.com/docs/authentication/
 */

const STRAVA_OAUTH_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_OAUTH_TOKEN_URL = "https://www.strava.com/oauth/token";

export type StravaScope =
  | "read"
  | "read_all"
  | "profile:read_all"
  | "profile:write"
  | "activity:read"
  | "activity:read_all"
  | "activity:write";

export type AuthorizeUrlOptions = {
  clientId: string;
  redirectUri: string;
  scopes: readonly StravaScope[];
  /** Approval prompt: "auto" (default — only ask if not already approved) or "force". */
  approvalPrompt?: "auto" | "force";
  /** Optional CSRF state. */
  state?: string;
};

/** Build the URL the user redirects to during the OAuth dance. */
export function buildAuthorizeUrl(options: AuthorizeUrlOptions): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    approval_prompt: options.approvalPrompt ?? "auto",
    scope: options.scopes.join(","),
  });
  if (options.state) params.set("state", options.state);
  return `${STRAVA_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export type OAuthTokenResponse = {
  /** OAuth access token. Strava returns it lowercased "Bearer". */
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  expires_in: number; // seconds from now
  token_type: "Bearer";
  athlete?: { id: number; username: string | null };
};

export type ExchangeCodeOptions = {
  clientId: string;
  clientSecret: string;
  code: string;
  fetch?: typeof fetch;
};

export class OAuthError extends Error {
  public readonly status: number | undefined;
  public readonly body: string | undefined;
  constructor(message: string, status?: number, body?: string) {
    super(message);
    this.name = "OAuthError";
    if (status !== undefined) this.status = status;
    if (body !== undefined) this.body = body;
  }
}

/** Exchange the temporary `code` for an access+refresh token pair. */
export async function exchangeCodeForToken(
  options: ExchangeCodeOptions,
): Promise<OAuthTokenResponse> {
  return postToken(
    {
      client_id: options.clientId,
      client_secret: options.clientSecret,
      code: options.code,
      grant_type: "authorization_code",
    },
    options.fetch ?? fetch,
  );
}

export type RefreshOptions = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetch?: typeof fetch;
};

/** Refresh an access token using a refresh token. */
export async function refreshAccessToken(options: RefreshOptions): Promise<OAuthTokenResponse> {
  return postToken(
    {
      client_id: options.clientId,
      client_secret: options.clientSecret,
      refresh_token: options.refreshToken,
      grant_type: "refresh_token",
    },
    options.fetch ?? fetch,
  );
}

async function postToken(
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<OAuthTokenResponse> {
  const params = new URLSearchParams(body);
  const response = await fetchImpl(STRAVA_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new OAuthError(`OAuth /token returned HTTP ${response.status}`, response.status, text);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new OAuthError("OAuth /token response was not valid JSON", response.status, text);
  }
  if (!isOAuthTokenResponse(parsed)) {
    throw new OAuthError("OAuth /token response missing required fields", response.status, text);
  }
  return parsed;
}

function isOAuthTokenResponse(v: unknown): v is OAuthTokenResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["access_token"] === "string" &&
    typeof o["refresh_token"] === "string" &&
    typeof o["expires_at"] === "number" &&
    typeof o["expires_in"] === "number"
  );
}
