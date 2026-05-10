/**
 * Gear normalization helpers.
 *
 * Strava's `/api/v3/gear/{id}` returns slightly different shapes per gear
 * kind. We infer the kind from the id prefix (`b` = bike, `g` = shoe).
 */

import { FrameType } from "../types/enums.ts";
import type { Bike, Gear, Shoe } from "../types/gear.ts";

export function inferGearKind(id: string): "bike" | "shoe" {
  if (id.startsWith("b")) return "bike";
  if (id.startsWith("g")) return "shoe";
  // Strava uses `b` and `g`. Anything else: default to bike (safer for components).
  return "bike";
}

/** Normalize the raw `/gear/{id}` response into our typed {@link Gear}. */
export function normalizeGear(id: string, raw: Record<string, unknown>): Gear {
  const kind = inferGearKind(id);
  const base = {
    id,
    name: str(raw["name"]),
    brandName: str(raw["brand_name"] ?? raw["brandName"]),
    modelName: str(raw["model_name"] ?? raw["modelName"]),
    description: str(raw["description"]),
    distanceMeters: num(raw["distance"]),
    primary: bool(raw["primary"]),
  };

  if (kind === "bike") {
    const ft = num(raw["frame_type"] ?? raw["frameType"]);
    const bike: Bike = { ...base, kind: "bike" };
    if (ft != null && isFrameType(ft)) bike.frameType = ft;
    return bike;
  }
  const shoe: Shoe = { ...base, kind: "shoe" };
  return shoe;
}

function isFrameType(n: number): n is FrameType {
  return n >= FrameType.MOUNTAIN_BIKE && n <= FrameType.GRAVEL_BIKE;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}
