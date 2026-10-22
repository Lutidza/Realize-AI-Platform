/**
 * @file tests/int/preview-target.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-22
 * @description Проверяет выбор страницы reference по принятой области и отклонение неоднозначных маршрутов.
 */

import { describe, expect, it } from "vitest";

import { resolvePreviewTargetPath } from "../../services/ai-execution-worker/src/previewTarget.util";

const root = "src/app/(reference)/reference/";
const page = `${root}realize-ai/page.tsx`;

describe("preview target from accepted paths", () => {
  it("opens the sole changed reference page within its exact approved scope", () => {
    const paths = [page, `${root}realize-ai/page.module.css`];
    expect(
      resolvePreviewTargetPath({ allowedPaths: paths, expectedPaths: paths }),
    ).toBe("/reference/realize-ai");
  });

  it("supports an explicit directory scope and excludes ordinary route groups", () => {
    expect(
      resolvePreviewTargetPath({
        allowedPaths: [`${root}realize-ai/**`],
        expectedPaths: [`${root}realize-ai/(examples)/details/page.tsx`],
      }),
    ).toBe("/reference/realize-ai/details");
  });

  it("preserves the storefront smoke when the approved scope includes application files", () => {
    expect(
      resolvePreviewTargetPath({
        allowedPaths: [page, "src/components/Hero.tsx"],
        expectedPaths: [page],
      }),
    ).toBe("/");
  });

  it("preserves the storefront smoke for an ordinary component change", () => {
    const paths = ["src/components/Hero.tsx"];
    expect(
      resolvePreviewTargetPath({ allowedPaths: paths, expectedPaths: paths }),
    ).toBe("/");
  });

  it("rejects a changed page outside its approved scope", () => {
    expect(() =>
      resolvePreviewTargetPath({
        allowedPaths: [`${root}other/page.tsx`],
        expectedPaths: [page],
      }),
    ).toThrow("approved scope");
  });

  it.each([
    [],
    [`${root}realize-ai/Hero.tsx`],
    [page, `${root}realize-ai/details/page.tsx`],
  ])(
    "rejects reference-only changes without one exact page: %j",
    (...paths) => {
      expect(() =>
        resolvePreviewTargetPath({
          allowedPaths: [`${root}realize-ai/**`],
          expectedPaths: paths,
        }),
      ).toThrow("exactly one changed static page.tsx");
    },
  );

  it.each([
    "[slug]",
    "[...slug]",
    "[[...slug]]",
    "@slot",
    "_private",
    "(.)details",
    "(..)details",
    "(...)details",
    "(..)(..)details",
  ])("rejects unsupported route segment %j", (segment) => {
    const path = `${root}realize-ai/${segment}/page.tsx`;
    expect(() =>
      resolvePreviewTargetPath({
        allowedPaths: [path],
        expectedPaths: [path],
      }),
    ).toThrow(
      "Reference preview target requires static route segments without dynamic, private or intercepting routes.",
    );
  });

  it.each([
    "%2e%2e",
    "../other",
    ".",
    "hello?query",
    "hello#hash",
    "hello\\other",
    "hello\nother",
  ])(
    "rejects unsafe route segment %j at the approved-scope boundary",
    (segment) => {
      const path = `${root}realize-ai/${segment}/page.tsx`;
      expect(() =>
        resolvePreviewTargetPath({
          allowedPaths: [path],
          expectedPaths: [path],
        }),
      ).toThrow("Preview target paths differ from the approved scope.");
    },
  );

  it("rejects whitespace within an otherwise approved reference path", () => {
    const path = `${root}realize-ai/hello other/page.tsx`;
    expect(() =>
      resolvePreviewTargetPath({
        allowedPaths: [path],
        expectedPaths: [path],
      }),
    ).toThrow("Reference preview scope has unsafe paths.");
  });
});
