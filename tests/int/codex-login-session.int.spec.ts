/**
 * @file tests/int/codex-login-session.int.spec.ts
 * @version 1.1.1
 * @date 2026-09-09
 * @description Проверяет владельца, повторы, отмену и ограничение времени авторизации Codex.
 */

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexIntegrationConnectionDTO } from "@realize/ai-contracts";
import { EventEmitter } from "node:events";
import type { Pool, PoolClient } from "pg";
import type { CodexLoginResources } from "../../packages/payload-ai-plugin/src/integrations/codex/CodexLoginSession.types";
import { acquireCodexBrowserLoginLock } from "../../packages/payload-ai-plugin/src/integrations/codex/CodexBrowserLoginLock.adapter";

const account = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@realize/codex-adapter/account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@realize/codex-adapter/account")>()),
  CodexAccountClient: account,
}));

import { CodexLoginSessionService } from "../../packages/payload-ai-plugin/src/integrations/codex/CodexLoginSession.service";
import { CodexLoginError } from "@realize/codex-adapter/account";

const owner = { actorKey: "users:1", installationKey: "installation-a" };
const input = { enabled: true, expectedRevision: 0 };
const connection = {
  provider: "codex",
  revision: 1,
  configuration: { authMode: "chatgpt" },
} as CodexIntegrationConnectionDTO;

const createClient = () => {
  let finish!: (success: boolean) => void;
  const result = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  return {
    finish,
    startDeviceLogin: vi.fn(async () => ({
      loginID: "native-id",
      userCode: "ABCD-1234",
      verificationURL: "https://auth.openai.com/codex/device",
    })),
    startBrowserLogin: vi.fn(async () => ({
      loginID: "browser-native-id",
      authorizationURL:
        "https://auth.openai.com/oauth/authorize?state=synthetic-state",
    })),
    completeBrowserLogin: vi.fn(async (): Promise<void> => undefined),
    waitForLogin: vi.fn(() => result),
    readAccount: vi.fn(async () => ({
      type: "chatgpt",
      email: "admin@example.test",
      planType: "plus",
    })),
    readCredential: vi.fn(async () => "private-native-credential"),
    cancelLogin: vi.fn(async () => {
      finish(false);
    }),
    close: vi.fn(async () => undefined),
  };
};

/** Подмена PostgreSQL различает занятый listener и session, которую можно вернуть в pool. */
const createBrowserLockPool = () => {
  let held = false;
  const makeClient = () => {
    let owned = false;
    return Object.assign(new EventEmitter(), {
      query: vi.fn(async (sql: string) => {
        expect(sql).toContain("realize:codex:browser-login:1455");
        if (sql.includes("pg_try_advisory_lock")) {
          owned = !held;
          if (owned) held = true;
          return { rows: [{ locked: owned }] };
        }
        expect(sql).toContain("pg_advisory_unlock");
        if (owned) held = false;
        owned = false;
        return { rows: [] };
      }),
      release: vi.fn((destroy?: boolean) => {
        if (destroy && owned) held = false;
      }),
    });
  };
  const clients: ReturnType<typeof makeClient>[] = [];
  const connect = vi.fn(async () => {
    const client = makeClient();
    clients.push(client);
    return client as unknown as PoolClient;
  });
  const pool = { connect } as unknown as Pick<Pool, "connect">;
  return {
    clients,
    connect,
    pool,
    held: () => held,
    resources: { acquireBrowserLock: () => acquireCodexBrowserLoginLock(pool) },
  };
};

