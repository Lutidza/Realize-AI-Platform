/**
 * @file packages/codex-adapter/src/runIsolatedJsonTurn.adapter.ts
 * @version 1.0.0
 * @date 2026-11-27
 * @description Передаёт один пакет и JSON Schema отдельному Codex с пустым cwd и без инструментов записи.
 * @see documentation/specifications/internal-mcp.md
 */
import { createCodexChatPermissions } from "./createCodexChatPermissions.config";
import { READ_ONLY_SESSION_CONFIG } from "./readOnlySession.config";
import { createCodexEnvironment } from "./environment";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

/** Возвращает недоверенный JSON. Семантику ответа и выдачу полномочий проверяет владелец операции. */
export async function runIsolatedJsonTurn(
  payload: string,
  outputSchema: object,
  signal: AbortSignal,
  onDelivered?: () => void,
): Promise<unknown> {
  const profile = process.env.REALIZE_IDE_CODEX_HOME;
  if (!profile || !isAbsolute(profile))
    throw new Error("assignment_executor_profile");
  const credential = await stat(join(profile, "auth.json")).catch(() => null);
  if (!credential?.isFile()) throw new Error("assignment_executor_profile");
  const directory = await mkdtemp(join(tmpdir(), "realize-ide-executor-"));
  try {
    const cwd = join(directory, "work");
    const home = join(directory, "profile");
    const schema = join(directory, "report.schema.json");
    const output = join(directory, "report.json");
    await mkdir(cwd, { mode: 0o700 });
    await mkdir(home, { mode: 0o700 });
    await symlink(join(profile, "auth.json"), join(home, "auth.json"));
    await writeFile(schema, JSON.stringify(outputSchema));
    const env = { ...createCodexEnvironment(), HOME: home, CODEX_HOME: home };
    const permission = await createCodexChatPermissions(cwd, {
      environment: env,
    });
    const filesystem = Object.entries(permission.profile.filesystem)
      .map(([path, mode]) => JSON.stringify(path) + "=" + JSON.stringify(mode))
      .join(",");
    const settings = [
      ...Object.entries(READ_ONLY_SESSION_CONFIG)
        .filter(([key]) => key !== "sandbox_mode")
        .flatMap(([key, value]) => ["-c", key + "=" + JSON.stringify(value)]),
      "-c",
      'default_permissions="realize_assignment"',
      "-c",
      "permissions.realize_assignment.filesystem={" + filesystem + "}",
      "-c",
      "permissions.realize_assignment.network.enabled=false",
    ];
    let child!: ReturnType<typeof execFile>;
    const exited = new Promise<void>((resolve, reject) => {
      child = execFile(
        permission.binaryPath,
        [
          "exec",
          "--ephemeral",
          "--ignore-user-config",
          "--ignore-rules",
          "--strict-config",
          "--skip-git-repo-check",
          ...settings,
          "--output-schema",
          schema,
          "--output-last-message",
          output,
          "-",
        ],
        {
          cwd,
          env,
          signal,
          timeout: 10 * 60_000,
          killSignal: "SIGKILL",
          maxBuffer: 1_048_576,
        },
        (error, _stdout, stderr) => {
          if (!error) return resolve();
          // Сырой вывод Codex может содержать входные материалы и параметры подключения.
          const reason = error.killed
            ? "assignment_executor_interrupted"
            : error.code === "ENOENT"
              ? "assignment_executor_missing"
              : /unauthorized|invalid_grant|401|not logged in/i.test(stderr)
                ? "assignment_executor_auth"
                : /quota|rate limit|429/i.test(stderr)
                  ? "assignment_executor_quota"
                  : /error loading config|unknown field/i.test(stderr)
                    ? "assignment_executor_configuration"
                    : "assignment_executor_failed";
          reject(new Error(reason));
        },
      );
    });
    // finish на stdin удостоверяет запись байтов во вход процесса. Вывод модели проверяется отдельно.
    const delivered = child.stdin
      ? pipeline(Readable.from([payload]), child.stdin, { signal }).then(() =>
          onDelivered?.(),
        )
      : Promise.reject(new Error("assignment_executor_stdin"));
    const [processResult, inputResult] = await Promise.allSettled([
      exited,
      delivered,
    ]);
    if (processResult.status === "rejected") throw processResult.reason;
    if (inputResult.status === "rejected")
      throw new Error("assignment_delivery_failed", {
        cause: inputResult.reason,
      });
    if ((await stat(output)).size > 210000)
      throw new Error("assignment_report_limit");
    return JSON.parse(await readFile(output, "utf8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
