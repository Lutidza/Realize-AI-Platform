/**
 * @file packages/codex-adapter/src/CodexAccountClient.adapter.ts
 * @version 1.1.1
 * @date 2026-09-09
 * @description Выполняет официальный протокол авторизации в отдельном временном профиле Codex.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  prepareCodexProfile,
  readCodexProfileAuth,
} from "@realize/codex-adapter/profile";
import type {
  CodexAccountClientOptions,
  CodexAccountInfo,
  CodexAccountProfile,
  CodexDeviceLogin,
  CodexBrowserLogin,
} from "./CodexAccount.types";
import { CodexBrowserLoginAdapter } from "./CodexBrowserLogin.adapter";
import { CodexLoginError } from "./CodexLogin.error";
import { classifyCodexLoginFailure } from "./classifyCodexLoginFailure.util";
import { JsonLineRPCClient } from "./JsonLineRpcClient.adapter";

export { CodexLoginError } from "./CodexLogin.error";

/** Владеет процессом и временным профилем; close обязателен при любом исходе. */
export class CodexAccountClient {
  private readonly browserLogin = new CodexBrowserLoginAdapter();
  private constructor(
    private readonly client: JsonLineRPCClient,
    private readonly home: string,
    private readonly temporary = false,
  ) {}

  static async open(
    options: CodexAccountClientOptions,
  ): Promise<CodexAccountClient> {
    const home = await mkdtemp(join(tmpdir(), "realize-codex-auth-"));
    let client: JsonLineRPCClient | undefined;
    try {
      const environment = await prepareCodexProfile({ ...options, home });
      client = new JsonLineRPCClient({
        codexBinary: options.codexBinary,
        environment,
        workingDirectory: home,
      });
      await this.initialize(client);
      return new CodexAccountClient(client, home, true);
    } catch {
      await client?.close();
      await rm(home, { recursive: true, force: true });
      throw new Error(
        "Не удалось запустить авторизацию Codex. Проверьте установку CLI на сервере.",
      );
    }
  }

  /** Подключается к профилю, чей lock и credential lifecycle принадлежат вызывающему сервису. */
  static async connect(
    profile: CodexAccountProfile,
  ): Promise<CodexAccountClient> {
    const client = new JsonLineRPCClient({
      codexBinary: profile.codexBinary,
      environment: profile.environment,
      signal: profile.signal,
      workingDirectory: profile.home,
    });
    try {
      await this.initialize(client);
      return new CodexAccountClient(client, profile.home);
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  private static async initialize(client: JsonLineRPCClient): Promise<void> {
    client.start();
    await client.request("initialize", {
      capabilities: null,
      clientInfo: { name: "realize-codex-auth", version: "1.0.0" },
    });
    client.notify("initialized");
  }

  async loginWithAPIKey(apiKey: string): Promise<void> {
    await this.client.request("account/login/start", {
      type: "apiKey",
      apiKey,
    });
  }

  async startDeviceLogin(): Promise<CodexDeviceLogin> {
    const result = await this.client.request<Record<string, unknown>>(
      "account/login/start",
      { type: "chatgptDeviceCode" },
    );
    if (
      result.type !== "chatgptDeviceCode" ||
      typeof result.loginId !== "string" ||
      !result.loginId ||
      typeof result.userCode !== "string" ||
      !/^[A-Za-z0-9-]{4,32}$/.test(result.userCode) ||
      result.verificationUrl !== "https://auth.openai.com/codex/device"
    )
      throw new Error("Codex вернул неподдерживаемый ответ авторизации.");
    return {
      loginID: result.loginId,
      userCode: result.userCode,
      verificationURL: result.verificationUrl,
    };
  }

  async startBrowserLogin(): Promise<CodexBrowserLogin> {
    await this.browserLogin.reserve();
    try {
      const result = await this.client.request<Record<string, unknown>>(
        "account/login/start",
        { type: "chatgpt", useHostedLoginSuccessPage: true, appBrand: "codex" },
      );
      return this.browserLogin.accept(result);
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  /** CMS пересылает собственному CLI callback после owner-проверки защищённого POST. */
  async completeBrowserLogin(callbackURL: string): Promise<void> {
    await this.browserLogin.complete(callbackURL);
  }

  async waitForLogin(loginID: string): Promise<boolean> {
    let isCompleted = false;
    for await (const message of this.client.getNotifications()) {
      if (
        message.method === "account/login/completed" &&
        message.params?.loginId === loginID
      ) {
        if (message.params.success !== true)
          throw new CodexLoginError(
            classifyCodexLoginFailure(message.params.error),
          );
        isCompleted = true;
      }
      // CLI сообщает completed до обновления auth cache; updated подтверждает готовность account/read.
      if (
        isCompleted &&
        message.method === "account/updated" &&
        message.params?.authMode === "chatgpt"
      )
        return true;
    }
    return false;
  }

  async cancelLogin(loginID: string): Promise<void> {
    await this.client.request("account/login/cancel", { loginId: loginID });
  }

  async readAccount(refreshToken = false): Promise<CodexAccountInfo | null> {
    const { account } = await this.client.request<{ account: unknown }>(
      "account/read",
      { refreshToken },
    );
    if (account === null || account === undefined) return null;
    if (!account || typeof account !== "object")
      throw new Error("Некорректный ответ аккаунта Codex.");
    const value = account as Record<string, unknown>;
    if (value.type === "apiKey") return { type: "apiKey" };
    if (
      value.type === "chatgpt" &&
      (value.email === null || typeof value.email === "string") &&
      typeof value.planType === "string"
    ) {
      return { type: "chatgpt", email: value.email, planType: value.planType };
    }
    throw new Error("Некорректный ответ аккаунта Codex.");
  }

  async checkAccountAccess(): Promise<void> {
    await this.client.request("account/rateLimits/read");
  }

  /** Возвращает секрет только серверному vault; запрещено передавать результат в DTO. */
  async readCredential(): Promise<string> {
    return await readCodexProfileAuth(this.home);
  }

  async close(): Promise<void> {
    try {
      await this.client.close();
    } finally {
      this.browserLogin.close();
      if (this.temporary) await rm(this.home, { recursive: true, force: true });
    }
  }
}
