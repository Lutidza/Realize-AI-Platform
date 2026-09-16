// @vitest-environment node
/**
 * @file tests/int/mediaOriginalGuard.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-14
 * @description Проверяет опасные Local API пути исходника до файловой обработки Payload.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { protectMediaOriginal } from "../../src/collections/Media/protectMediaOriginal.hook";
import type { MediaOriginalGuardTestOptions } from "./support/mediaArchitecture/MediaArchitecture.types";

const invoke = (options: MediaOriginalGuardTestOptions) => {
  // Hook boundary без БД: native integration проверяет те же входы через REST.
  const args = {
    data: options.data ?? {},
    overwriteExistingFiles: options.overwriteExistingFiles,
  };
  return protectMediaOriginal({
    args,
    operation: options.operation ?? "create",
    collection: { upload: {} },
    req: {
      query: options.query ?? {},
      file: options.file,
      payload: { config: { sharp: options.nativeSharp ? sharp : undefined } },
    },
  } as unknown as Parameters<typeof protectMediaOriginal>[0]);
};

describe("immutable original beforeOperation", () => {
  it("denies native Local API overwrite before it can touch another original", () => {
    expect(() => invoke({ overwriteExistingFiles: true })).toThrow(
      /Перезапись/,
    );
  });
  it.each([
    { file: { mimetype: "image/webp" }, nativeSharp: true },
    { file: { mimetype: "image/png", tempFilePath: "/not-read-by-guard" } },
  ])("refuses native paths that can change master bytes", (options) => {
    expect(() => invoke(options)).toThrow(/сохранение исходных байтов/);
  });
  it("refuses create crop in inline data and preserves metadata-only editing", () => {
    expect(() => invoke({ data: { crop: { x: 0 } } })).toThrow(/Кадрирование/);
    expect(() =>
      invoke({ operation: "update", data: { alt: "Changed caption" } }),
    ).not.toThrow();
    expect(() => invoke({ operation: "update", data: { focalX: 0 } })).toThrow(
      /Кадрирование/,
    );
  });
});
