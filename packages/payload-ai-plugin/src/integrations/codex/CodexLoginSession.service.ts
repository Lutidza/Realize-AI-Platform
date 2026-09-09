/**
 * @file packages/payload-ai-plugin/src/integrations/codex/CodexLoginSession.service.ts
 * @version 1.1.1
 * @date 2026-09-09
 * @description Ограничивает жизненный цикл входа ChatGPT, владельца сессии и однократное сохранение.
 */

import { createHash, randomUUID } from "node:crypto";
import type {
  CodexLoginPendingDTO,
  CodexLoginStatusDTO,
  StartCodexLoginInput,
} from "@realize/ai-contracts";
import {
  CodexAccountClient,
  CodexLoginError,
} from "@realize/codex-adapter/account";
import { EndpointError } from "../../endpoints/http";
import type {
  CodexLoginOwner,
  CodexLoginResources,
  CodexLoginSession,
  CodexLoginStartReservation,
  PersistCodexLogin,
} from "./CodexLoginSession.types";

const LOGIN_TTL_MS = 10 * 60_000;
const RESULT_TTL_MS = 2 * 60_000;
const MAX_SESSIONS = 32;
const MAX_ACTIVE = 8;

/** Pending-вход живёт на обслуживающем сервере; при его перезапуске вход повторяется. */
export class CodexLoginSessionService {
  private readonly sessions = new Map<string, CodexLoginSession>();
  private readonly starting = new Map<string, CodexLoginStartReservation>();

  async start(
    owner: CodexLoginOwner,
    input: StartCodexLoginInput,
    idempotencyKey: string,
    resources: CodexLoginResources = {},
  ): Promise<CodexLoginPendingDTO> {
    const ownerKey = JSON.stringify([owner.installationKey, owner.actorKey]);
    const inputKey = JSON.stringify(input);
    const reserved = this.starting.get(ownerKey);
    if (reserved) {
      if (
        reserved.idempotencyKey !== idempotencyKey ||
        reserved.inputKey !== inputKey
      )
        throw new EndpointError(
          "CONFLICT",
          "Предыдущий запрос входа ещё выполняется. Повторите позже.",
          409,
        );
      return await reserved.promise;
    }
    // Резервирование охватывает и ожидание закрытия предыдущего процесса входа.
    const promise = this.startOwned(owner, input, idempotencyKey, resources);
    this.starting.set(ownerKey, { idempotencyKey, inputKey, promise });
    try {
      return await promise;
    } finally {
      this.starting.delete(ownerKey);
    }
  }

  private async startOwned(
    owner: CodexLoginOwner,
    input: StartCodexLoginInput,
    idempotencyKey: string,
    resources: CodexLoginResources,
  ): Promise<CodexLoginPendingDTO> {
    const owned = [...this.sessions.values()].filter((session) =>
      this.sameOwner(session.owner, owner),
    );
    const replay = owned.find(
      (session) => session.idempotencyKey === idempotencyKey,
    );
    if (replay) {
      if (JSON.stringify(replay.input) !== JSON.stringify(input))
        throw new EndpointError(
          "CONFLICT",
          "Этот запрос входа уже использован с другими настройками.",
          409,
        );
      if (replay.state === "failed")
        throw new EndpointError(
          "CONFLICT",
          "Попытка входа завершилась. Начните новый вход.",
          409,
        );
      return await replay.opening!;
    }
    if (
      owned.some(
        (session) =>
          session.state === "starting" ||
          session.completing ||
          (session.finalizing &&
            session.state !== "completed" &&
            session.state !== "failed"),
      )
    )
      throw new EndpointError(
        "CONFLICT",
        "Предыдущий запрос входа ещё выполняется. Повторите позже.",
        409,
      );
    for (const [previousID, previous] of this.sessions) {
      if (
        this.sameOwner(previous.owner, owner) &&
        (previous.state === "pending" || previous.state === "ready")
      ) {
        await this.fail(previousID, previous, "Начата новая попытка входа.");
      }
    }
    const active = [...this.sessions.values()].filter(
      (session) => session.state !== "failed" && session.state !== "completed",
    ).length;
    if (active >= MAX_ACTIVE || this.sessions.size >= MAX_SESSIONS)
      throw new EndpointError(
        "RATE_LIMITED",
        "Сейчас выполняется слишком много попыток входа. Повторите позже.",
        429,
      );

    const sessionID = randomUUID();
    const session: CodexLoginSession = {
      owner,
      input,
      idempotencyKey,
      expiresAt: Date.now() + LOGIN_TTL_MS,
      state: "starting",
    };
    this.sessions.set(sessionID, session);
    session.timer = setTimeout(
      () =>
        void this.fail(
          sessionID,
          session,
          "Время входа истекло. Начните новый вход.",
        ),
      LOGIN_TTL_MS,
    );
    session.timer.unref();
    session.opening = this.open(sessionID, session, resources);
    return await session.opening;
  }

