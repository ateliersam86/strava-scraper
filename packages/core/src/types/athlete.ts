/**
 * Athlete profile model.
 *
 * Represents what we extract from `/athletes/{id}` HTML — a different shape
 * from the API's `/athlete` endpoint (which is the *logged-in* user only).
 * The profile page surfaces public data about ANY athlete the viewer can
 * see (own + followed athletes + public profiles).
 */

import type { ActivityPhoto } from "./activity.ts";

export type RecentActivity = {
  id: number | string;
  athleteId?: number | string;
  name?: string;
  description?: string;
  /** Sport / activity type (Ride, Run, ...). */
  type?: string;
  /** Timestamp the activity started, ISO 8601. */
  startDate?: string;
  /** Distance in meters. */
  distanceMeters?: number;
  /** Moving time in seconds. */
  movingTimeSeconds?: number;
  /** Total elevation gain in meters. */
  elevationGainMeters?: number;
};

export type AthleteProfile = {
  id: number | string;
  name?: string;
  /** Avatar URL (largest available). */
  avatarUrl?: string;
  /**
   * Activity IDs in the order they appear on the profile page (most recent
   * first). Includes EVERY id we can scrape — far more than just the
   * MediaGrid items.
   */
  recentActivityIds: Array<number | string>;
  /**
   * Subset of recent activities for which the page provides extended
   * metadata (name, description, type, ...). Drawn from the
   * `AthleteProfileHeaderMediaGrid` component when present.
   */
  recentActivities: RecentActivity[];
  /**
   * Photos visible on the profile (across activities). Useful for an
   * archive workflow when you don't want to per-activity re-scrape.
   */
  recentPhotos?: ActivityPhoto[];
};
