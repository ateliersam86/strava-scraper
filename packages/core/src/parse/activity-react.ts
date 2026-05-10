/**
 * Activity HTML page parser — React-component flavor (Strava 2025+).
 *
 * As of 2026, Strava's activity page no longer embeds a `__INITIAL_STATE__`
 * JSON blob. Instead the page is built from React components, each with its
 * data serialized into a `data-react-props` attribute (HTML-escaped JSON).
 *
 * Verified component classes (from real production HTML, May 2026):
 *
 * | class                         | provides                                       |
 * | ----------------------------- | ---------------------------------------------- |
 * | `ADPKudosAndComments`         | name, ownerAthleteId, ownerName, kudos, comments |
 * | `MediaThumbnailList`          | photos with caption, dimensions, native flag   |
 * | `ExcludedEfforts`             | activityId only                                 |
 * | `AvatarWrapper`               | athlete avatar + name (athlete-level)          |
 *
 * Stats (distance, time, elevation gain, ...) and the GPS trace are NOT in
 * data-react-props — Strava builds the chart and stats panel via a chained
 * JS builder pattern (`activityAthlete(...).mbr(...).baseStream(...)`). For
 * those, callers should use the official API (`StravaApiClient.getActivity`).
 *
 * This parser focuses on what HTML uniquely provides:
 * - Photo HD URLs (the API only gives thumbnails or requires an extra call)
 * - Owner identity + activity name (cheap, no extra API call)
 * - Kudos/comments counts (cheap)
 *
 * Combine with the API for stats — exactly the strategy `pR0Ps/strava-backup`
 * uses. See `enrichTripSegmentFromScraper` for the canonical merge.
 */

import * as cheerio from "cheerio";
import type { Activity, ActivityPhoto, LatLng } from "../types/activity.ts";
import { extractActivityStatsFromHtml } from "./activity-stats.ts";

/**
 * One React component instance from the page. The `props` field is the
 * JSON.parsed version of `data-react-props`.
 */
export type ReactComponent = {
  className: string;
  props: Record<string, unknown>;
};

export class ActivityReactParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityReactParseError";
  }
}

/**
 * Extract every `[data-react-class][data-react-props]` element on the page.
 * Lenient: skips elements whose props fail to parse, never throws.
 */
export function extractReactComponents(html: string): ReactComponent[] {
  const $ = cheerio.load(html);
  const out: ReactComponent[] = [];
  $("[data-react-class][data-react-props]").each((_, el) => {
    const className = $(el).attr("data-react-class") ?? "";
    const propsRaw = $(el).attr("data-react-props") ?? "";
    if (!className || !propsRaw) return;
    try {
      // Strava sometimes HTML-escapes quotes; cheerio's attr() un-escapes
      // most entities but `&quot;` can sneak in. Try plain parse first,
      // then a fallback that un-escapes quotes manually.
      let props: unknown;
      try {
        props = JSON.parse(propsRaw);
      } catch {
        props = JSON.parse(propsRaw.replace(/&quot;/g, '"'));
      }
      if (props && typeof props === "object" && !Array.isArray(props)) {
        out.push({ className, props: props as Record<string, unknown> });
      }
    } catch {
      // un-parseable component, skip
    }
  });
  return out;
}

/**
 * Find the first component whose className matches (string equality OR a
 * regex test if a RegExp is passed).
 */
export function findComponent(
  components: readonly ReactComponent[],
  match: string | RegExp,
): ReactComponent | undefined {
  if (typeof match === "string") {
    return components.find((c) => c.className === match);
  }
  return components.find((c) => match.test(c.className));
}

/**
 * Parse a Strava activity HTML page (2025+ React-based) into our typed
 * {@link Activity}. Fields not present in HTML (stats, splits, segment
 * efforts) stay `undefined` — consumers should fill them via the API.
 */
