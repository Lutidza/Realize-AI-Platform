// @vitest-environment node
/**
 * @file tests/int/mediaProfileSnapshot.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-15
 * @description Проверяет единый native снимок профиля, ACL и независимость задания от будущих изменений.
 */

import type { Payload, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";
import { readMediaProfileSnapshot } from "../../src/collections/Media/readMediaProfileSnapshot.service";

function fixture() {
  const version = {
    name: "Товары — WebP",
    key: "product-photo",
    enabled: true,
    variants: [
      {
        id: "native-row",
        slot: "small",
        width: 640,
        format: "webp",
        quality: 80,
      },
    ],
  };
  const snapshot = { id: 57, parent: 4, version };
  const findByID = vi.fn().mockResolvedValue({
    id: 4,
    key: "different",
    name: "Несогласованная база",
    enabled: false,
  });
  const findVersions = vi.fn().mockResolvedValue({ docs: [snapshot] });
  const payload = { findByID, findVersions } as unknown as Payload;
  const req = {
    user: { id: 1, roles: ["admin"] },
    transactionID: Promise.resolve("transaction"),
  } as unknown as PayloadRequest;
  const read = () => readMediaProfileSnapshot({ payload, req, profileID: "4" });
  return { version, snapshot, findByID, findVersions, payload, req, read };
}

describe("Снимок профиля для задания обработки", () => {
  it("читает одну последнюю native версию с ACL и передаёт исходную транзакцию", async () => {
    const f = fixture();
    const result = await f.read();
    expect(result).toEqual({
      profileID: 4,
      profileVersionID: 57,
      profileName: "Товары — WebP",
      recipe: {
        profile: "product-photo",
        version: 57,
        variants: [{ slot: "small", width: 640, format: "webp", quality: 80 }],
      },
    });
    expect(f.findByID).toHaveBeenCalledWith({
      collection: "media-profiles",
      id: "4",
      depth: 0,
      overrideAccess: false,
      req: f.req,
    });
    expect(f.findVersions).toHaveBeenCalledExactlyOnceWith({
      collection: "media-profiles",
      where: { parent: { equals: 4 } },
      sort: "-id",
      limit: 1,
      pagination: false,
      depth: 0,
      overrideAccess: false,
      req: f.req,
    });
    f.version.variants[0].quality = 10;
    f.version.name = "Новая версия";
    expect(result.recipe.variants[0].quality).toBe(80);
    expect(result.profileName).toBe("Товары — WebP");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.recipe.variants)).toBe(true);
  });

  it("не начинает чтение без действующей роли администратора", async () => {
    const f = fixture();
    for (const user of [null, { id: 2, roles: ["customer"] }]) {
      await expect(
        readMediaProfileSnapshot({
          payload: f.payload,
          profileID: 4,
          req: { user } as unknown as PayloadRequest,
        }),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect(f.findByID).not.toHaveBeenCalled();
    expect(f.findVersions).not.toHaveBeenCalled();
  });

  it("не обходит удаление родителя или отказ его read ACL через историю", async () => {
    const f = fixture();
    const denial = new Error("Parent unavailable");
    f.findByID.mockRejectedValue(denial);
    await expect(f.read()).rejects.toBe(denial);
    expect(f.findVersions).not.toHaveBeenCalled();
  });

  it("не использует базовый документ, если native история отсутствует или принадлежит другому профилю", async () => {
    const f = fixture();
    for (const docs of [
      [],
      [{ ...f.snapshot, parent: 5 }],
      [{ ...f.snapshot, id: "57" }],
      [{ ...f.snapshot, id: 0 }],
    ]) {
      f.findVersions.mockResolvedValue({ docs });
      await expect(f.read()).rejects.toMatchObject({ status: 409 });
    }
  });

  it("отклоняет выключенный профиль, повреждённый рецепт и отсутствующее название той же версии", async () => {
    const f = fixture();
    for (const version of [
      { ...f.version, enabled: false },
      { ...f.version, name: " " },
      { ...f.version, variants: [] },
      { ...f.version, variants: [{ ...f.version.variants[0], width: 0 }] },
    ]) {
      f.findVersions.mockResolvedValue({ docs: [{ ...f.snapshot, version }] });
      await expect(f.read()).rejects.toMatchObject({ status: 409 });
    }
  });
});
