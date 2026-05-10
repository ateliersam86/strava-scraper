import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FilesystemAdapter, directoryExists } from "../src/filesystem.ts";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "strava-scraper-fs-"));
});

afterEach(async () => {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
});

describe("FilesystemAdapter", () => {
  it("writeActivity + readActivity round-trip", async () => {
    const fs = new FilesystemAdapter({ rootDir: tempRoot });
    const activity = {
      id: 18424208164,
      name: "Test ride",
      type: "Ride",
      stats: { distanceMeters: 1234, movingTimeSeconds: 60 },
    };
    await fs.writeActivity(activity);
    const round = await fs.readActivity(18424208164);
    expect(round).toEqual(activity);

    // File on disk is human-readable JSON
    const raw = await readFile(
      join(tempRoot, "activities", "18424208164", "activity.json"),
      "utf-8",
    );
    expect(raw).toContain('"id": 18424208164');
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("readActivity returns null for missing activity", async () => {
    const fs = new FilesystemAdapter({ rootDir: tempRoot });
    expect(await fs.readActivity(404)).toBeNull();
  });

  it("writeFile accepts a Web ReadableStream and writes bytes atomically", async () => {
    const fs = new FilesystemAdapter({ rootDir: tempRoot });
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    await fs.writeFile(123, "original.fit", body);
    const written = await readFile(join(tempRoot, "activities", "123", "original.fit"));
    expect(written.length).toBe(bytes.length);
    expect(written[0]).toBe(0xff);
  });

  it("writeBikeComponents writes JSON with bikeId + components", async () => {
    const fs = new FilesystemAdapter({ rootDir: tempRoot });
    await fs.writeBikeComponents("b42", [
      { id: "abc", type: "Chain", brand: "SRAM", model: "X1", distanceMeters: 1000 },
    ]);
    const raw = await readFile(join(tempRoot, "bikes", "b42", "components.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.bikeId).toBe("b42");
    expect(parsed.components).toHaveLength(1);
    expect(parsed.components[0].brand).toBe("SRAM");
  });

  it("writePhotosManifest writes under photos/manifest.json", async () => {
    const fs = new FilesystemAdapter({ rootDir: tempRoot });
    await fs.writePhotosManifest(7, { activityId: 7, photos: [] });
    const raw = await readFile(
      join(tempRoot, "activities", "7", "photos", "manifest.json"),
      "utf-8",
    );
    expect(JSON.parse(raw).activityId).toBe(7);
  });

  it("directoryExists detects existing and missing dirs", async () => {
    expect(await directoryExists(tempRoot)).toBe(true);
    expect(await directoryExists(join(tempRoot, "nope"))).toBe(false);
  });
});
