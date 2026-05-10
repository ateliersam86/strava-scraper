/**
 * @atelier/strava-scraper-storage
 *
 * Phase 4 (planned): pluggable adapters for filesystem, MariaDB, S3.
 * For now this is a stub that defines the interface other phases will
 * implement against.
 */

import type { Activity, BikeComponent } from "../../core/src/types/activity.ts";

export interface StorageAdapter {
  /** Persist a parsed Activity. */
  writeActivity(activity: Activity): Promise<void>;

  /** Persist raw bytes (GPX/FIT/TCX/photo). */
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
