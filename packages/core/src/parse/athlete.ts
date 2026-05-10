/**
 * Athlete profile HTML parser — `/athletes/{id}`.
 *
 * Strava 2025+ format uses the same React-component pattern as activity
 * pages. Verified against the reference account's profile (public, accessible to
 * Sam who follows him) on 2026-05-10.
 *
 * Extracted data:
 * - `<h1>` → athlete name
 * - `[data-react-class="AthleteProfileHeaderMediaGrid"]` → recent activities
 *   with extended metadata (name, description, type, distance via nested
 *   `activity` object on each media item)
 * - `[data-react-class="MediaThumbnailList"]` → recent photos across activities
 * - All `<a href="/activities/{id}">` → full list of activity IDs visible
 *   on the profile (richer than the MediaGrid which only has 6-12 items)
 */

import * as cheerio from "cheerio";
import type { ActivityPhoto } from "../types/activity.ts";
import type { AthleteProfile, RecentActivity } from "../types/athlete.ts";
import { extractReactComponents, findComponent } from "./activity-react.ts";

export class AthleteProfileParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AthleteProfileParseError";
  }
}

export function parseAthleteProfileHtml(html: string, athleteId: number | string): AthleteProfile {
  const $ = cheerio.load(html);
  const components = extractReactComponents(html);

  const out: AthleteProfile = {
    id: athleteId,
    recentActivityIds: [],
    recentActivities: [],
  };

  // Name from <h1>
  const h1 = $("h1").first().text().trim();
  if (h1) out.name = h1;

  // Avatar: take the largest AvatarWrapper that targets /athletes/{id}
  // (multiple AvatarWrappers exist for ride participants etc. — we want the
  // header one which usually has size: "xlarge" and matches the athleteId)
  for (const c of components) {
    if (c.className !== "AvatarWrapper") continue;
    const href = strOf(c.props.href) ?? "";
    const size = strOf(c.props.size) ?? "";
    const src = strOf(c.props.src);
    if (!src) continue;
    // Prefer the xlarge avatar of the profile owner. Fallback to first match.
    const isOwnerAvatar =
      href.endsWith(`/athletes/${athleteId}`) || size === "xlarge" || size === "large";
    if (isOwnerAvatar && !out.avatarUrl) {
      out.avatarUrl = src;
    }
  }
  if (!out.avatarUrl) {
    // Last-resort: first AvatarWrapper src found
    const first = components.find((c) => c.className === "AvatarWrapper");
    const fallback = strOf(first?.props.src);
    if (fallback) out.avatarUrl = fallback;
  }

  // Recent activity IDs from anchors (in DOM order = most-recent first
  // since Strava lists feed top-down).
  const seenIds = new Set<string>();
  $("a[href*='/activities/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/\/activities\/(\d+)/);
    const captured = m?.[1];
    if (captured && !seenIds.has(captured)) {
      seenIds.add(captured);
      out.recentActivityIds.push(Number(captured));
    }
  });

  // Extended activity metadata from MediaGrid items (each item has nested .activity).
  // The same activity id may appear multiple times (one per photo) — dedupe.
  const mediaGrid = findComponent(components, "AthleteProfileHeaderMediaGrid");
  const seenRecentActivityIds = new Set<string>();
  if (mediaGrid) {
    const items = mediaGrid.props.items;
    if (Array.isArray(items)) {
      for (const raw of items) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        const nested = r.activity;
        if (!nested || typeof nested !== "object") continue;
        const a = nested as Record<string, unknown>;
        const id = numOrStr(a.id);
        if (!id) continue;
        const idKey = String(id);
        if (seenRecentActivityIds.has(idKey)) continue;
        seenRecentActivityIds.add(idKey);
        const entry: RecentActivity = { id };
        const aid = numOrStr(a.athlete_id);
        if (aid) entry.athleteId = aid;
        const name = strOf(a.name);
        if (name) entry.name = decodeHtml(name);
        const desc = strOf(a.description);
        if (desc) entry.description = decodeHtml(desc);
        const type = strOf(a.type);
        if (type) entry.type = type;
        const startDate = strOf(a.start_date ?? a.startDate);
        if (startDate) entry.startDate = startDate;
        const distance = numOf(a.distance);
        if (distance != null) entry.distanceMeters = distance;
        const movingTime = numOf(a.moving_time ?? a.movingTime);
        if (movingTime != null) entry.movingTimeSeconds = movingTime;
        const elevation = numOf(a.total_elevation_gain ?? a.totalElevationGain);
        if (elevation != null) entry.elevationGainMeters = elevation;
        out.recentActivities.push(entry);
      }
    }
  }

  // Profile photos (across activities)
  const mediaList = findComponent(components, "MediaThumbnailList");
  if (mediaList) {
    const items = mediaList.props.items;
    if (Array.isArray(items)) {
      const photos: ActivityPhoto[] = [];
      for (const raw of items) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        const id = numOrStr(r.id ?? r.photo_id);
        const hd = strOf(r.large ?? r.thumbnail);
        if (!id || !hd) continue;
        const photo: ActivityPhoto = { id, hdUrl: hd };
        const photoUuid = strOf(r.photo_id);
        if (photoUuid) photo.uniqueId = photoUuid;
        const caption = strOf(r.caption_escaped ?? r.caption);
        if (caption) photo.caption = decodeHtml(caption);
        const lat = numOf(r.lat);
        const lng = numOf(r.lng);
        if (lat != null && lng != null) photo.location = [lat, lng];
        if (r.native === false) photo.source = "instagram";
        else if (r.native === true) photo.source = "strava";
        photos.push(photo);
      }
      if (photos.length) out.recentPhotos = photos;
    }
  }

  return out;
}

// ── helpers ────────────────────────────────────────────────────────────────

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
