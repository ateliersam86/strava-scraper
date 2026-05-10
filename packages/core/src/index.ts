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
  parseActivityPageReact,
  extractReactComponents,
  findComponent,
  ActivityReactParseError,
} from "./parse/activity-react.ts";
export {
  extractActivityStatsFromHtml,
  extractActivityWeatherFromHtml,
} from "./parse/activity-stats.ts";
export type { ReactComponent } from "./parse/activity-react.ts";
export {
  parseAthleteProfileHtml,
  AthleteProfileParseError,
} from "./parse/athlete.ts";
export type { AthleteProfile, RecentActivity } from "./types/athlete.ts";
export {
  parseBikeComponentsHtml,
  parseBikeMetadataHtml,
  parseBikePageHtml,
  parseGearListHtml,
  parseShoeMetadataHtml,
  parseShoePageHtml,
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
export {
  buildPhotosManifest,
  downloadActivityPhotos,
  downloadPhoto,
  PhotoDownloadError,
} from "./download/photos.ts";
export type {
  DownloadedPhoto,
  PhotoDownloadOptions,
  PhotosManifest,
} from "./download/photos.ts";

// API client
export {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  OAuthError,
  refreshAccessToken,
} from "./api/oauth.ts";
export type {
  AuthorizeUrlOptions,
  ExchangeCodeOptions,
  OAuthTokenResponse,
  RefreshOptions,
  StravaScope,
} from "./api/oauth.ts";
export {
  normalizeStreamsResponse,
  RateLimitedError,
  StravaApiClient,
  StravaApiError,
} from "./api/client.ts";
export type { RateLimitInfo, StravaApiClientOptions } from "./api/client.ts";
export { inferGearKind, normalizeGear } from "./api/gear.ts";
export type { AthleteSummary, Bike, Gear, GearBase, Shoe } from "./types/gear.ts";
export type {
  LatLngStream,
  MovingStream,
  ScalarStream,
  StreamSet,
} from "./types/streams.ts";
export { StreamType } from "./types/streams.ts";

// Integrations
export {
  enrichTripSegmentFromScraper,
  enrichTripSegments,
  profileFromStreams,
} from "./integrations/atelier-web-travels.ts";
export type {
  AtwSegment,
  ScraperBundle,
} from "./integrations/atelier-web-travels.ts";

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
