/**
 * @file tests/int/CodexAccountClient.adapter.int.spec.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Проверяет готовность аккаунта после OAuth-уведомлений Codex и безопасную классификацию отказов.
 */

// @vitest-environment node

import { setImmediate } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncQueue } from "../../packages/codex-adapter/src/AsyncQueue";
import type { RPCMessage } from "../../packages/codex-adapter/src/protocol";

const rpc = vi.hoisted(() => ({
  request: vi.fn(),
  close: vi.fn(),
  getNotifications: vi.fn(),
}));
vi.mock("../../packages/codex-adapter/src/JsonLineRpcClient.adapter", () => ({
  JsonLineRPCClient: class {
    start() {}
    notify() {}
    request = rpc.request;
    close = rpc.close;
    getNotifications = rpc.getNotifications;
  },
}));

import {
  CodexAccountClient,
  CodexLoginError,
} from "../../packages/codex-adapter/src/CodexAccountClient.adapter";

const loginID = "fixture-current-login";
const chatgptAccount = {
  type: "chatgpt",
  email: "fixture@example.test",
  planType: "plus",
};
let notifications: AsyncQueue<RPCMessage>;
let client: CodexAccountClient;
let cachedAccount: unknown;

beforeEach(async () => {
  cachedAccount = null;
  notifications = new AsyncQueue<RPCMessage>();
  rpc.getNotifications.mockReset().mockReturnValue(notifications);
  rpc.close.mockReset().mockImplementation(async () => notifications.end());
  rpc.request
    .mockReset()
    .mockImplementation(async (method: string) =>
      method === "account/read"
        ? { account: cachedAccount, requiresOpenaiAuth: true }
        : {},
    );
  client = await CodexAccountClient.connect({
    home: "/fixture-codex-account-profile",
    environment: { NODE_ENV: "test" },
  });
});

afterEach(async () => {
  await client.close();
});

describe("CodexAccountClient OAuth readiness", () => {
  it("читает аккаунт только после обновления native cache вслед за успешным входом", async () => {
    const settled = vi.fn();
    const result = client.waitForLogin(loginID).then(async (success) => {
      settled(success);
      return success ? await client.readAccount() : null;
    });

    // CLI сначала подтверждает OAuth, затем reload обновляет ранее пустой auth cache.
    notifications.push({
      method: "account/login/completed",
      params: { loginId: loginID, success: true },
    });
    await setImmediate();
    expect(settled).not.toHaveBeenCalled();
    expect(
      rpc.request.mock.calls.some(([method]) => method === "account/read"),
    ).toBe(false);

    cachedAccount = chatgptAccount;
    notifications.push({
      method: "account/updated",
      params: { authMode: "chatgpt", planType: "plus" },
    });
    await expect(result).resolves.toEqual(chatgptAccount);
    expect(rpc.request).toHaveBeenLastCalledWith("account/read", {
      refreshToken: false,
    });
  });

  it("игнорирует раннее обновление, чужой loginId и другой способ авторизации", async () => {
    notifications.push({
      method: "account/updated",
      params: { authMode: "chatgpt", planType: "plus" },
    });
    notifications.push({
      method: "account/login/completed",
      params: {
        loginId: "fixture-other-login",
        success: false,
        error: "fixture-other-rejection",
      },
    });
    notifications.push({
      method: "account/login/completed",
      params: { loginId: loginID, success: true },
    });
    const settled = vi.fn();
    const result = client.waitForLogin(loginID).then(settled);
    await setImmediate();
    expect(settled).not.toHaveBeenCalled();

    notifications.push({
      method: "account/updated",
      params: { authMode: "apikey", planType: null },
    });
    await setImmediate();
    expect(settled).not.toHaveBeenCalled();

    notifications.push({
      method: "account/updated",
      params: { authMode: "chatgpt", planType: "plus" },
    });
    await result;
    expect(settled).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("не подтверждает готовность, если очередь завершилась до обновления аккаунта", async () => {
    notifications.push({
      method: "account/login/completed",
      params: { loginId: loginID, success: true },
    });
    notifications.end();
    await expect(client.waitForLogin(loginID)).resolves.toBe(false);
  });

  it.each([
    ["Connection timed out: fixture-private-detail", "network_failed"],
    ["invalid_grant: fixture-private-detail", "code_expired"],
    ["Device login disabled: fixture-private-detail", "device_auth_disabled"],
    ["fixture-private-detail", "provider_rejected"],
  ])("возвращает безопасный код отказа %s", async (error, code) => {
    notifications.push({
      method: "account/login/completed",
      params: { loginId: loginID, success: false, error },
    });
    const failure: unknown = await client
      .waitForLogin(loginID)
      .catch((reason: unknown) => reason);
    expect(failure).toBeInstanceOf(CodexLoginError);
    expect(failure).toMatchObject({ code });
    expect(String(failure)).not.toContain("fixture-private-detail");
    expect(JSON.stringify(failure)).not.toContain("fixture-private-detail");
    expect(failure).not.toHaveProperty("cause");
  });

  it.each([{}, { account: null }])(
    "принимает отсутствующий или null account из штатного ответа",
    async (response) => {
      rpc.request.mockResolvedValue({ ...response, requiresOpenaiAuth: true });
      await expect(client.readAccount()).resolves.toBeNull();
    },
  );
});
