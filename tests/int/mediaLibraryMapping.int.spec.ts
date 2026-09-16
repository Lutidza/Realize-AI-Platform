/**
 * @file tests/int/mediaLibraryMapping.int.spec.ts
 * @version 1.0.1
 * @date 2026-09-16
 * @description Проверяет allowlist рабочей медиатеки, безопасные URL и типы идентификаторов.
 * @see documentation/specifications/media-management.md
 */

import { describe, expect, it } from "vitest";
import { mapMediaLibraryItem } from "../../src/components/admin/media/mapMediaLibraryItem.mapper";

const image = {
  id: 17,
  filename: "Товар.png",
  alt: "Керамическая чашка",
  mimeType: "image/png",
  url: "/api/media/file/product.png",
  filesize: 2048,
  width: 640,
  height: 360,
  updatedAt: "2026-09-14T12:00:00.000Z",
};

describe("media library projection", () => {
  it("передаёт только фактические поля карточки, исключая raw caption, storage и lock user", () => {
    const result = mapMediaLibraryItem({
      ...image,
      caption: { root: { children: [] } },
      storageKey: "private-storage",
      _userEditing: { id: 4, email: "hidden@example.test" },
      otherField: "hidden",
    });
    expect(result).toEqual({
      id: 17,
      filename: "Товар.png",
      alt: "Керамическая чашка",
      mimeType: "image/png",
      filesize: 2048,
      width: 640,
      height: 360,
      previewURL: "/api/media/file/product.png",
      updatedAt: image.updatedAt,
      isLocked: false,
      editingUserID: null,
    });
  });

  it("сохраняет числовой и строковый ID раздельно для native selection", () => {
    expect(mapMediaLibraryItem(image)?.id).toBe(17);
    expect(mapMediaLibraryItem({ ...image, id: "17" })?.id).toBe("17");
    expect(mapMediaLibraryItem({ ...image, id: "asset-A" })?.id).toBe(
      "asset-A",
    );
  });

  it("отбрасывает документ без пригодного ID", () => {
    for (const value of [
      null,
      [],
      "media",
      {},
      { id: {} },
      { id: "" },
      { id: "\n" },
      { id: NaN },
      { id: Infinity },
      { id: -1 },
    ]) {
      expect(mapMediaLibraryItem(value)).toBeNull();
    }
  });

  it("не придумывает неизвестные метаданные и сохраняет допустимый нулевой filesize", () => {
    const result = mapMediaLibraryItem({
      id: "unknown",
      filesize: 0,
      width: 0,
      height: "320",
      updatedAt: "invalid",
      alt: null,
    });
    expect(result).toMatchObject({
      filename: "Файл без имени",
      alt: "",
      mimeType: null,
      filesize: 0,
      width: null,
      height: null,
      updatedAt: null,
      previewURL: null,
    });
    expect(
      mapMediaLibraryItem({
        ...image,
        filesize: -1,
        width: 1.2,
        height: Infinity,
      }),
    ).toMatchObject({ filesize: null, width: null, height: null });
  });

  it("не отдаёт image preview для PDF, видео или неизвестного MIME", () => {
    for (const mimeType of [
      "application/pdf",
      "video/mp4",
      "audio/mpeg",
      null,
    ]) {
      expect(
        mapMediaLibraryItem({ ...image, mimeType, thumbnailURL: "/thumb.png" })
          ?.previewURL,
      ).toBeNull();
    }
  });

  it("предпочитает безопасный native thumbnail и допускает HTTP(S) без credentials", () => {
    expect(
      mapMediaLibraryItem({
        ...image,
        thumbnailURL: "https://cdn.example.test/thumb.png",
      })?.previewURL,
    ).toBe("https://cdn.example.test/thumb.png");
    expect(
      mapMediaLibraryItem({
        ...image,
        url: "http://localhost:3000/media/image.png",
        thumbnailURL: "javascript:alert(1)",
      })?.previewURL,
    ).toBe("http://localhost:3000/media/image.png");
  });

  it("закрывает unsafe schemes, protocol-relative, controls и credentials в обоих URL", () => {
    const credentialURL = new URL("https://example.test/file.png");
    credentialURL.username = "fixture-user";
    credentialURL.password = "fixture-password";

    for (const url of [
      "javascript:alert(1)",
      "data:image/png;base64,AA",
      "//example.test/file.png",
      "/\\example.test/file.png",
      credentialURL.href,
      "https://example.test/line\n.png",
      "file:///tmp/image.png",
      "blob:https://example.test/id",
      "media/unscoped.png",
    ]) {
      expect(
        mapMediaLibraryItem({ ...image, url, thumbnailURL: url })?.previewURL,
      ).toBeNull();
    }
  });

  it("передаёт только ID блокирующего пользователя и сохраняет lock при неизвестном actor", () => {
    expect(
      mapMediaLibraryItem({
        ...image,
        _isLocked: true,
        _userEditing: { id: "4", email: "hidden@example.test" },
      }),
    ).toMatchObject({ isLocked: true, editingUserID: "4" });
    expect(
      mapMediaLibraryItem({
        ...image,
        _isLocked: true,
        _userEditing: { id: 4 },
      })?.editingUserID,
    ).toBe(4);
    expect(mapMediaLibraryItem({ ...image, _isLocked: true })).toMatchObject({
      isLocked: true,
      editingUserID: null,
    });
  });
});
