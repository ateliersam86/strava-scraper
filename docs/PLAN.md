# Implementation plan — autonomous execution

Goal: bring strava-scraper from "bootstrap" (25% coverage) to "fully usable
end-to-end" (~95%) without touching real Strava credentials.

## What I'll deliver this session

| # | Deliverable | Why |
| - | ----------- | --- |
| 1 | `Phase 3` — Photos download module | Required for "tout récupérer" |
| 2 | `Phase 4a` — Filesystem storage adapter (full impl) | The CLI needs somewhere to write |
| 3 | `Phase 5` — CLI (auth/activity/photos/bike/sync) | The user-facing entry point |
| 4 | `Phase 6` — Strava API v3 client (OAuth + key endpoints) | Streams = per-point timestamps if HTML lacks them |
| 5 | `Phase 7` — Hardened parsers + multi-sport fixtures | Reduce surprises when validating against real Strava |
| 6 | `Phase 9` — atelier-web-travels integration adapter | Unblocks the timelapse bug end-to-end |

## What I will NOT deliver (out of scope)

| # | Item | Blocker |
| - | ---- | ------- |
| `Phase 4b` | MariaDB + S3 adapters | Needed only when atelier-web-travels migrates fully (Phase 9 ships first with FS) |
| `Phase 8` | npm publish | Requires user to run `npm publish` with their credentials |
| Real-Strava validation | Live login + real activity download + parser fix-ups | Requires user JWT or interactive Playwright login |

## Acceptance criteria (per phase)

Each phase ships when:
- ✅ All new code passes `bun run typecheck`
- ✅ All new code passes `bun run lint`
- ✅ New tests are added and `bun run test` is green
- ✅ Public API is exported from the package barrel
- ✅ Updated `docs/roadmap.md` to mark the phase done

## Execution order

Phases are independent on the surface but share the auth + http core. Order:

1. **Phase 6 (API client)** — pure code, no auth dance. Provides streams (the
   data the timelapse widget actually needs).
2. **Phase 3 (photos)** — small, builds on Phase 2 download primitives.
3. **Phase 4a (FS storage)** — implements the existing `StorageAdapter`
   interface. Pure I/O.
4. **Phase 7 (parser hardening)** — additional fixtures + tolerant fallbacks.
5. **Phase 5 (CLI)** — wires everything together. Last because it imports
   from all the above.
6. **Phase 9 (integration adapter)** — atelier-web-travels glue. Goes in
   `packages/core/src/integrations/` so atelier can consume from
   `@atelier/strava-scraper-core/integrations`.

## Validation handoff

After this session:

1. User runs `bun install` in `strava-scraper/`
2. User runs `bunx playwright install chromium` (one-time)
3. User runs `bun packages/cli/src/index.ts auth login`
   - A Chrome window opens
   - User logs into Strava (handles 2FA themselves)
   - Storage state saved to `.auth/strava-storage-state.json`
4. User runs `bun packages/cli/src/index.ts activity 18424208164 --out ./out`
   - Original GPX/FIT downloaded
   - HTML parsed → `activity.json`
   - First reality-check moment: does the parser handle real Strava HTML?
5. User reports issues (parser field renames, JSON shape changes) →
   I patch with their HTML as fixture.

This is the ONLY remaining manual step. Everything else is automated.
