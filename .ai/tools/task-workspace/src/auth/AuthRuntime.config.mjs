/**
 * @file .ai/tools/task-workspace/src/auth/AuthRuntime.config.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Соединяет CLI сервисы с системным keyring, private config, транспортом и браузером.
 * @see documentation/architecture/platform-access.md
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { credentialBundleSchema } from "@realize/payload-access-management/contracts";
import { fail } from "../Workspace.error.mjs";
import {
  accessStateDirectory,
  createAccessConfigRepository,
} from "./AccessConfig.repository.mjs";
import { createAccessRefreshState } from "./AccessRefreshState.repository.mjs";
import { runSecretService } from "./runSecretService.adapter.mjs";
import { requestAccessJson } from "./requestAccessJson.adapter.mjs";
import { withAccessLock } from "./withAccessLock.adapter.mjs";

/** @param {NodeJS.ProcessEnv} [env] @returns {import('./Auth.types').AuthDependencies} */
export function createAuthRuntime(env = process.env) {
  const directory = accessStateDirectory(env);
  return {
    env,
    config: createAccessConfigRepository(directory),
    refreshState: createAccessRefreshState(directory),
    keyring: {
      probe: async () => {
        await runSecretService("probe");
      },
      read: async (baseUrl) => {
        const value = await runSecretService("read", baseUrl);
        if (value === null) return null;
        const parsed = credentialBundleSchema.safeParse(value);
        if (!parsed.success)
          fail(
            "auth_credential_invalid",
            "Сохранённое подключение повреждено; выполните logout и login.",
          );
        return parsed.data;
      },
      write: async (baseUrl, value) => {
        await runSecretService("write", baseUrl, value);
      },
      remove: async (baseUrl) => {
        await runSecretService("remove", baseUrl);
      },
    },
    withLock: (baseUrl, operation) =>
      withAccessLock(baseUrl, operation, directory),
    transport: requestAccessJson,
    now: Date.now,
    sleep: async (ms, signal) => {
      try {
        await sleep(ms, undefined, { signal });
      } catch {
        fail("auth_cancelled", "Подключение отменено.");
      }
    },
    notice: (value) =>
      process.stderr.write(JSON.stringify({ authorization: value }) + "\n"),
    openBrowser: (uri) =>
      new Promise((resolve) => {
        const child = spawn("/usr/bin/xdg-open", [uri], {
          stdio: "ignore",
          env: {
            PATH: "/usr/bin:/bin",
            HOME: process.env.HOME,
            DISPLAY: process.env.DISPLAY,
            WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
            XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
            DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
            XAUTHORITY: process.env.XAUTHORITY,
          },
        });
        const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
        child.on("error", () => {
          clearTimeout(timer);
          resolve(false);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve(code === 0);
        });
      }),
  };
}
