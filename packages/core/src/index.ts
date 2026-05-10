/**
 * @atelier/strava-scraper-core
 *
 * Public API barrel. Subpath exports for tree-shakability:
 * - `@atelier/strava-scraper-core/auth`
 * - `@atelier/strava-scraper-core/parse`
 * - `@atelier/strava-scraper-core/types`
 */

// Auth
export type { AuthStrategy } from "./auth/strategy.ts";
export { JwtCookieAuth, decodeJwtPayload } from "./auth/jwtCookie.ts";
export type { JwtCookieAuthOptions } from "./auth/jwtCookie.ts";
export { PersistentContextAuth } from "./auth/persistentContext.ts";
export type { PersistentContextAuthOptions } from "./auth/persistentContext.ts";

// HTTP / CSRF
export { fetchCsrf, parseCsrfFromHtml } from "./http/csrf.ts";

// Parsers
export {
  parseActivityPage,
  extractEmbeddedState,
  ActivityPageParseError,
} from "./parse/activity.ts";
export {
  parseBikeComponentsHtml,
  parseStravaDate,
  parseStravaDistanceToMeters,
  BikePageParseError,
} from "./parse/bike.ts";

// Downloads
export {
  downloadActivity,
  parseFilenameFromContentDisposition,
  StravaDownloadError,
} from "./download/activity.ts";
export type { ActivityFile, DownloadActivityOptions } from "./download/activity.ts";
export { downloadRoute } from "./download/route.ts";
export type { DownloadRouteOptions } from "./download/route.ts";

// Types
export type {
  Activity,
  ActivityGearRef,
  ActivityPhoto,
  ActivitySegmentEffort,
  ActivitySplit,
  ActivityStats,
  ActivityWeather,
  BikeComponent,
  LatLng,
  StravaActivityType,
} from "./types/activity.ts";
export {
  AuthError,
  JwtExpiredError,
  LoginFailedError,
} from "./types/auth.ts";
export type { StravaCsrf, StravaJwtPayload, StravaSessionCookies } from "./types/auth.ts";
export { DataFormat, FrameType, frameTypeLabel } from "./types/enums.ts";
