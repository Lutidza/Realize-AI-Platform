/**
 * @file tests/int/CodexBrowserLogin.adapter.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет привязку браузерного callback Codex, однократность и запрет чужих адресов.
 */

// @vitest-environment node

import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexBrowserLoginAdapter } from "../../packages/codex-adapter/src/CodexBrowserLogin.adapter";

const state = "fixture-state-1234567890";
const callback = `http://localhost:1455/auth/callback?code=fixture-code&state=${state}`;
const result = {
  type: "chatgpt",
  loginId: "fixture-login",
  authUrl: `https://auth.openai.com/oauth/authorize?redirect_uri=${encodeURIComponent("http://localhost:1455/auth/callback")}&state=${state}`,
};
const adapters: CodexBrowserLoginAdapter[] = [];
const open = async () => {
  const adapter = new CodexBrowserLoginAdapter();
  adapters.push(adapter);
  await adapter.reserve();
  adapter.accept(result);
  return adapter;
};
afterEach(() => {
  adapters.splice(0).forEach((adapter) => adapter.close());
  vi.unstubAllGlobals();
});

describe("CodexBrowserLoginAdapter", () => {
  it("пересылает собственный код только фиксированному loopback без follow и запрещает replay", async () => {
    const adapter = await open();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);
    await adapter.complete(callback);
    const [target, options] = fetchMock.mock.calls[0];
    expect(String(target)).toBe(
      `http://127.0.0.1:1455/auth/callback?code=fixture-code&state=${state}`,
    );
    expect(options).toMatchObject({ redirect: "manual", cache: "no-store" });
    await expect(adapter.complete(callback)).rejects.toThrow(
      "Ссылка завершения входа недействительна",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    callback.replace(state, "other-state-1234567890"),
    callback.replace("localhost", "example.com"),
    callback.replace("http:", "https:"),
    callback.replace(":1455", ":1456"),
    callback.replace("/auth/callback", "/shutdown"),
    callback.replace("localhost", "user@localhost"),
    `${callback}#fragment`,
    `${callback}&state=${state}`,
    `${callback}&redirect_uri=https://example.com`,
    `${callback}&code=another-code`,
    callback.replace("code=fixture-code", "code="),
    callback.replace("code=fixture-code", "error=access_denied"),
    "x".repeat(16_385),
  ])(
    "отказывает неподходящему callback без HTTP или раскрытия кода",
    async (url) => {
      const adapter = await open();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(adapter.complete(url)).rejects.toThrow(
        "Ссылка завершения входа недействительна",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("резервирует callback до ответа и не выдаёт транспортную ошибку", async () => {
    const adapter = await open();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error("fixture-secret-code"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(adapter.complete(callback)).rejects.toThrow(
      "Ссылка завершения входа недействительна",
    );
    await expect(adapter.complete(callback)).rejects.toThrow(
      "Ссылка завершения входа недействительна",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("не запускает второй login до закрытия первого и очищает callback при close", async () => {
    const first = await open();
    const second = new CodexBrowserLoginAdapter();
    adapters.push(second);
    await expect(second.reserve()).rejects.toThrow("Другой браузерный вход");
    second.close();
    await expect(second.reserve()).rejects.toThrow("Другой браузерный вход");
    first.close();
    await expect(first.complete(callback)).rejects.toThrow(
      "Ссылка завершения входа недействительна",
    );
    await second.reserve();
    expect(second.accept(result)).toMatchObject({ loginID: "fixture-login" });
  });

  it("не пытается вытеснить уже занятый сторонним процессом callback-порт", async () => {
    const listener = createServer();
    await new Promise<void>((resolve, reject) => {
      listener.once("error", reject);
      listener.listen({ host: "127.0.0.1", port: 1455 }, resolve);
    });
    try {
      const adapter = new CodexBrowserLoginAdapter();
      adapters.push(adapter);
      await expect(adapter.reserve()).rejects.toThrow(
        "Порт браузерного входа Codex занят",
      );
      expect(listener.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
    await open();
  });

  it.each([
    {
      ...result,
      authUrl: result.authUrl.replace("auth.openai.com", "example.com"),
    },
    { ...result, authUrl: result.authUrl.replace("https:", "http:") },
    { ...result, authUrl: result.authUrl.replace("1455", "1456") },
    { ...result, authUrl: `${result.authUrl}&state=another` },
    { ...result, type: "chatgptAuthTokens" },
  ])("отказывает подменённому ответу запуска OAuth", async (value) => {
    const adapter = new CodexBrowserLoginAdapter();
    adapters.push(adapter);
    await adapter.reserve();
    expect(() => adapter.accept(value)).toThrow("неподдерживаемый ответ");
  });
});
