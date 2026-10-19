/**
 * @file tests/int/access-management-client.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-19
 * @description Проверяет browser transport доступов: DTO, cookie, однократную выдачу и отсутствие отражения секретов.
 * @see documentation/architecture/platform-access.md
 */
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AccessApi } from "../../src/components/admin/access-tokens/AccessApi.adapter";
import type {
  AccessCreateInput,
  AccessTokenDto,
} from "@realize/payload-access-management/contracts";

const ID = "b9d1ce2b-651f-41cf-805a-56ad54392bf4";
const SECRET = `rza.${ID}.${"a".repeat(43)}`;
const token: AccessTokenDto = {
  id: ID,
  name: "Fixture access",
  ownerId: "1",
  kind: "personal",
  scopes: ["task-manager:read"],
  prefix: `rza.${ID}`,
  createdAt: "2026-10-19T00:00:00.000Z",
  expiresAt: "2026-11-19T00:00:00.000Z",
  accessExpiresAt: "2026-11-19T00:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  status: "active",
};
const createInput: AccessCreateInput = {
  name: "Fixture access",
  kind: "personal",
  scopes: ["task-manager:read"],
  expiresInDays: 30,
};
const success = (data: unknown) =>
  new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("Access browser transport", () => {
  it("использует same-origin cookie/no-store и возвращает secret только из creation ответа", async () => {
    const requestFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(success({ token, secret: SECRET }));
    const api = new AccessApi(requestFetch);
    expect(await api.create(createInput)).toEqual({ token, secret: SECRET });
    expect(requestFetch).toHaveBeenCalledOnce();
    const [path, init] = requestFetch.mock.calls[0];
    expect(path).toBe("/api/access/tokens");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify(createInput),
    });
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(new Headers(init?.headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("читает только metadata и передаёт owner/cursor как query значения", async () => {
    const requestFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(success({ items: [token], nextCursor: null }));
    expect(
      await new AccessApi(requestFetch).tokens("12", "cursor&ownerId=1"),
    ).toEqual({ items: [token], nextCursor: null });
    expect(requestFetch.mock.calls[0][0]).toBe(
      "/api/access/tokens?ownerId=12&after=cursor%26ownerId%3D1",
    );
    expect(requestFetch.mock.calls[0][1]).toMatchObject({
      method: "GET",
      credentials: "same-origin",
    });
  });

  it.each([
    { items: [{ ...token, secret: SECRET }], nextCursor: null },
    { items: [{ ...token, record: { hash: SECRET } }], nextCursor: null },
    { items: [token], nextCursor: null, secret: SECRET },
  ])("отклоняет дополнительные закрытые поля metadata DTO", async (data) => {
    const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(success(data));
    const result = await new AccessApi(requestFetch)
      .tokens()
      .catch((error: unknown) => error);
    expect(result).toMatchObject({
      code: "INVALID_RESPONSE",
      uncertain: false,
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("не отражает code/message сервера или внутреннее исключение", async () => {
    const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: SECRET, message: SECRET },
        }),
        { status: 422 },
      ),
    );
    const result = await new AccessApi(requestFetch)
      .create(createInput)
      .catch((error: unknown) => error);
    expect(result).toMatchObject({ code: "REQUEST_FAILED", uncertain: false });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(String(result)).not.toContain(SECRET);
  });

  it("не повторяет создание после сетевой ошибки с неизвестным исходом", async () => {
    const requestFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(SECRET));
    const result = await new AccessApi(requestFetch)
      .create(createInput)
      .catch((error: unknown) => error);
    expect(result).toMatchObject({ code: "NETWORK_ERROR", uncertain: true });
    expect(String(result)).not.toContain(SECRET);
    expect(requestFetch).toHaveBeenCalledOnce();
  });

  it.each([500, 503])(
    "считает отказ mutation %s неизвестным исходом",
    async (status) => {
      const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "STORAGE_UNAVAILABLE", message: "Unavailable" },
          }),
          { status },
        ),
      );
      await expect(
        new AccessApi(requestFetch).create(createInput),
      ).rejects.toMatchObject({ uncertain: true });
      expect(requestFetch).toHaveBeenCalledOnce();
    },
  );

  it("сначала проверяет scopes/TTL и не вызывает сервер для неверного ввода", () => {
    const requestFetch = vi.fn<typeof fetch>();
    const api = new AccessApi(requestFetch);
    expect(() => api.create({ ...createInput, expiresInDays: 366 })).toThrow();
    expect(() => api.create({ ...createInput, scopes: [] })).toThrow();
    expect(requestFetch).not.toHaveBeenCalled();
  });

  it("device lookup остаётся GET до отдельного явного решения", async () => {
    const device = {
      userCode: "ABCD-EFGH",
      clientName: "CLI fixture",
      scopes: ["task-manager:read"],
      expiresAt: "2026-10-19T12:00:00.000Z",
      status: "pending",
    };
    const requestFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(success(device))
      .mockResolvedValueOnce(success({ ...device, status: "approved" }));
    const api = new AccessApi(requestFetch);
    expect(await api.device(device.userCode)).toEqual(device);
    expect(requestFetch).toHaveBeenCalledOnce();
    expect(requestFetch.mock.calls[0][1]).toMatchObject({ method: "GET" });
    expect(requestFetch.mock.calls[0][1]?.body).toBeUndefined();
    await api.decide({ userCode: device.userCode, decision: "approve" });
    expect(requestFetch.mock.calls[1][0]).toBe("/api/access/device/decision");
    expect(requestFetch.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ userCode: device.userCode, decision: "approve" }),
    });
  });

  it("не отправляет некорректный human code", () => {
    const requestFetch = vi.fn<typeof fetch>();
    expect(() => new AccessApi(requestFetch).device("AAAA-0000")).toThrow();
    expect(requestFetch).not.toHaveBeenCalled();
  });

  it("отзыв отправляет пустой JSON на конкретный token route", async () => {
    const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(
      success({
        ...token,
        status: "revoked",
        revokedAt: "2026-10-19T01:00:00.000Z",
      }),
    );
    await new AccessApi(requestFetch).revoke(ID);
    expect(requestFetch.mock.calls[0][0]).toBe(
      `/api/access/tokens/${ID}/revoke`,
    );
    expect(requestFetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: "{}",
    });
  });
});
