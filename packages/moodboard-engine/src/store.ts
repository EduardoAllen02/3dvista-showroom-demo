import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isMoodboardKey } from "./key.js";
import type { MoodboardPlan, StoredAnalysis, StoredTexture } from "./types.js";

/**
 * Where generated moodboards live. Everything is keyed by the moodboard key,
 * so a cache hit costs nothing and needs no model call.
 */
export interface MoodboardStore {
  readPlan(key: string): Promise<MoodboardPlan | null>;
  writePlan(plan: MoodboardPlan): Promise<void>;
  readAnalysis(key: string): Promise<StoredAnalysis | null>;
  writeAnalysis(key: string, value: StoredAnalysis): Promise<void>;
  readTextures(key: string): Promise<StoredTexture[] | null>;
  writeTextures(key: string, value: StoredTexture[]): Promise<void>;
  writeAsset(key: string, file: string, bytes: Buffer): Promise<void>;
  readAsset(key: string, file: string): Promise<Buffer | null>;
}

const ASSET_PATTERN = /^tex-[0-9]\.webp$/;

export function textureFileName(index: number): string {
  return `tex-${index}.webp`;
}

export function isAssetFileName(value: unknown): value is string {
  return typeof value === "string" && ASSET_PATTERN.test(value);
}

/**
 * One folder per moodboard on local disk: plan.json, analysis.json,
 * textures.json and the tex-N.webp images. Enough for the single-instance
 * backend each tour runs on; a multi-instance deployment would swap in an
 * object-storage implementation of the same interface.
 */
export class FileMoodboardStore implements MoodboardStore {
  constructor(private readonly dir: string) {}

  private folder(key: string): string {
    // Keys and file names reach this class from HTTP requests: both are
    // validated against strict patterns before touching the filesystem.
    if (!isMoodboardKey(key)) throw new Error(`Invalid moodboard key: ${key}`);
    return path.join(this.dir, key);
  }

  private async readJson<T>(key: string, name: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(path.join(this.folder(key), name), "utf8")) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async writeAtomic(key: string, name: string, data: string | Buffer): Promise<void> {
    const folder = this.folder(key);
    await mkdir(folder, { recursive: true });
    const target = path.join(folder, name);
    // Unique per write: two requests for the same new plan (a double click)
    // can land in the same millisecond.
    const tmp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, target);
  }

  readPlan(key: string): Promise<MoodboardPlan | null> {
    return this.readJson(key, "plan.json");
  }

  writePlan(plan: MoodboardPlan): Promise<void> {
    return this.writeAtomic(plan.key, "plan.json", JSON.stringify(plan, null, 2));
  }

  readAnalysis(key: string): Promise<StoredAnalysis | null> {
    return this.readJson(key, "analysis.json");
  }

  writeAnalysis(key: string, value: StoredAnalysis): Promise<void> {
    return this.writeAtomic(key, "analysis.json", JSON.stringify(value, null, 2));
  }

  readTextures(key: string): Promise<StoredTexture[] | null> {
    return this.readJson(key, "textures.json");
  }

  writeTextures(key: string, value: StoredTexture[]): Promise<void> {
    return this.writeAtomic(key, "textures.json", JSON.stringify(value, null, 2));
  }

  writeAsset(key: string, file: string, bytes: Buffer): Promise<void> {
    if (!isAssetFileName(file)) throw new Error(`Invalid asset name: ${file}`);
    return this.writeAtomic(key, file, bytes);
  }

  async readAsset(key: string, file: string): Promise<Buffer | null> {
    if (!isMoodboardKey(key) || !isAssetFileName(file)) return null;
    try {
      return await readFile(path.join(this.folder(key), file));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
}
