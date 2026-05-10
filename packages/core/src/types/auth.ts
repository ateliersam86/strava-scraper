/** Decoded payload of the `strava_remember_token` JWT. */
export type StravaJwtPayload = {
  /** Athlete ID (Strava account id). */
  sub: number | string;
  /** Issued-at, unix seconds. */
  iat?: number;
  /** Expiry, unix seconds. */
  exp: number;
  /** Random nonce. */
  nonce?: string;
};

/** Cookie pair the scraper needs to be authenticated against strava.com. */
export type StravaSessionCookies = {
  strava_remember_id: string;
  strava_remember_token: string;
};

/** CSRF pair scraped from `<meta>` tags on the about page. */
export type StravaCsrf = {
  /** Form-data key for the token (always `authenticity_token` in practice, but Strava could change it). */
  param: string;
  /** Token value. */
  token: string;
};

/** Errors produced by auth strategies. */
export class AuthError extends Error {
  public override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AuthError";
    if (cause !== undefined) this.cause = cause;
  }
}

export class JwtExpiredError extends AuthError {
  constructor(public readonly expiredAt: Date) {
    super(`JWT expired at ${expiredAt.toISOString()}`);
    this.name = "JwtExpiredError";
  }
}

export class LoginFailedError extends AuthError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "LoginFailedError";
  }
}
