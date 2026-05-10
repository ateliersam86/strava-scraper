# strava-scraper

[![CI](https://github.com/ateliersam86/strava-scraper/actions/workflows/ci.yml/badge.svg)](https://github.com/ateliersam86/strava-scraper/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

> A complete TypeScript Strava scraper. Pulls **everything** the official API hides: original GPX/FIT/TCX with per-point timestamps, bike components, photos, and more.

## Why?

The Strava public API has gaps:

- **GPX exports lack `<time>` per point** — you can't reconstruct ride pacing
- **Bike components** (chain, tires, cassette) aren't exposed
- **Original uploaded files** (your watch's native FIT/TCX) aren't downloadable via API
- **Photos** at full resolution require HTML scraping

This library fills those gaps using authenticated HTML requests, while still leveraging the official API for everything it covers (streams, segments, kudos). Inspired by [`pR0Ps/stravaweblib`](https://github.com/pR0Ps/stravaweblib) (Python) which we ported to TypeScript and extended.

## Status

🚧 **Pre-alpha — Phase 0 of [9-phase roadmap](docs/roadmap.md)**

| Phase | Status |
| ----- | ------ |
| 0. Bootstrap monorepo | ✅ |
| 1. Auth (JWT cookie + persistent context) | 🚧 in progress |
| 2. Activity HTML parser + downloads | 📋 planned |
| 3. Photos download | 📋 planned |
| 4. Storage adapters (FS / DB / S3) | 📋 planned |
| 5. CLI | 📋 planned |
| 6. API client wrapper | 📋 planned |
| 7. Tests + fixtures | 📋 planned |
| 8. npm publish | 📋 planned |
| 9. atelier-web-travels integration | 📋 planned |

## Installation

```bash
# Once published to npm:
bun add @atelier/strava-scraper-core

# For now, install from this repo:
git clone https://github.com/ateliersam86/strava-scraper.git
cd strava-scraper
bun install
```

## Quickstart (planned API — not yet wired)

```typescript
import { ScraperClient, JwtCookieAuth } from "@atelier/strava-scraper-core";

const client = new ScraperClient({
  auth: new JwtCookieAuth({ jwt: process.env.STRAVA_JWT! }),
});

// Download original GPX with full per-point timestamps
const gpx = await client.downloadActivity(18424208164, { format: "gpx" });
await Bun.write("ride.gpx", gpx.content);

// Get full bike component history (chain, tires, etc.)
const components = await client.getBikeComponents("b12345");
```

## How to get your JWT

1. Log in to Strava in any browser
2. Open DevTools → Application → Cookies → strava.com
3. Copy the `strava_remember_token` value
4. `export STRAVA_JWT="<value>"`

The cookie is valid for ~14 days. The library will tell you when it expires.

Alternatively, use **persistent context auth** (Phase 1) — Playwright opens a Chrome window once for you to log in, and reuses that session forever.

## Legal & ethics

⚠️ **Personal use only, your own data.**

Strava's [Terms of Service](https://www.strava.com/legal/terms-2026) (January 2026) prohibit:

- Scraping data that isn't yours
- Sharing scraped data with third parties
- Using scraped data for AI / ML training
- Aggregating other users' activities

This tool is built for **archival of your own ride data** — backing up the GPX timestamps Strava strips from exports, mirroring photos to your own storage, etc. Anything beyond that risks account suspension and is outside the spirit of this project.

## Architecture

```
strava-scraper/
├── packages/
│   ├── core/              # Scraping logic, types, parsers
│   │   ├── src/auth/      # JWT cookie + Playwright persistent context
│   │   ├── src/http/      # Fetch wrapper, CSRF, rate limiting
│   │   ├── src/parse/     # HTML → typed JSON parsers
│   │   ├── src/api/       # Official API wrapper
│   │   ├── src/download/  # GPX/FIT/TCX/photo file downloads
│   │   └── src/types/     # Shared types
│   ├── cli/               # `strava-scraper` CLI commands
│   └── storage-adapters/  # Pluggable: filesystem / MariaDB / S3
└── docs/                  # Architecture decisions, roadmap, rate limits
```

## Contributing

Contributions welcome! See [docs/roadmap.md](docs/roadmap.md) for what's next, and please file an issue before starting non-trivial work to avoid duplication.

## Credits

- [`pR0Ps/stravaweblib`](https://github.com/pR0Ps/stravaweblib) — Python predecessor; auth flow + endpoint discovery
- [`pR0Ps/strava-backup`](https://github.com/pR0Ps/strava-backup) — reference for the photo + gear backup feature set
- [`node-strava/node-strava-v3`](https://github.com/node-strava/node-strava-v3) — API endpoint coverage reference

## License

MIT — see [LICENSE](LICENSE)