describe("Codex managed login lifecycle", () => {
  let client: ReturnType<typeof createClient>;
  let resources: CodexLoginResources;
  beforeEach(() => {
    vi.useFakeTimers();
    account.open.mockReset();
    client = createClient();
    account.open.mockResolvedValue(client);
    resources = {
      acquireBrowserLock: async () => ({
        signal: new AbortController().signal,
        release: vi.fn(async () => undefined),
      }),
    };
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("replays one start and keeps credentials outside pending DTO", async () => {
    const service = new CodexLoginSessionService();
    const first = await service.start(owner, input, "start-one");
    const replay = await service.start(owner, input, "start-one");
    expect(replay).toEqual(first);
    expect(account.open).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toContain("credential");
    expect(first).toMatchObject({
      loginMethod: "deviceCode",
      userCode: "ABCD-1234",
    });
    await expect(
      service.start(owner, { ...input, enabled: false }, "start-one"),
    ).rejects.toMatchObject({ status: 409 });
    await service.cancel(owner, first.sessionID);
  });

  it("does not expose another administrator or installation session", async () => {
    const service = new CodexLoginSessionService();
    const { sessionID } = await service.start(owner, input, "start-two");
    const save = vi.fn();
    await expect(
      service.status({ ...owner, actorKey: "users:2" }, sessionID, save),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.cancel({ ...owner, installationKey: "other" }, sessionID),
    ).rejects.toMatchObject({ status: 404 });
    expect(save).not.toHaveBeenCalled();
    expect(client.cancelLogin).not.toHaveBeenCalled();
    await service.cancel(owner, sessionID);
  });

  it("persists completed credentials once even with concurrent polling", async () => {
    const service = new CodexLoginSessionService();
    const { sessionID } = await service.start(owner, input, "start-three");
    client.finish(true);
    await vi.advanceTimersByTimeAsync(0);
    const save = vi.fn(async () => connection);
    const responses = await Promise.all([
      service.status(owner, sessionID, save),
      service.status(owner, sessionID, save),
    ]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ authJSON: "private-native-credential", input }),
    );
    expect(responses).toEqual([
      { status: "completed", connection },
      { status: "completed", connection },
    ]);
    expect(JSON.stringify(responses)).not.toContain("private-native");
    expect(client.close).toHaveBeenCalled();
  });

  it("expires unattended login and closes its process", async () => {
    const service = new CodexLoginSessionService();
    const { sessionID } = await service.start(owner, input, "start-four");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const save = vi.fn();
    expect(await service.status(owner, sessionID, save)).toMatchObject({
      status: "failed",
    });
    expect(save).not.toHaveBeenCalled();
    expect(client.cancelLogin).toHaveBeenCalledWith("native-id");
    expect(client.close).toHaveBeenCalled();
  });

  it("distinguishes account and credential failures without leaking their causes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const firstService = new CodexLoginSessionService();
    client.readAccount.mockRejectedValueOnce(new Error("secret-account-reply"));
    const first = await firstService.start(owner, input, "account-failure");
    client.finish(true);
    await vi.advanceTimersByTimeAsync(0);
    const persist = vi.fn();
    const accountFailure = await firstService.status(
      owner,
      first.sessionID,
      persist,
    );
    expect(accountFailure).toMatchObject({
      status: "failed",
      message: expect.stringContaining("прочитать аккаунт"),
    });
    const secondClient = createClient();
    account.open.mockResolvedValueOnce(secondClient);
    secondClient.readCredential.mockRejectedValueOnce(
      new Error("secret-auth-file-content"),
    );
    const secondService = new CodexLoginSessionService();
    const second = await secondService.start(
      owner,
      input,
      "credential-failure",
    );
    secondClient.finish(true);
    await vi.advanceTimersByTimeAsync(0);
    const credentialFailure = await secondService.status(
      owner,
      second.sessionID,
      persist,
    );
    expect(credentialFailure).toMatchObject({
      status: "failed",
      message: expect.stringContaining("получить сохранённые данные"),
    });
    expect(persist).not.toHaveBeenCalled();
    expect(
      JSON.stringify([accountFailure, credentialFailure, warn.mock.calls]),
    ).not.toContain("secret-");
    expect(warn).toHaveBeenCalledWith("Codex login failed", {
      stage: "account",
      method: "deviceCode",
      reason: "login_stage_failed",
    });
    expect(warn).toHaveBeenCalledWith("Codex login failed", {
      stage: "credential",
      method: "deviceCode",
      reason: "login_stage_failed",
    });
    warn.mockRestore();
  });

  it("reports a classified provider refusal and releases the pending login", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    client.waitForLogin.mockRejectedValueOnce(
      new CodexLoginError("network_failed"),
    );
    const service = new CodexLoginSessionService();
    const pending = await service.start(owner, input, "provider-failure");
    await vi.advanceTimersByTimeAsync(0);
    const persist = vi.fn();
    expect(
      await service.status(owner, pending.sessionID, persist),
    ).toMatchObject({
      status: "failed",
      message: expect.stringContaining("соединение с OpenAI"),
    });
    expect(persist).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("Codex login failed", {
      stage: "confirmation",
      method: "deviceCode",
      reason: "network_failed",
    });
    warn.mockRestore();
  });

  it("starts a new owned login after a lost page without waiting for expiry", async () => {
    const service = new CodexLoginSessionService();
    const previous = await service.start(owner, input, "start-five");
    const replacementClient = createClient();
    account.open.mockResolvedValue(replacementClient);
    const replacement = await service.start(owner, input, "start-six");
    expect(previous.sessionID).not.toEqual(replacement.sessionID);
    expect(client.cancelLogin).toHaveBeenCalled();
    expect(
      await service.status(owner, previous.sessionID, vi.fn()),
    ).toMatchObject({ status: "failed" });
    await service.cancel(owner, replacement.sessionID);
  });

  it("redacts provider failures and does not save cancelled login", async () => {
    const service = new CodexLoginSessionService();
    const pending = await service.start(owner, input, "start-seven");
    await service.cancel(owner, pending.sessionID);
    const save = vi.fn();
    const result = await service.status(owner, pending.sessionID, save);
    expect(result).toMatchObject({ status: "failed" });
    expect(save).not.toHaveBeenCalled();
    account.open.mockRejectedValue(new Error("secret-native-oauth-error"));
    await expect(
      service.start(owner, input, "start-eight"),
    ).rejects.not.toThrow("secret-native-oauth-error");
  });

  it("reserves owner while replacing a login with slow process cleanup", async () => {
    const service = new CodexLoginSessionService();
    await service.start(owner, input, "start-old");
    let release!: () => void;
    client.cancelLogin.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const nextClient = createClient();
    account.open.mockResolvedValue(nextClient);
    const first = service.start(owner, input, "start-new");
    const retry = service.start(owner, input, "start-new");
    await expect(
      service.start(owner, input, "different-key"),
    ).rejects.toMatchObject({ status: 409 });
    release();
    const [one, two] = await Promise.all([first, retry]);
    expect(one.sessionID).toBe(two.sessionID);
    expect(account.open).toHaveBeenCalledTimes(2);
    await service.cancel(owner, one.sessionID);
  });

  it("returns browser authorization URL without device fields and persists its method", async () => {
    const service = new CodexLoginSessionService();
    const browserInput = { ...input, loginMethod: "browser" as const };
    const pending = await service.start(
      owner,
      browserInput,
      "browser-one",
      resources,
    );
    expect(pending).toMatchObject({
      loginMethod: "browser",
      authorizationURL: expect.stringContaining("https://auth.openai.com/"),
    });
    expect(pending).not.toHaveProperty("userCode");
    expect(pending).not.toHaveProperty("verificationURL");
    expect(client.startDeviceLogin).not.toHaveBeenCalled();
    await expect(
      service.start(owner, input, "browser-one"),
    ).rejects.toMatchObject({ status: 409 });
    client.finish(true);
    await vi.advanceTimersByTimeAsync(0);
    const persist = vi.fn(async () => connection);
    expect(await service.status(owner, pending.sessionID, persist)).toEqual({
      status: "completed",
      connection,
    });
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ input: browserInput }),
    );
  });

  it("checks callback session owner, coalesces relay and redacts callback errors", async () => {
    const service = new CodexLoginSessionService();
    const pending = await service.start(
      owner,
      { ...input, loginMethod: "browser" },
      "browser-two",
      resources,
    );
    const callback =
      "http://localhost:1455/auth/callback?state=synthetic-state&code=synthetic-code";
    const persist = vi.fn(async () => connection);
    await expect(
      service.completeBrowser(
        { ...owner, actorKey: "users:2" },
        pending.sessionID,
        callback,
        persist,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(client.completeBrowserLogin).not.toHaveBeenCalled();
    client.completeBrowserLogin.mockRejectedValueOnce(
      new Error("private-callback-code"),
    );
    await expect(
      service.completeBrowser(owner, pending.sessionID, callback, persist),
    ).rejects.not.toThrow("private-callback-code");
    let finishRelay!: () => void;
    client.completeBrowserLogin.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRelay = resolve;
        }),
    );
    const first = service.completeBrowser(
      owner,
      pending.sessionID,
      callback,
      persist,
    );
    const retry = service.completeBrowser(
      owner,
      pending.sessionID,
      callback,
      persist,
    );
    await expect(
      service.cancel(owner, pending.sessionID),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.start(
        owner,
        { ...input, loginMethod: "browser" },
        "browser-replacement",
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.completeBrowser(
        owner,
        pending.sessionID,
        `${callback}x`,
        persist,
      ),
    ).rejects.toMatchObject({ status: 409 });
    finishRelay();
    expect(await first).toEqual(pending);
    expect(await retry).toEqual(pending);
    expect(client.completeBrowserLogin).toHaveBeenCalledTimes(2);
    expect(
      await service.completeBrowser(
        owner,
        pending.sessionID,
        callback,
        persist,
      ),
    ).toEqual(pending);
    expect(client.completeBrowserLogin).toHaveBeenCalledTimes(2);
    await service.cancel(owner, pending.sessionID);
  });

  it("rejects relay for device flow and never relays an expired browser attempt", async () => {
    const service = new CodexLoginSessionService();
    const device = await service.start(owner, input, "device-relay");
    await expect(
      service.completeBrowser(
        owner,
        device.sessionID,
        "synthetic-callback",
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await service.cancel(owner, device.sessionID);
    client = createClient();
    account.open.mockResolvedValue(client);
    const browser = await service.start(
      owner,
      { ...input, loginMethod: "browser" },
      "browser-expired",
      resources,
    );
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(
      await service.completeBrowser(
        owner,
        browser.sessionID,
        "synthetic-callback",
        vi.fn(),
      ),
    ).toMatchObject({ status: "failed" });
    expect(client.completeBrowserLogin).not.toHaveBeenCalled();
  });

  it("сериализует browser login двух серверных реестров и освобождает lock после закрытия client до persist", async () => {
    const database = createBrowserLockPool();
    const first = new CodexLoginSessionService();
    const second = new CodexLoginSessionService();
    const browser = { ...input, loginMethod: "browser" as const };
    const pending = await first.start(
      owner,
      browser,
      "database-one",
      database.resources,
    );
    await expect(
      second.start(
        { ...owner, actorKey: "users:2" },
        browser,
        "database-two",
        database.resources,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(account.open).toHaveBeenCalledOnce();
    expect(database.clients[1].release).toHaveBeenCalledExactlyOnceWith(false);
    let finishClose!: () => void;
    client.close.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          finishClose = () => resolve(undefined);
        }),
    );
    client.finish(true);
    await vi.advanceTimersByTimeAsync(0);
    const persist = vi.fn(async () => {
      expect(database.held()).toBe(false);
      expect(database.clients[0].release).toHaveBeenCalledOnce();
      return connection;
    });
    expect(await first.status(owner, pending.sessionID, persist)).toMatchObject(
      { status: "pending" },
    );
    expect(database.held()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    finishClose();
    await vi.advanceTimersByTimeAsync(0);
    expect(await first.status(owner, pending.sessionID, persist)).toEqual({
      status: "completed",
      connection,
    });
    expect(client.close).toHaveBeenCalledOnce();
    expect(database.clients[0].query).toHaveBeenCalledTimes(2);
    expect(database.clients[0].release).toHaveBeenCalledExactlyOnceWith(false);
    account.open.mockResolvedValue(createClient());
    const next = await second.start(
      { ...owner, actorKey: "users:2" },
      browser,
      "database-three",
      database.resources,
    );
    expect(database.held()).toBe(true);
    await second.cancel({ ...owner, actorKey: "users:2" }, next.sessionID);
    expect(database.held()).toBe(false);
  });

  it.each(["cancel", "expire", "disconnect"] as const)(
    "закрывает client и ровно один DB lease при %s",
    async (reason) => {
      const database = createBrowserLockPool();
      const service = new CodexLoginSessionService();
      const pending = await service.start(
        owner,
        { ...input, loginMethod: "browser" },
        `database-${reason}`,
        database.resources,
      );
      if (reason === "cancel") await service.cancel(owner, pending.sessionID);
      if (reason === "expire") await vi.advanceTimersByTimeAsync(10 * 60_000);
      if (reason === "disconnect") {
        database.clients[0].emit("end");
        await vi.advanceTimersByTimeAsync(0);
      }
      const persist = vi.fn();
      expect(
        await service.status(owner, pending.sessionID, persist),
      ).toMatchObject({ status: "failed" });
      expect(
        await service.completeBrowser(
          owner,
          pending.sessionID,
          "synthetic-callback",
          persist,
        ),
      ).toMatchObject({ status: "failed" });
      expect(persist).not.toHaveBeenCalled();
      expect(client.completeBrowserLogin).not.toHaveBeenCalled();
      expect(client.close).toHaveBeenCalledOnce();
      expect(database.clients[0].release).toHaveBeenCalledExactlyOnceWith(
        reason === "disconnect",
      );
      expect(database.clients[0].listenerCount("error")).toBe(0);
      expect(database.clients[0].listenerCount("end")).toBe(0);
      expect(database.held()).toBe(false);
    },
  );

  it("не открывает browser flow без DB lock и освобождает lock после ошибки открытия Codex", async () => {
    const service = new CodexLoginSessionService();
    const browser = { ...input, loginMethod: "browser" as const };
    await expect(
      service.start(owner, browser, "database-missing"),
    ).rejects.toMatchObject({ status: 503 });
    expect(account.open).not.toHaveBeenCalled();
    const database = createBrowserLockPool();
    account.open.mockRejectedValue(new Error("private-provider-detail"));
    await expect(
      service.start(
        owner,
        browser,
        "database-open-failure",
        database.resources,
      ),
    ).rejects.not.toThrow("private-provider-detail");
    expect(database.held()).toBe(false);
    expect(database.clients[0].release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("TTL во время открытия client ждёт cleanup и не запускает просроченный browser flow", async () => {
    const database = createBrowserLockPool();
    const service = new CodexLoginSessionService();
    let resolveOpen!: (value: ReturnType<typeof createClient>) => void;
    account.open.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const start = service.start(
      owner,
      { ...input, loginMethod: "browser" },
      "database-slow-open",
      database.resources,
    );
    const failure = expect(start).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(database.held()).toBe(true);
    resolveOpen(client);
    await failure;
    expect(client.startBrowserLogin).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalledOnce();
    expect(database.clients[0].release).toHaveBeenCalledOnce();
    expect(database.held()).toBe(false);
  });

  it("уничтожает DB session при неопределённом acquire или ошибке unlock", async () => {
    const database = createBrowserLockPool();
    const raw = await database.connect();
    database.connect.mockResolvedValue(raw);
    database.clients[0].query.mockRejectedValueOnce(
      new Error("private-driver-detail"),
    );
    await expect(
      acquireCodexBrowserLoginLock(database.pool),
    ).rejects.not.toThrow("private-driver-detail");
    expect(database.clients[0].release).toHaveBeenCalledExactlyOnceWith(true);
    const next = createBrowserLockPool();
    const lock = await acquireCodexBrowserLoginLock(next.pool);
    next.clients[0].query.mockRejectedValueOnce(
      new Error("private-unlock-detail"),
    );
    await lock.release();
    await lock.release();
    expect(next.clients[0].release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("ошибка release завершает попытку безопасно и не сохраняет credential", async () => {
    const service = new CodexLoginSessionService();
    const release = vi
      .fn()
      .mockRejectedValue(new Error("private-release-detail"));
    const pending = await service.start(
      owner,
      { ...input, loginMethod: "browser" },
      "database-release-failure",
      {
        acquireBrowserLock: async () => ({
          signal: new AbortController().signal,
          release,
        }),
      },
    );
    client.finish(true);
    await vi.advanceTimersByTimeAsync(0);
    const persist = vi.fn();
    const result = await service.status(owner, pending.sessionID, persist);
    expect(result).toMatchObject({ status: "failed" });
    expect(JSON.stringify(result)).not.toContain("private-release-detail");
    expect(persist).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    await expect(
      service.status(owner, pending.sessionID, persist),
    ).rejects.toMatchObject({ status: 404 });
  });
});
