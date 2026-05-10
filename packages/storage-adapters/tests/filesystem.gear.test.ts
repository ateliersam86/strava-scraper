import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FilesystemAdapter } from "../src/filesystem.ts";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "strava-scraper-fs-gear-"));
});

afterEach(async () => {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
});

describe("FilesystemAdapter — writeGear", () => {
  it("bikes go under bikes/{id}/gear.json", async () => {
    const fs = new FilesystemAdapter({ rootDir: tempRoot });
    await fs.writeGear({
      id: "b123",
      kind: "bike",
      name: "My Gravel",
      brandName: "Specialized",
      modelName: "Diverge",
      distanceMeters: 1_234_567,
    });
    const raw = await readFile(join(tempRoot, "bikes", "b123", "gear.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.kind).toBe("bike");
    expect(parsed.id).toBe("b123");
    expect(parsed.brandName).toBe("Specialized");
  });

  it("shoes go under shoes/{id}/gear.json", async () => {
    const fs = new FilesystemAdapter({ rootDir: tempRoot });
    await fs.writeGear({
      id: "g999",
      kind: "shoe",
      name: "Pegasus",
      brandName: "Nike",
      distanceMeters: 500_000,
    });
    const raw = await readFile(join(tempRoot, "shoes", "g999", "gear.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.kind).toBe("shoe");
    expect(parsed.brandName).toBe("Nike");
  });
});
