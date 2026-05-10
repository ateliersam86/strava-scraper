/**
 * Strava REST API v3 client.
 *
 * Covers the endpoints we actually use:
 * - GET /api/v3/athlete
 * - GET /api/v3/activities/{id}                   (includes `description`, `gear`, etc.)
 * - GET /api/v3/activities/{id}/streams           (per-point time/distance/altitude/HR/...)
 * - GET /api/v3/activities/{id}/photos            (photo references with sized URLs)
 * - GET /api/v3/athlete/activities                (list activities with pagination)
 *
 * Rate limits: Strava enforces 200 req / 15 min and 2000 req / day per
 * application. We surface the headers `X-RateLimit-Limit` and
 * `X-RateLimit-Usage` on the {@link RateLimitInfo} object so callers can
 * back off proactively. We never hide rate-limit responses (HTTP 429) — we
 * throw {@link RateLimitedError} with `retryAfterSeconds` so the caller can
 * decide its policy.
 */

import type { StreamSet, StreamType as StreamTypeT } from "../types/streams.ts";

const API_BASE_URL = "https://www.strava.com/api/v3";

export type RateLimitInfo = {
  /** Two limits: short-window (15min) and long-window (daily). */
  shortLimit: number | null;
  longLimit: number | null;
  shortUsage: number | null;
  longUsage: number | null;
};

export class StravaApiError extends Error {
  public readonly status: number;
  public readonly endpoint: string;
  public readonly body: string | undefined;
  constructor(message: string, status: number, endpoint: string, body?: string) {
    super(message);
    this.name = "StravaApiError";
    this.status = status;
    this.endpoint = endpoint;
    if (body !== undefined) this.body = body;
  }
}

