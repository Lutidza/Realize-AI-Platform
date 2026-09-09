/**
 * @file packages/codex-adapter/src/CodexBrowserLogin.adapter.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Привязывает браузерный callback к штатному OAuth-процессу Codex.
 * @see documentation/architecture/codex-integration.md
 */

import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:net";

import type { CodexBrowserLogin } from "./CodexAccount.types";

const CALLBACK = "http://localhost:1455/auth/callback";
const ERROR_MESSAGE =
  "Ссылка завершения входа недействительна. Повторите вход через ChatGPT.";
let activeBrowserLogin: symbol | undefined;

/** Один localhost callback на процесс CMS; код OAuth никогда не записывается в журнал. */
export class CodexBrowserLoginAdapter {
  private readonly reservationID = Symbol("codex-browser-login");
  private state?: string;
  private used = false;
  private forwarding?: AbortController;

  /** Не даёт второму браузерному входу завершить чужой listener Codex на порту 1455. */
  async reserve(): Promise<void> {
    if (activeBrowserLogin)
      throw new Error(
        "Другой браузерный вход уже выполняется. Повторите позже.",
      );
    activeBrowserLogin = this.reservationID;
    this.used = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const server = createServer();
        server.once("error", () =>
          reject(new Error("Порт браузерного входа Codex занят.")),
        );
        server.listen({ host: "127.0.0.1", port: 1455, exclusive: true }, () =>
          server.close((error) =>
            error
              ? reject(new Error("Порт браузерного входа Codex занят."))
              : resolve(),
          ),
        );
      });
    } catch (error) {
      this.close();
      throw error;
    }
  }

  accept(result: Record<string, unknown>): CodexBrowserLogin {
    try {
      if (
        activeBrowserLogin !== this.reservationID ||
        result.type !== "chatgpt" ||
        typeof result.loginId !== "string" ||
        !result.loginId ||
        typeof result.authUrl !== "string" ||
        result.authUrl.length > 16_384
      )
        throw new Error();
      const url = new URL(result.authUrl);
      const state = url.searchParams.get("state");
      if (
        url.origin !== "https://auth.openai.com" ||
        url.pathname !== "/oauth/authorize" ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.getAll("redirect_uri").length !== 1 ||
        url.searchParams.get("redirect_uri") !== CALLBACK ||
        url.searchParams.getAll("state").length !== 1 ||
        !state ||
        !/^[A-Za-z0-9._~-]{16,1024}$/.test(state) ||
        state.trim() !== state
      )
        throw new Error();
      this.state = state;
      return { loginID: result.loginId, authorizationURL: result.authUrl };
    } catch {
      throw new Error(
        "Codex вернул неподдерживаемый ответ браузерной авторизации.",
      );
    }
  }

  /** Пересылает callback из защищённого POST формы только своему фиксированному listener. */
  async complete(callbackURL: string): Promise<void> {
    try {
      if (
        activeBrowserLogin !== this.reservationID ||
        !this.state ||
        this.used ||
        typeof callbackURL !== "string" ||
        callbackURL.length > 16_384 ||
        /[\r\n\0]/.test(callbackURL)
      )
        throw new Error();
      const url = new URL(callbackURL);
      if (
        `${url.origin}${url.pathname}` !== CALLBACK ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error();
      const keys = [...url.searchParams.keys()];
      if (
        keys.some((key) => !["code", "state", "scope"].includes(key)) ||
        new Set(keys).size !== keys.length
      )
        throw new Error();
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (!state || !code || code.length > 8192 || /[\s\0]/.test(code))
        throw new Error();
      const expected = Buffer.from(this.state);
      const received = Buffer.from(state);
      if (
        expected.length !== received.length ||
        !timingSafeEqual(expected, received)
      )
        throw new Error();
      // Резервируем до I/O: таймаут не разрешает повторную передачу уже принятого кода.
      this.used = true;
      this.forwarding = new AbortController();
      const target = new URL("http://127.0.0.1:1455/auth/callback");
      target.searchParams.set("code", code);
      target.searchParams.set("state", state);
      const response = await fetch(target, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.any([
          this.forwarding.signal,
          AbortSignal.timeout(15_000),
        ]),
      });
      await response.body?.cancel();
      if (response.status < 200 || response.status >= 400) throw new Error();
    } catch {
      throw new Error(ERROR_MESSAGE);
    }
  }

  close(): void {
    this.state = undefined;
    this.used = true;
    this.forwarding?.abort();
    if (activeBrowserLogin === this.reservationID)
      activeBrowserLogin = undefined;
  }
}