export function parseActivityPageReact(html: string, activityId: number | string): Activity {
  const components = extractReactComponents(html);

  const out: Activity = { id: activityId };

  // ── Identity + counts (ADPKudosAndComments) ─────────────────────────────
  const adp = findComponent(components, "ADPKudosAndComments");
  if (adp) {
    const p = adp.props;
    if (typeof p.activityName === "string") out.name = p.activityName;
    const oid = numOrStr(p.ownerAthleteId);
    if (oid) out.athleteId = oid;
    const eid = numOrStr(p.entityId);
    if (eid) out.id = eid;
    if (typeof p.kudosCount === "number") out.kudosCount = p.kudosCount;
    if (typeof p.commentsCount === "number") out.commentsCount = p.commentsCount;
  }

  // ── Photos (MediaThumbnailList) ─────────────────────────────────────────
  const media = findComponent(components, "MediaThumbnailList");
  if (media) {
    const items = media.props.items;
    if (Array.isArray(items)) {
      const photos: ActivityPhoto[] = [];
      for (const raw of items) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        const id = numOrStr(r.id ?? r.photo_id);
        // Strava 2026 stores HD url as `large` (or `thumbnail`) on photo items
        const hd = strOf(r.large ?? r.thumbnail);
        if (!id || !hd) continue;
        const photo: ActivityPhoto = { id, hdUrl: hd };
        const photoUuid = strOf(r.photo_id);
        if (photoUuid) photo.uniqueId = photoUuid;
        const caption = strOf(r.caption_escaped ?? r.caption);
        if (caption) photo.caption = decodeHtml(caption);
        const lat = numOf(r.lat);
        const lng = numOf(r.lng);
        if (lat != null && lng != null) photo.location = [lat, lng] as LatLng;
        // `native: true` = uploaded to Strava; `native: false` would be IG
        if (r.native === false) photo.source = "instagram";
        else if (r.native === true) photo.source = "strava";
        photos.push(photo);
      }
      if (photos.length) out.photos = photos;
    }
  }

  // ── Trace bounds via the chained JS builder (regex on the inline script).
  //    Strava emits e.g. `.mbr([[lat1,lng1],[lat2,lng2]])`.
  const mbrMatch = html.match(
    /\.mbr\(\s*\[\s*\[([\d.\-]+),\s*([\d.\-]+)\]\s*,\s*\[([\d.\-]+),\s*([\d.\-]+)\]\s*\]\s*\)/,
  );
  if (mbrMatch) {
    const [, sLat, sLng, neLat, neLng] = mbrMatch;
    const sw = toLatLng(sLat, sLng);
    const ne = toLatLng(neLat, neLng);
    if (sw && ne) out.bounds = { southwest: sw, northeast: ne };
  }

  // ── Stats panel (ul.inline-stats + div.more-stats > table).
  //    Locale-aware (FR + EN), label-driven mapping.
  const { stats, deviceName } = extractActivityStatsFromHtml(html);
  if (Object.keys(stats).length > 0) out.stats = stats;
  if (deviceName) out.deviceName = deviceName;

  // ── Gear name (server-rendered HTML, not React props).
  //    Activity page contains:
  //      <div class="gear spans8">
  //        Vélo:
  //        <span class="gear-name">cuuubbbe</span>
  //      </div>
  //    Verified against the reference account's "Jour 7" activity on 2026-05-10.
  //    Strava doesn't expose the gear ID on this page (it's just the name).
  const $ = cheerio.load(html);
  const gearName = $(".gear .gear-name").first().text().trim();
  if (gearName) {
    out.gear = { id: "", name: gearName };
  }

  return out;
}

// ── Internal helpers ────────────────────────────────────────────────────────

function strOf(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function numOf(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function numOrStr(v: unknown): number | string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function toLatLng(lat: string | undefined, lng: string | undefined): LatLng | undefined {
  if (!lat || !lng) return undefined;
  const a = Number.parseFloat(lat);
  const b = Number.parseFloat(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return [a, b] as LatLng;
}