export class RateLimitedError extends StravaApiError {
  public readonly retryAfterSeconds: number | null;
  constructor(endpoint: string, retryAfterSeconds: number | null, body?: string) {
    super(`Rate-limited by Strava on ${endpoint}`, 429, endpoint, body);
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type StravaApiClientOptions = {
  /** Bearer token from OAuth. */
  accessToken: string;
  fetch?: typeof fetch;
  /** Request timeout in ms (default 30000). */
  timeoutMs?: number;
};

export class StravaApiClient {
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  /** Most recent rate-limit info, updated after every call. */
  public lastRateLimit: RateLimitInfo = {
    shortLimit: null,
    longLimit: null,
    shortUsage: null,
    longUsage: null,
  };

  constructor(options: StravaApiClientOptions) {
    if (!options.accessToken) {
      throw new Error("StravaApiClient requires an accessToken");
    }
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  // ── Activities ────────────────────────────────────────────────────────────

  /** GET /athlete. */
  async getAthlete(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/athlete");
  }

  /** GET /activities/{id}?include_all_efforts=true */
  async getActivity(activityId: number | string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/activities/${activityId}`, {
      query: { include_all_efforts: "true" },
    });
  }

  /**
   * GET /activities/{id}/streams?keys=time,distance,...&key_by_type=true
   *
   * The `time` stream is what unlocks per-point timestamps for the
   * timelapse widget. Strava only includes streams the activity actually
   * has — e.g. no `heartrate` stream if no HR sensor was paired.
   *
   * Strava sometimes returns an array of `{type, data, ...}` and sometimes
   * an object keyed by type (depends on the `key_by_type` param interpretation
   * which has shifted between API versions). We normalize both shapes into
   * a {@link StreamSet} client-side.
   */
  async getActivityStreams(
    activityId: number | string,
    types: readonly StreamTypeT[] = [
      "time",
      "distance",
      "latlng",
      "altitude",
      "velocity_smooth",
      "heartrate",
      "cadence",
      "watts",
      "temp",
    ],
    options: { resolution?: "low" | "medium" | "high" } = {},
  ): Promise<StreamSet> {
    const query: Record<string, string> = {
      keys: types.join(","),
      key_by_type: "true",
    };
    if (options.resolution) query.resolution = options.resolution;
    const raw = await this.request<unknown>(`/activities/${activityId}/streams`, { query });
    return normalizeStreamsResponse(raw);
  }

  /** GET /activities/{id}/photos?size=2048&photo_sources=true */
  async getActivityPhotos(activityId: number | string, size = 2048): Promise<unknown[]> {
    const query = { size: String(size), photo_sources: "true" };
    return this.request<unknown[]>(`/activities/${activityId}/photos`, { query });
  }

  /**
   * GET /athlete/activities?after=...&before=...&page=...&per_page=...
   *
   * Paginated. `after` and `before` are unix seconds.
   */
  async listActivities(
    options: {
      after?: number;
      before?: number;
      page?: number;
      perPage?: number;
    } = {},
  ): Promise<unknown[]> {
    const query: Record<string, string> = {};
    if (options.after) query.after = String(options.after);
    if (options.before) query.before = String(options.before);
    if (options.page) query.page = String(options.page);
    if (options.perPage) query.per_page = String(options.perPage);
    return this.request<unknown[]>("/athlete/activities", { query });
  }

  /**
   * GET /gear/{id} — bike or shoe metadata.
   *
   * Bikes (id starts with `b`): name, brand_name, model_name, frame_type, distance, description.
   * Shoes (id starts with `g`): name, brand_name, model_name, distance, description.
   * Returns the raw payload; pass to {@link normalizeGear} for a typed `Gear`.
   */
  async getGear(gearId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/gear/${gearId}`);
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async request<T>(
    path: string,
    options: { query?: Record<string, string> } = {},
  ): Promise<T> {
    const url = new URL(API_BASE_URL + path);
    for (const [k, v] of Object.entries(options.query ?? {})) {
      url.searchParams.set(k, v);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          accept: "application/json",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    this.updateRateLimitFromHeaders(response.headers);

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : null;
      const body = await response.text().catch(() => "");
      throw new RateLimitedError(path, Number.isFinite(seconds) ? seconds : null, body);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new StravaApiError(
        `Strava API ${path} returned HTTP ${response.status}`,
        response.status,
        path,
        text,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new StravaApiError(
        `Strava API ${path} returned non-JSON body`,
        response.status,
        path,
        text,
      );
    }
  }

  private updateRateLimitFromHeaders(headers: Headers): void {
    const parsePair = (header: string | null): [number | null, number | null] => {
      if (!header) return [null, null];
      const [short, long] = header.split(",").map((s) => Number.parseInt(s.trim(), 10));
      return [
        Number.isFinite(short) ? (short as number) : null,
        Number.isFinite(long) ? (long as number) : null,
      ];
    };
    const [shortLimit, longLimit] = parsePair(headers.get("x-ratelimit-limit"));
    const [shortUsage, longUsage] = parsePair(headers.get("x-ratelimit-usage"));
    this.lastRateLimit = { shortLimit, longLimit, shortUsage, longUsage };
  }
}

/**
 * Normalize a `/streams` response into a {@link StreamSet}.
 *
 * Strava's API actually returns an **array** `[{type: "time", data: [...]}, ...]`
 * regardless of `key_by_type`. We tolerate both shapes (array + already-keyed
 * object) so the API client returns a consistent type to callers.
 *
 * Exported separately so consumers can use it on cached/mocked responses.
 */
export function normalizeStreamsResponse(raw: unknown): StreamSet {
  if (Array.isArray(raw)) {
    const out: Record<string, unknown> = {};
    for (const item of raw) {
      if (
        item &&
        typeof item === "object" &&
        "type" in item &&
        typeof (item as { type: unknown }).type === "string"
      ) {
        out[(item as { type: string }).type] = item;
      }
    }
    return out as StreamSet;
  }
  if (raw && typeof raw === "object") {
    return raw as StreamSet;
  }
  return {} as StreamSet;
}
