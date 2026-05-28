import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createLibraryCacheResponse,
  LIBRARY_CACHE_DIR,
  resolveLibraryCachePath,
} from "./files";

const touchedFiles = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...touchedFiles].map(async (filename) => {
      await rm(path.join(LIBRARY_CACHE_DIR, filename), { force: true });
    }),
  );
  touchedFiles.clear();
});

describe("library-cache/files", () => {
  it("rejects unsafe filenames", () => {
    expect(resolveLibraryCachePath("../secret.txt")).toBeNull();
    expect(resolveLibraryCachePath("nested/file.mp4")).toBeNull();
    expect(resolveLibraryCachePath("bad name.mp4")).toBeNull();
  });

  it("streams a full file with stable headers", async () => {
    const filename = `test-full-${Date.now()}.mp4`;
    touchedFiles.add(filename);
    await mkdir(LIBRARY_CACHE_DIR, { recursive: true });
    await writeFile(path.join(LIBRARY_CACHE_DIR, filename), Buffer.from("abcdef"));

    const res = await createLibraryCacheResponse({
      filename,
      method: "GET",
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("6");
    expect(await res.text()).toBe("abcdef");
  });

  it("serves byte ranges for video scrubbing and downloads", async () => {
    const filename = `test-range-${Date.now()}.mp4`;
    touchedFiles.add(filename);
    await mkdir(LIBRARY_CACHE_DIR, { recursive: true });
    await writeFile(path.join(LIBRARY_CACHE_DIR, filename), Buffer.from("abcdef"));

    const res = await createLibraryCacheResponse({
      filename,
      method: "GET",
      rangeHeader: "bytes=2-4",
    });

    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-4/6");
    expect(res.headers.get("content-length")).toBe("3");
    expect(await res.text()).toBe("cde");
  });
});
