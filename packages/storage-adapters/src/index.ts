/**
 * @atelier/strava-scraper-storage
 *
 * Pluggable adapters that persist scraped Strava data. The {@link StorageAdapter}
 * interface is the contract; concrete implementations live alongside it.
 *
 * Currently shipped:
 * - {@link FilesystemAdapter} — `<root>/activities/{id}/…`, `<root>/bikes/{id}/…`
 *
 * Planned (Phase 4b):
 * - `MariaDBAdapter` — direct write into atelier-web-travels' schema
 * - `S3Adapter` — multi-tenant, uses a bucket prefix per athlete
 */

import type { Activity, BikeComponent } from "../../core/src/types/activity.ts";

export interface StorageAdapter {
  /** Persist a parsed Activity. */
  writeActivity(activity: Activity): Promise<void>;

  /** Persist raw bytes (GPX/FIT/TCX/photo). `relativePath` is anchored under
   *  `activities/{id}/` for filesystem adapters. */
  writeFile(
    activityId: number | string,
    relativePath: string,
    body: ReadableStream<Uint8Array>,
    metadata?: { contentType?: string },
  ): Promise<void>;

  /** Persist bike component snapshots. */
  writeBikeComponents(bikeId: string, components: BikeComponent[]): Promise<void>;

  /** Read a previously-stored Activity. */
  readActivity(activityId: number | string): Promise<Activity | null>;
}

export { FilesystemAdapter, directoryExists } from "./filesystem.ts";
export type { FilesystemAdapterOptions } from "./filesystem.ts";