  async status(
    owner: CodexLoginOwner,
    sessionID: string,
    persist: PersistCodexLogin,
  ): Promise<CodexLoginStatusDTO> {
    const session = this.requireSession(owner, sessionID);
    if (session.result) return session.result;
    if (session.finalizing) return await session.finalizing;
    if (Date.now() >= session.expiresAt) {
      await this.fail(
        sessionID,
        session,
        "Время входа истекло. Начните новый вход.",
      );
      return session.result!;
    }
    if (session.state !== "ready" || !session.credential)
      return await session.opening!;
    clearTimeout(session.timer);
    const credential = session.credential;
    session.credential = undefined;
    session.finalizing = (async () => {
      try {
        const connection = await persist(credential);
        session.state = "completed";
        session.result = { status: "completed", connection };
      } catch (error) {
        session.state = "failed";
        session.result = {
          status: "failed",
          message:
            error instanceof EndpointError
              ? error.message
              : "Не удалось сохранить подключение. Повторите вход.",
        };
      } finally {
        this.retainResult(sessionID, session);
      }
      return session.result!;
    })();
    return await session.finalizing;
  }

  async cancel(owner: CodexLoginOwner, sessionID: string): Promise<void> {
    const session = this.requireSession(owner, sessionID);
    if (
      session.completing ||
      session.finalizing ||
      session.state === "completed"
    )
      throw new EndpointError(
        "CONFLICT",
        "Подключение уже сохраняется или сохранено. Обновите страницу.",
        409,
      );
    await this.fail(sessionID, session, "Вход отменён.");
  }

  /** Relay разрешён владельцу pending browser-сессии; URL и code нигде не сохраняются. */
  async completeBrowser(
    owner: CodexLoginOwner,
    sessionID: string,
    callbackURL: string,
    persist: PersistCodexLogin,
  ): Promise<CodexLoginStatusDTO> {
    const session = this.requireSession(owner, sessionID);
    if (session.input.loginMethod !== "browser")
      throw new EndpointError(
        "INVALID_REQUEST",
        "Эта попытка не использует вход через браузер.",
        400,
      );
    if (
      session.result ||
      session.state === "ready" ||
      session.finalizing ||
      Date.now() >= session.expiresAt
    )
      return await this.status(owner, sessionID, persist);
    const callbackHash = createHash("sha256").update(callbackURL).digest("hex");
    if (session.callbackHash && session.callbackHash !== callbackHash)
      throw new EndpointError(
        "CONFLICT",
        "Для этой попытки уже передан другой адрес завершения входа.",
        409,
      );
    if (!session.completing && !session.callbackHash) {
      const client = session.client;
      if (session.state !== "pending" || !client)
        throw new EndpointError(
          "CONFLICT",
          "Попытка входа больше не ожидает подтверждения.",
          409,
        );
      session.callbackHash = callbackHash;
      session.completing = client
        .completeBrowserLogin(callbackURL)
        .catch(() => {
          session.callbackHash = undefined;
          throw new EndpointError(
            "INVALID_REQUEST",
            "Не удалось подтвердить адрес завершения входа. Проверьте адрес этой попытки.",
            400,
          );
        });
    }
    try {
      await session.completing;
    } finally {
      session.completing = undefined;
    }
    return await this.status(owner, sessionID, persist);
  }

  private async open(
    sessionID: string,
    session: CodexLoginSession,
    resources: CodexLoginResources,
  ): Promise<CodexLoginPendingDTO> {
    try {
      const browser = session.input.loginMethod === "browser";
      if (browser) {
        if (!resources.acquireBrowserLock)
          throw new EndpointError(
            "INTEGRATION_UNAVAILABLE",
            "Общая блокировка входа через браузер недоступна.",
            503,
          );
        session.browserLockOpening = resources.acquireBrowserLock();
        session.browserLock = await session.browserLockOpening;
        if (session.browserLock.signal.aborted)
          throw new Error("login_lock_unavailable");
        session.handleLockAbort = () => {
          void this.fail(
            sessionID,
            session,
            "Соединение с хранилищем попыток входа потеряно. Повторите вход.",
          );
        };
        session.browserLock.signal.addEventListener(
          "abort",
          session.handleLockAbort,
          { once: true },
        );
      }
      this.requireOpening(session);
      session.clientOpening = CodexAccountClient.open({
        authMode: "chatgpt",
        codexBinary: process.env.REALIZE_CODEX_BINARY || undefined,
      });
      const client = await session.clientOpening;
      session.client = client;
      this.requireOpening(session);
      const login = browser
        ? await client.startBrowserLogin()
        : await client.startDeviceLogin();
      this.requireOpening(session);
      session.loginID = login.loginID;
      session.state = "pending";
      session.pending = {
        status: "pending",
        sessionID,
        expiresAt: new Date(session.expiresAt).toISOString(),
        ...("authorizationURL" in login
          ? {
              loginMethod: "browser" as const,
              authorizationURL: login.authorizationURL,
            }
          : {
              loginMethod: "deviceCode" as const,
              userCode: login.userCode,
              verificationURL: login.verificationURL,
            }),
      };
      void this.watch(sessionID, session, client, login.loginID);
      return session.pending;
    } catch (error) {
      const message =
        error instanceof EndpointError
          ? error.message
          : session.input.loginMethod === "browser"
            ? "Не удалось начать вход через браузер. Проверьте Codex CLI и доступность порта 1455 на сервере."
            : "Не удалось начать вход. Проверьте Codex CLI и разрешение входа по коду в настройках безопасности ChatGPT.";
      await this.fail(sessionID, session, message);
      if (error instanceof EndpointError) throw error;
      throw new EndpointError("INTEGRATION_UNAVAILABLE", message, 503);
    }
  }

