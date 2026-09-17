/**
 * @file tests/int/mediaPicture.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-16
 * @description Проверяет закрепление версии и безопасный srcset готовых вариантов без Next optimizer.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mapReadyMediaPicture } from "../../src/collections/Media/mapReadyMediaPicture.mapper";
import type {
  MapReadyMediaPictureInput,
  MediaPictureVariantRecord,
} from "../../src/collections/Media/MediaPicture.types";
import { MediaPictureFixture } from "./support/mediaArchitecture/mediaPicture.fixture";

function variant(
  changes: Partial<MediaPictureVariantRecord> = {},
): MediaPictureVariantRecord {
  return {
    variantSetID: "set-first",
    sourceHash: "a".repeat(64),
    status: "ready",
    slot: "small",
    format: "webp",
    url: "/api/proof-variants/file/first-small.webp",
    width: 640,
    height: 357,
    mimeType: "image/webp",
    ...changes,
  };
}

function input(): MapReadyMediaPictureInput {
  return {
    variantSetID: "set-first",
    sourceHash: "a".repeat(64),
    alt: 'Изображение <товара> "A"',
    expectedVariants: [
      { slot: "small", format: "webp" },
      { slot: "large", format: "webp" },
      { slot: "large", format: "jpeg" },
    ],
    variants: [
      variant({
        slot: "large",
        width: 1024,
        height: 571,
        url: "/api/proof-variants/file/first-large.webp",
      }),
      variant(),
      variant({
        slot: "large",
        format: "jpeg",
        width: 1024,
        height: 571,
        mimeType: "image/jpeg",
        url: "/api/proof-variants/file/first-large.jpg",
      }),
      variant({
        variantSetID: "set-second",
        url: "/api/proof-variants/file/second-small.webp",
      }),
    ],
  };
}

describe("ready media picture projection", () => {
  it("выбирает exact set/source и реальные ширины, сохраняя старую версию при наличии новой", () => {
    const fixture = input();
    const before = structuredClone(fixture);
    const picture = mapReadyMediaPicture(fixture)!;
    expect(picture.sources[0]).toEqual({
      mimeType: "image/webp",
      srcSet:
        "/api/proof-variants/file/first-small.webp 640w, /api/proof-variants/file/first-large.webp 1024w",
    });
    expect(picture.fallback).toEqual({
      url: "/api/proof-variants/file/first-large.jpg",
      width: 1024,
      height: 571,
      mimeType: "image/jpeg",
    });
    expect(fixture).toEqual(before);
    expect(JSON.stringify(picture)).not.toContain("second");
    expect(
      mapReadyMediaPicture({ ...fixture, sourceHash: "b".repeat(64) }),
    ).toBeNull();
    expect(
      mapReadyMediaPicture({ ...fixture, variantSetID: "missing" }),
    ).toBeNull();
  });

  it("требует полный manifest: отсутствующий, pending или failed вариант закрывает набор", () => {
    const fixture = input();
    expect(
      mapReadyMediaPicture({ ...fixture, variants: fixture.variants.slice(1) }),
    ).toBeNull();
    for (const status of ["pending", "failed"] as const) {
      expect(
        mapReadyMediaPicture({
          ...fixture,
          variants: fixture.variants.map((item, index) =>
            index === 0 ? { ...item, status } : item,
          ),
        }),
      ).toBeNull();
    }
    expect(
      mapReadyMediaPicture({ ...fixture, expectedVariants: [] }),
    ).toBeNull();
  });

  it("не принимает дубли manifest, слотов и конфликтующие width descriptors", () => {
    const fixture = input();
    expect(
      mapReadyMediaPicture({
        ...fixture,
        expectedVariants: [
          ...fixture.expectedVariants,
          fixture.expectedVariants[0]!,
        ],
      }),
    ).toBeNull();
    expect(
      mapReadyMediaPicture({
        ...fixture,
        variants: fixture.variants.map((item, index) =>
          index === 0 ? variant({ url: item.url }) : item,
        ),
      }),
    ).toBeNull();
    expect(
      mapReadyMediaPicture({
        ...fixture,
        variants: fixture.variants.map((item, index) =>
          index === 0 ? { ...item, width: 640, height: 356 } : item,
        ),
      }),
    ).toBeNull();
  });

  it("маленький исходник остаётся доступным: одинаковые actual widths нескольких слотов дают один кандидат", () => {
    const fixture = input();
    const picture = mapReadyMediaPicture({
      ...fixture,
      variants: fixture.variants.map((item) => ({
        ...item,
        width: 160,
        height: 89,
      })),
    })!;
    expect(picture.sources[0]).toEqual({
      mimeType: "image/webp",
      srcSet: "/api/proof-variants/file/first-large.webp 160w",
    });
    expect(picture.fallback.width).toBe(160);
    expect(picture.fallback.height).toBe(89);
  });

  it("отказывает при неверных dimensions/MIME и смешивании разных кадров", () => {
    for (const change of [
      { width: 0 },
      { width: 640.5 },
      { height: Number.NaN },
      { height: 640 },
      { mimeType: "image/jpeg" as const },
    ]) {
      const fixture = input();
      expect(
        mapReadyMediaPicture({
          ...fixture,
          variants: fixture.variants.map((item, index) =>
            index === 1 ? { ...item, ...change } : item,
          ),
        }),
      ).toBeNull();
    }
  });

  it("не принимает URL с исполняемой схемой, credentials и разделителями srcset", () => {
    const credentialURL = new URL("https://example.test/image.webp");
    credentialURL.username = "fixture-user";
    credentialURL.password = "fixture-password";

    for (const url of [
      "javascript:alert(1)",
      "data:image/png;base64,AA",
      "//untrusted.example/image.webp",
      credentialURL.href,
      "/image.webp 1w",
      "/image.webp,https://untrusted.example/second.webp",
      "/\\untrusted.example/image.webp",
    ]) {
      const fixture = input();
      expect(
        mapReadyMediaPicture({
          ...fixture,
          variants: fixture.variants.map((item, index) =>
            index === 1 ? { ...item, url } : item,
          ),
        }),
      ).toBeNull();
    }
  });

  it("публичная проекция не выдаёт raw документы, Buffer, private keys или hashes", () => {
    const fixture = input();
    const record = {
      ...fixture.variants[1]!,
      data: new Uint8Array([1, 2, 3]),
      storageKey: "private/master/image.jpg",
      sourceExif: { GPS: "private-location" },
      accessToken: "private-token",
    };
    const picture = mapReadyMediaPicture({
      ...fixture,
      variants: fixture.variants.map((item, index) =>
        index === 1 ? record : item,
      ),
    })!;
    expect(Object.keys(picture).sort()).toEqual([
      "alt",
      "fallback",
      "sources",
      "version",
    ]);
    expect(JSON.stringify(picture)).not.toMatch(
      /private|storageKey|sourceHash|variantSetID|sourceExif|accessToken/,
    );
  });

  it("SSR picture использует точные URL и размеры без Next optimizer, alt экранируется", () => {
    const picture = mapReadyMediaPicture(input())!;
    const html = renderToStaticMarkup(
      createElement(MediaPictureFixture, {
        picture,
        sizes: "(max-width: 700px) calc(100vw - 32px), 1024px",
      }),
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelectorAll("picture source")).toHaveLength(2);
    expect(document.querySelector("source")?.getAttribute("srcset")).toBe(
      picture.sources[0]?.srcSet,
    );
    expect(document.querySelector("img")?.getAttribute("alt")).toBe(
      input().alt,
    );
    expect(document.querySelector("img")?.getAttribute("width")).toBe("1024");
    expect(document.querySelector("img")?.getAttribute("height")).toBe("571");
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      picture.fallback.url,
    );
    expect(html).not.toContain("/_next/image");
    expect(document.querySelector("script")).toBeNull();
  });
});
