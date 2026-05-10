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

## Phase 3: Photos download
- [ ] List photos for activity (high-res URLs)
- [ ] Download all + write `manifest.json` with metadata
- [ ] Lightroom-style export ordering (date sorted)

## Phase 4: Storage adapters
- [ ] `StorageAdapter` interface: `writeActivity(id, data)`, `writeFile(path, stream)`, `readActivity(id)`, etc.
- [ ] `FilesystemAdapter` — `out/activities/{id}/{activity.json,streams.json,gpx,photos/}`
- [ ] `MariaDBAdapter` — schema-compatible with `atelier-web-travels`
- [ ] `S3Adapter` — multi-tenant ready

## Phase 5: CLI
- [ ] `strava-scraper auth login` (Playwright headed)
- [ ] `strava-scraper auth status` (JWT validity)
- [ ] `strava-scraper sync activities --since 2025-01-01`
- [ ] `strava-scraper activity <id>` (one-off)
- [ ] `strava-scraper photos <id>`
- [ ] Pluggable `--storage fs:./out` / `--storage mariadb:...`
- [ ] Resumable, with progress bars

## Phase 6: API client wrapper
- [ ] OAuth flow with refresh tokens
- [ ] Endpoints: athletes/{id}, activities, activities/{id}, activities/{id}/streams, segments, segments/{id}/leaderboard, gear/{id}
- [ ] Strict types from API spec
- [ ] Rate limit awareness (15-min and daily windows)

## Phase 7: Tests + fixtures
- [ ] HTML fixtures for: activity page (cycling, running, hike), bike page, photos endpoint
- [ ] Auth flow happy + error paths
- [ ] Mock HTTP via MSW or undici interceptor
- [ ] CI passes on Ubuntu + macOS

## Phase 8: npm publish
- [ ] Bump versions to 0.1.0
- [ ] Publish `@atelier/strava-scraper-core`, `-cli`, `-storage-fs` etc.
- [ ] Changelog (Keep-a-Changelog format)
- [ ] GitHub release notes

## Phase 9: atelier-web-travels integration
- [ ] Replace `server/strava-sync.ts` with calls to `@atelier/strava-scraper-core`
- [ ] Schema migration: add `gpx_with_timestamps_path`, `photos_path`, `bike_components` columns (or JSON blob)
- [ ] Update `gpx-profile` API to read per-point timestamps from new GPX → `hasTimestamps: true` for all activities
- [ ] Remove the `segmentBoundaries` interpolation hack from `TimelapseBlock`
