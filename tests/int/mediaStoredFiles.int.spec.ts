// @vitest-environment node
/**
 * @file tests/int/mediaStoredFiles.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет границы записи, точные байты и приватные пути native Media без подключения БД.
 * @see documentation/specifications/media-management.md
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CollectionBeforeOperationHook, PayloadRequest } from "payload";
import { afterAll, describe, expect, it } from "vitest";
import { MediaOriginals } from "../../src/collections/Media/MediaOriginals.collection";
import { MediaVariants } from "../../src/collections/Media/MediaVariants.collection";
import {
  mediaProcessingInternalAccess,
  readMediaOriginal,
  readReadyMediaVariant,
} from "../../src/collections/Media/mediaFileAccess.policy";
import { resolveMediaStoragePaths } from "../../src/collections/Media/mediaStoragePaths.config";
import { protectStoredMediaFile } from "../../src/collections/Media/protectStoredMediaFile.hook";

const source = Buffer.from(
  "hash fixture: native MIME validation runs separately",
);
const sourceHash = createHash("sha256").update(source).digest("hex");

function input(original = true) {
  return {
    operation: "create",
    collection: original ? MediaOriginals : MediaVariants,
    args: {
      data: { [original ? "sourceHash" : "contentHash"]: sourceHash } as Record<
        string,
        unknown
      >,
      overrideAccess: true,
    },
    req: {
      context: { mediaProcessingInternal: true },
      query: {},
      payload: { config: {} },
      file: {
        data: source,
        mimetype: "image/webp",
        name: "master.webp",
        size: source.length,
      },
    },
  };
}

function invoke(value: unknown) {
  return protectStoredMediaFile(
    value as Parameters<CollectionBeforeOperationHook>[0],
  );
}

describe("stored Media write boundary", () => {
  it.each([true, false])(
    "accepts exact internal bytes (original=%s)",
    (original) => {
      const request = input(original);
      expect(invoke(request)).toBe(request.args);
      expect(request.req.file.data).toEqual(source);
    },
  );

  it.each(["create", "update", "delete"])(
    "rejects %s without the server context, including overrideAccess",
    (operation) => {
      const request = input();
      request.operation = operation;
      request.req.context = { mediaProcessingInternal: false };
      Object.assign(request.args.data, {
        context: { mediaProcessingInternal: true },
      });
      expect(() => invoke(request)).toThrow(/только серверный сервис/);
    },
  );

  it.each([true, false])(
    "rejects internal metadata and file updates (original=%s)",
    (original) => {
      const request = input(original);
      request.operation = "update";
      request.args.data = { alt: "updated" };
      expect(() => invoke(request)).toThrow(/неизменяемы/);
    },
  );

  it("allows internal cleanup without relaxing update protection", () => {
    const request = input();
    request.operation = "delete";
    expect(invoke(request)).toBe(request.args);
  });

  it.each([{ overwriteExistingFiles: true }, { duplicateFromID: 1 }])(
    "rejects destructive native create options %j",
    (option) => {
      const request = input();
      Object.assign(request.args, option);
      expect(() => invoke(request)).toThrow(/перезапись/);
    },
  );

  it.each([
    "crop",
    "uploadEdits",
    "focalPoint",
    "focalX",
    "focalY",
    "widthInPixels",
    "heightInPixels",
  ])("rejects inline %s before processing", (field) => {
    const request = input();
    request.args.data[field] = 0;
    expect(() => invoke(request)).toThrow(/перезапись/);
  });

  it.each([null, "crop", [], { crop: { x: 0 } }])(
    "rejects query edits %j",
    (uploadEdits) => {
      const request = input();
      request.req.query = { uploadEdits };
      expect(() => invoke(request)).toThrow(/перезапись/);
    },
  );

  it("allows an empty native edits envelope", () => {
    const request = input();
    request.req.query = { uploadEdits: {} };
    expect(invoke(request)).toBe(request.args);
  });

  it("rejects global Sharp before WebP can be encoded again", () => {
    const request = input(false);
    request.req.payload.config = { sharp: () => undefined };
    expect(() => invoke(request)).toThrow(/Настройки upload/);
  });

  it.each([
    { crop: true },
    { focalPoint: true },
    { imageSizes: [{ name: "unexpected", width: 100 }] },
    { resizeOptions: { width: 100 } },
    { formatOptions: { format: "jpeg" as const } },
    { trimOptions: { threshold: 10 } },
    { constructorOptions: { animated: true } },
  ])("rejects incompatible native upload configuration %j", (setting) => {
    const request = input();
    request.collection = {
      ...MediaOriginals,
      upload: { ...(MediaOriginals.upload as object), ...setting },
    };
    expect(() => invoke(request)).toThrow(/Настройки upload/);
  });

  it.each([true, false])("rejects hash mismatch (original=%s)", (original) => {
    const request = input(original);
    request.args.data[original ? "sourceHash" : "contentHash"] = "a".repeat(64);
    expect(() => invoke(request)).toThrow(/контрольная сумма/);
  });

  it("rejects an inconsistent size or unverified temp path", () => {
    const request = input();
    request.req.file.size++;
    expect(() => invoke(request)).toThrow(/Размер/);
    request.req.file.size = source.length;
    Object.assign(request.req.file, { tempFilePath: "/not-read-by-the-hook" });
    expect(() => invoke(request)).toThrow(/Размер/);
  });
});

describe("native file access contracts", () => {
  it("requires server context for technical writes", async () => {
    const req = {
      context: {},
      user: { roles: ["admin"] },
    } as unknown as PayloadRequest;
    expect(await mediaProcessingInternalAccess({ req })).toBe(false);
    req.context.mediaProcessingInternal = true;
    expect(await mediaProcessingInternalAccess({ req })).toBe(true);
  });

  it("keeps originals admin-only and forces a filename-to-document lookup", async () => {
    const req = { user: { roles: ["admin"] } } as unknown as PayloadRequest;
    expect(await readMediaOriginal({ req })).toEqual({ id: { exists: true } });
    expect(
      await readMediaOriginal({ req: { user: null } as PayloadRequest }),
    ).toBe(false);
    expect(
      await readMediaOriginal({
        req: { user: { roles: ["customer"] } } as unknown as PayloadRequest,
      }),
    ).toBe(false);
  });

  it("requires a ready related set even when a file is already on disk", async () => {
    expect(await readReadyMediaVariant({ req: {} as PayloadRequest })).toEqual({
      "set.status": { equals: "ready" },
    });
    expect(MediaVariants.access?.read).toBe(readReadyMediaVariant);
    expect(MediaOriginals.access?.read).toBe(readMediaOriginal);
    for (const collection of [MediaOriginals, MediaVariants]) {
      expect(collection.hooks?.beforeOperation).toContain(
        protectStoredMediaFile,
      );
      expect(collection.upload).toMatchObject({
        crop: false,
        focalPoint: false,
        pasteURL: false,
      });
    }
  });
});

describe("private native storage paths", () => {
  const root = mkdtempSync(
    path.join(os.tmpdir(), "realize-media-storage-test-"),
  );
  mkdirSync(path.join(root, "public"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("uses a deterministic private default without creating directories", () => {
    expect(resolveMediaStoragePaths("", root)).toEqual({
      originals: path.join(root, ".data/media/originals"),
      variants: path.join(root, ".data/media/variants"),
    });
  });

  it.each(["public/media", ".data/../public/media", ".next/static/media"])(
    "rejects a publicly served path %s",
    (directory) => {
      expect(() => resolveMediaStoragePaths(directory, root)).toThrow(
        /публичном/,
      );
    },
  );

  it("rejects a storage symlink leading into public", () => {
    const link = path.join(root, "private-link");
    symlinkSync(path.join(root, "public"), link, "dir");
    expect(() => resolveMediaStoragePaths(link, root)).toThrow(/публичном/);
  });

  it("does not confuse a public-prefix sibling with public storage", () => {
    expect(resolveMediaStoragePaths("public-private", root).originals).toBe(
      path.join(root, "public-private/originals"),
    );
  });
});