  private async watch(
    sessionID: string,
    session: CodexLoginSession,
    client: CodexAccountClient,
    loginID: string,
  ): Promise<void> {
    let stage = "confirmation";
    try {
      if (!(await client.waitForLogin(loginID)))
        throw new Error("login_failed");
      stage = "account";
      const account = await client.readAccount();
      if (account?.type !== "chatgpt") throw new Error("account_required");
      stage = "credential";
      const authJSON = await client.readCredential();
      if (session.state !== "pending") return;
      // Listener и его DB session освобождаются до ready: сохранение использует свою блокировку.
      await this.closeResources(sessionID, session);
      if (session.state !== "pending") return;
      session.credential = {
        input: session.input,
        idempotencyKey: session.idempotencyKey,
        authJSON,
        ...(account.email ? { accountEmail: account.email } : {}),
        planType: account.planType,
      };
      session.state = "ready";
    } catch (error) {
      if (session.state !== "failed") {
        const message =
          error instanceof CodexLoginError
            ? error.message
            : stage === "account"
              ? "OpenAI подтвердил вход, но Codex не смог прочитать аккаунт. Повторите вход; при повторной ошибке требуется проверка обработчика Codex."
              : stage === "credential"
                ? "OpenAI подтвердил вход, но CMS не смогла получить сохранённые данные доступа Codex. Требуется проверка серверного профиля авторизации."
                : "Соединение с процессом авторизации Codex прервалось до подтверждения входа. Начните новую попытку.";
        console.warn("Codex login failed", {
          stage,
          method: session.input.loginMethod ?? "deviceCode",
          reason:
            error instanceof CodexLoginError
              ? error.code
              : "login_stage_failed",
        });
        await this.fail(sessionID, session, message);
      }
    } finally {
      await this.closeResources(sessionID, session);
    }
  }

  /** Повторная проверка после await учитывает отмену и TTL, меняемые другим запросом. */
  private requireOpening(session: CodexLoginSession): void {
    if (session.state !== "starting" || Date.now() >= session.expiresAt)
      throw new Error("login_expired");
  }

  private async fail(
    sessionID: string,
    session: CodexLoginSession,
    message: string,
  ): Promise<void> {
    if (session.finalizing || session.state === "completed") return;
    session.state = "failed";
    session.credential = undefined;
    session.result = { status: "failed", message };
    try {
      await this.closeResources(sessionID, session);
    } finally {
      this.retainResult(sessionID, session);
    }
  }

  /** Cleanup ждёт уже начатые acquire/open и выполняется однократно при гонках cancel/watch/TTL. */
  private async closeResources(
    sessionID: string,
    session: CodexLoginSession,
  ): Promise<void> {
    if (session.closing) return await session.closing;
    session.closing = (async () => {
      const client =
        session.client ?? (await session.clientOpening?.catch(() => undefined));
      if (client) {
        if (session.state === "failed" && session.loginID)
          await client.cancelLogin(session.loginID).catch(() => undefined);
        await client.close().catch(() => undefined);
      }
      session.client = undefined;
      const lock =
        session.browserLock ??
        (await session.browserLockOpening?.catch(() => undefined));
      if (lock) {
        if (session.handleLockAbort)
          lock.signal.removeEventListener("abort", session.handleLockAbort);
        try {
          await lock.release();
        } catch {
          session.state = "failed";
          session.credential = undefined;
          session.result = {
            status: "failed",
            message:
              "Не удалось закрыть попытку входа Codex. Начните новый вход.",
          };
          this.retainResult(sessionID, session);
        }
      }
      session.browserLock = undefined;
    })();
    return await session.closing;
  }

  private retainResult(sessionID: string, session: CodexLoginSession): void {
    clearTimeout(session.timer);
    session.timer = setTimeout(
      () => this.sessions.delete(sessionID),
      RESULT_TTL_MS,
    );
    session.timer.unref();
  }

  private requireSession(
    owner: CodexLoginOwner,
    sessionID: string,
  ): CodexLoginSession {
    const session = this.sessions.get(sessionID);
    if (!session || !this.sameOwner(session.owner, owner))
      throw new EndpointError(
        "NOT_FOUND",
        "Сессия входа недоступна или истекла. Начните новый вход.",
        404,
      );
    return session;
  }

  private sameOwner(left: CodexLoginOwner, right: CodexLoginOwner): boolean {
    return (
      left.actorKey === right.actorKey &&
      left.installationKey === right.installationKey
    );
  }
}
