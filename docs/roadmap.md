# Roadmap

## Phase 0: Bootstrap monorepo ✅
- [x] Bun workspaces, packages/{core,cli,storage-adapters}
- [x] TypeScript strict + Vitest + Biome
- [x] CI GitHub Actions (lint + typecheck + test on Ubuntu/macOS)
- [x] README, LICENSE (MIT), .gitignore, docs/
- [x] First commit pushed to GitHub

## Phase 1: Auth (JWT cookie + persistent context) 🚧
- [ ] `AuthStrategy` interface
- [ ] `JwtCookieAuth` — port of `stravaweblib._login_with_jwt`:
  - Decode JWT base64 payload, validate `exp`, extract `sub` as athlete ID
  - Set `strava_remember_id` + `strava_remember_token` cookies
  - Validate by GET `/me` with redirect check
- [ ] `PersistentContextAuth` — Playwright headed mode, opens Chrome once for manual login (handles 2FA), persists context across runs
- [ ] CSRF helper: GET `/about`, parse `<meta name="csrf-token">`
- [ ] Tests with HTML fixtures

## Phase 2: Activity parser + downloads
- [ ] `downloadActivity(id, format)` — GET `/activities/{id}/export_{original,gpx,tcx}`, returns stream + suggested filename (Content-Disposition parsing)
- [ ] `parseActivityPage(html)` — extracts the embedded `__INITIAL_STATE__` JSON blob, returns typed `Activity` with **everything**: stats, splits, segments effort, photos URLs, gear, weather, kudos count, comments count
- [ ] `getBikeComponents(bikeId)` — port of stravaweblib's bike table parser
- [ ] `downloadRoute(id, format)` — GET `/routes/{id}/export_{gpx,tcx}`
- [ ] Fixture HTML files in `tests/fixtures/`

## Phase 3: Photos download ✅
- [x] `downloadPhoto` — streams individual photo bytes
- [x] `downloadActivityPhotos` — async generator, continues past errors
- [x] `buildPhotosManifest` — JSON manifest with caption/captured/location
- [x] Tests: 6 cases (HD URL preference, content-type → ext, error handling)

## Phase 4: Storage adapters
- [x] `StorageAdapter` interface
- [x] `FilesystemAdapter` — `<root>/activities/{id}/…`, `<root>/bikes/{id}/…`. Atomic writes via `.tmp+rename`. 6 tests.
- [ ] `MariaDBAdapter` — schema-compatible with `atelier-web-travels` (Phase 4b)
- [ ] `S3Adapter` — multi-tenant ready (Phase 4b)

## Phase 5: CLI ✅
- [x] `strava-scraper auth login` (Playwright headed)
- [x] `strava-scraper auth status` (JWT decode + /me validation)
- [x] `strava-scraper activity <id> --format --out`
- [x] `strava-scraper photos <id> --out`
- [x] `strava-scraper bike <id> --out`
- [x] Auth resolver: --jwt → STRAVA_JWT → state file → error

## Phase 6: API client wrapper ✅
- [x] OAuth: `buildAuthorizeUrl`, `exchangeCodeForToken`, `refreshAccessToken`
- [x] `StravaApiClient`: `getAthlete`, `getActivity`, `getActivityStreams`, `getActivityPhotos`, `listActivities`, `getGear`
- [x] Strict types: `Stream` discriminated union, `StreamSet`, `Gear` (Bike|Shoe), `AthleteSummary`
- [x] `normalizeGear` helper that turns raw `/gear/{id}` payload into typed `Gear`
- [x] Rate-limit awareness: `lastRateLimit` updated after every call, `RateLimitedError` on 429
- [x] Tests: 15 cases (OAuth + API endpoints + rate limit handling + gear normalization)

## Phase 6b: Gear coverage parity with strava-backup ✅
- [x] `getGear(id)` API endpoint
- [x] `Gear` types: `Bike` (with frameType + components), `Shoe`
- [x] `AthleteSummary` type with bikes/shoes lists
- [x] `gear` CLI command: enumerates athlete's bikes + shoes, fetches metadata,
      scrapes components for bikes, writes via `FilesystemAdapter.writeGear`
- [x] `FilesystemAdapter.writeGear` — bikes → `bikes/{id}/gear.json`, shoes → `shoes/{id}/gear.json`
- [x] `ActivityPhoto.source` field ("strava" | "instagram") + Instagram filter in
      `downloadActivityPhotos` (Instagram skipped by default — they're hosted by
      Instagram, separate concern)

## Phase 7: Tests + fixtures ✅
- [x] HTML fixtures: cycling, run/trail-run, manual hike, bike page, about page
- [x] Multi-shape parser: `__INITIAL_STATE__`, `pageView`, `data-react-props`
- [x] 75 total tests, all green

## Phase 8: npm publish (manual handoff)
- [ ] User: `npm login`
- [ ] User: `bun run build` (each package)
- [ ] User: `npm publish --access public` per package
- [ ] User: GitHub release notes via `gh release create v0.1.0`

## Phase 9: atelier-web-travels integration ✅
- [x] `enrichTripSegmentFromScraper(segment, bundle)` — pure function
- [x] `enrichTripSegments(segments, bundles)` — batch
- [x] `profileFromStreams(streams, startMs)` — zips time/distance/altitude/latlng with ISO timestamps
- [x] Doesn't mutate input, preserves existing values
- [x] 7 tests
- [ ] Wire into `atelier-web-travels/server/strava-sync.ts` — needs real-Strava validation first
