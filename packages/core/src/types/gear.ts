/**
 * Gear types — bikes and shoes.
 *
 * Strava's `/api/v3/gear/{id}` returns one of two shapes depending on whether
 * the gear id starts with `b` (bike) or `g` (shoes). We model them as a
 * discriminated union with a runtime `kind` field we infer from the id.
 */

import type { BikeComponent } from "./activity.ts";
import type { FrameType } from "./enums.ts";

export type GearBase = {
  id: string;
  primary?: boolean;
  name?: string;
  brandName?: string;
  modelName?: string;
  description?: string;
  /** Total distance accumulated on the gear, in meters. */
  distanceMeters?: number;
};

export type Bike = GearBase & {
  kind: "bike";
  frameType?: FrameType;
  /** Optionally populated by scraping `/bikes/{id}`. */
  components?: BikeComponent[];
};

export type Shoe = GearBase & {
  kind: "shoe";
};

export type Gear = Bike | Shoe;

/** Raw athlete payload from `/api/v3/athlete`. */
export type AthleteSummary = {
  id?: number;
  username?: string | null;
  firstname?: string;
  lastname?: string;
  bio?: string;
  city?: string;
  state?: string;
  country?: string;
  sex?: "M" | "F" | null;
  premium?: boolean;
  summit?: boolean;
  /** Bikes (each id starts with `b`). */
  bikes?: Array<{ id: string; primary?: boolean; name?: string; resource_state?: number }>;
  /** Shoes (each id starts with `g`). */
  shoes?: Array<{ id: string; primary?: boolean; name?: string; resource_state?: number }>;
};
