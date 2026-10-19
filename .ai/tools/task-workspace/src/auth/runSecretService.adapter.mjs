/**
 * @file .ai/tools/task-workspace/src/auth/runSecretService.adapter.mjs
 * @version 1.0.0
 * @date 2026-10-19
 * @description Передаёт credentials в фиксированный libsecret helper без argv, shell и plaintext fallback.
 * @see documentation/architecture/platform-access.md
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fail } from "../Workspace.error.mjs";

/** @param {'probe'|'read'|'write'|'remove'} operation @param {string} [key] @param {unknown} [value] */
export async function runSecretService(operation, key = "", value) {
  if (process.platform !== "linux")
    fail(
      "auth_keyring_unsupported",
      "Сохранение подключения реализовано для Linux Secret Service; используйте явные URL и TOKEN в окружении.",
    );
  /** @type {NodeJS.ProcessEnv} */
  const env = { PATH: "/usr/bin:/bin" };
  for (const name of [
    "HOME",
    "DBUS_SESSION_BUS_ADDRESS",
    "XDG_RUNTIME_DIR",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XAUTHORITY",
  ])
    if (process.env[name]) env[name] = process.env[name];
  const result = await new Promise((resolve) => {
    const child = spawn(
      "/usr/bin/python3",
      [
        "-I",
        fileURLToPath(new URL("./secretService.helper.py", import.meta.url)),
      ],
      { env, stdio: ["pipe", "pipe", "pipe"] },
    );
    /** @type {Buffer[]} */ const chunks = [];
    let size = 0;
    let exceeded = false;
    const timer = setTimeout(() => {
      exceeded = true;
      child.kill("SIGKILL");
    }, 15000);
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 65536) {
        exceeded = true;
        child.kill("SIGKILL");
      } else chunks.push(chunk);
    });
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || exceeded) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    child.stdin.end(
      JSON.stringify({
        operation,
        key,
        ...(value === undefined ? {} : { value }),
      }),
    );
  });
  if (
    !result ||
    typeof result !== "object" ||
    !("ok" in result) ||
    result.ok !== true ||
    !("value" in result)
  )
    fail(
      "auth_keyring_unavailable",
      "Linux Secret Service недоступен. Запустите и разблокируйте системное хранилище; требуется Python GI/libsecret. Секреты на диск не сохраняются.",
    );
  return result.value;
}
