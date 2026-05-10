/**
 * Filesystem storage adapter.
 *
 * Layout (rooted at the directory passed to the constructor):
 * ```
 * <root>/
 *   activities/
 *     {id}/
 *       activity.json          ← parsed Activity (typed)
 *       streams.json           ← StreamSet from API (optional)
 *       original.<ext>         ← original GPX/FIT/TCX bytes
 *       gpx.gpx                ← Strava-converted GPX (optional)
 *       photos/
 *         manifest.json
 *         {photoId}.{ext}
 *   bikes/
 *     {bikeId}/
 *       components.json
 * ```
 *
 * Writes are atomic: bytes go to a `.tmp` next to the destination then are
 * renamed in place. Failures leave the previous good copy intact.
 */

import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
// Note: We deliberately don't import `ReadableStream` from `node:stream/web`
// because Bun/Node's global `ReadableStream` is structurally compatible with
// `Readable.fromWeb`'s expected type. Casting via `unknown` keeps both
// runtimes happy under strict TS.
import type { Activity, BikeComponent } from "../../core/src/types/activity.ts";
import type { Gear } from "../../core/src/types/gear.ts";
import type { StorageAdapter } from "./index.ts";

export type FilesystemAdapterOptions = {
  /** Root directory where activities/, bikes/ etc. are created. */
  rootDir: string;
  /** If true, atomic writes via .tmp+rename. Default: true. */
  atomic?: boolean;
};

export class FilesystemAdapter implements StorageAdapter {
  private readonly rootDir: string;
  private readonly atomic: boolean;

  constructor(options: FilesystemAdapterOptions) {
    if (!options.rootDir) {
      throw new Error("FilesystemAdapter requires a non-empty `rootDir`");
    }
    this.rootDir = options.rootDir;
    this.atomic = options.atomic ?? true;
  }

  async writeActivity(activity: Activity): Promise<void> {
    const path = join(this.activityDir(activity.id), "activity.json");
    await this.writeJson(path, activity);
  }

  async readActivity(activityId: number | string): Promise<Activity | null> {
    const path = join(this.activityDir(activityId), "activity.json");
    try {
      const content = await readFile(path, "utf-8");
      return JSON.parse(content) as Activity;
    } catch (err) {
      if (isNodeError(err) && err.code === "ENOENT") return null;
      throw err;
    }
  }

  async writeFile(
    activityId: number | string,
    relativePath: string,
    body: ReadableStream<Uint8Array>,
    metadata?: { contentType?: string },
  ): Promise<void> {
    void metadata; // FS adapter doesn't store content-type separately
    const target = join(this.activityDir(activityId), relativePath);
    await this.writeStream(target, body);
  }

  async writeBikeComponents(bikeId: string, components: BikeComponent[]): Promise<void> {
    const path = join(this.rootDir, "bikes", String(bikeId), "components.json");
    await this.writeJson(path, {
      bikeId,
      generatedAt: new Date().toISOString(),
      components,
    });
  }

  async writeGear(gear: Gear): Promise<void> {
    const subdir = gear.kind === "bike" ? "bikes" : "shoes";
    const path = join(this.rootDir, subdir, String(gear.id), "gear.json");
    await this.writeJson(path, gear);
  }

  // ── Convenience ────────────────────────────────────────────────────────────

  /** Path on disk (relative to rootDir) where this activity's files live. */
  activityDir(activityId: number | string): string {
    return join(this.rootDir, "activities", String(activityId));
  }

  /** Convenience: write a JSON manifest into the photos/ subdir. */
  async writePhotosManifest(activityId: number | string, manifest: unknown): Promise<void> {
    const path = join(this.activityDir(activityId), "photos", "manifest.json");
    await this.writeJson(path, manifest);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async writeJson(path: string, value: unknown): Promise<void> {
    const text = `${JSON.stringify(value, null, 2)}\n`;
    await mkdir(dirname(path), { recursive: true });
    if (this.atomic) {
      const tmp = `${path}.tmp`;
      try {
        await writeFile(tmp, text, "utf-8");
        await rename(tmp, path);
      } catch (err) {
        await rm(tmp, { force: true }).catch(() => undefined);
        throw err;
      }
    } else {
      await writeFile(path, text, "utf-8");
    }
  }

  private async writeStream(path: string, body: ReadableStream<Uint8Array>): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const target = this.atomic ? `${path}.tmp` : path;
    // biome-ignore lint/suspicious/noExplicitAny: Readable.fromWeb's web-stream type differs slightly between Node + Bun
    const nodeStream = Readable.fromWeb(body as unknown as Parameters<typeof Readable.fromWeb>[0]);
    const writeStream = createWriteStream(target);
    try {
      await pipeline(nodeStream, writeStream);
      if (this.atomic) await rename(target, path);
    } catch (err) {
      if (this.atomic) await rm(target, { force: true }).catch(() => undefined);
      throw err;
    }
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

/** Return whether a directory exists. Convenience for CLI. */
export async function directoryExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") return false;
    throw err;
  }
}
