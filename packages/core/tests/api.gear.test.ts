import { describe, expect, it } from "vitest";
import { inferGearKind, normalizeGear } from "../src/api/gear.ts";
import { FrameType } from "../src/types/enums.ts";

describe("inferGearKind", () => {
  it("'b' prefix → bike", () => {
    expect(inferGearKind("b12345")).toBe("bike");
  });
  it("'g' prefix → shoe", () => {
    expect(inferGearKind("g99999")).toBe("shoe");
  });
});

describe("normalizeGear", () => {
  it("normalizes a bike", () => {
    const gear = normalizeGear("b1234", {
      name: "My Gravel",
      brand_name: "Specialized",
      model_name: "Diverge",
      frame_type: FrameType.GRAVEL_BIKE,
      distance: 12_345_678,
      description: "all-day adventure",
      primary: true,
    });
    expect(gear.kind).toBe("bike");
    expect(gear.id).toBe("b1234");
    expect(gear.name).toBe("My Gravel");
    expect(gear.brandName).toBe("Specialized");
    expect(gear.modelName).toBe("Diverge");
    expect(gear.distanceMeters).toBe(12_345_678);
    expect(gear.primary).toBe(true);
    if (gear.kind === "bike") {
      expect(gear.frameType).toBe(FrameType.GRAVEL_BIKE);
    }
  });

  it("normalizes a shoe (no frame_type)", () => {
    const gear = normalizeGear("g4242", {
      name: "Ultraboost",
      brand_name: "Adidas",
      model_name: "21",
      distance: 1_000_000,
    });
    expect(gear.kind).toBe("shoe");
    expect(gear.id).toBe("g4242");
    expect(gear.name).toBe("Ultraboost");
    expect((gear as { frameType?: number }).frameType).toBeUndefined();
  });

  it("ignores invalid frame_type values for bikes", () => {
    const gear = normalizeGear("b1", { frame_type: 99 });
    expect(gear.kind).toBe("bike");
    if (gear.kind === "bike") {
      expect(gear.frameType).toBeUndefined();
    }
  });

  it("handles snake_case and camelCase keys", () => {
    const gear = normalizeGear("b1", { brandName: "Cervelo", modelName: "S5" });
    expect(gear.brandName).toBe("Cervelo");
    expect(gear.modelName).toBe("S5");
  });
});
