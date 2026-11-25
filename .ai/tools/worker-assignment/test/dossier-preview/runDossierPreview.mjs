/**
 * @file .ai/tools/worker-assignment/test/dossier-preview/runDossierPreview.mjs
 * @version 1.0.0
 * @date 2026-11-26
 * @description Запускает предпросмотр и новые аудиты под общей локальной блокировкой.
 * @see documentation/specifications/task-management/execution/article-audit-dossier-preview.md
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  execute,
  pgEnvironment,
  privateDirectory,
  startPreviewCluster,
  workspace,
} from "./previewCluster.mjs";
import { refreshPreviewManifest } from "./refreshPreviewManifest.mjs";

const action = process.argv[2] ?? "start";
if (
  !["start", "audit", "restart", "stop", "verify", "access"].includes(action) ||
  process.argv.length > 3
)
  throw new Error(
    "Используйте start, audit, restart, stop, access или verify.",
  );
await privateDirectory(workspace);
// flock сохраняет взаимное исключение после аварии, освобождая его при завершении процесса.
if (!process.env.REALIZE_DOSSIER_PREVIEW_LOCKED) {
  const runner = fileURLToPath(import.meta.url);
  const { stdout } = await execute(
    "flock",
    [
      "-w",
      "120",
      "-o",
      join(workspace, "command.lock"),
      process.execPath,
      runner,
      action,
    ],
    {
      env: { ...pgEnvironment, REALIZE_DOSSIER_PREVIEW_LOCKED: "1" },
    },
  );
  process.stdout.write(stdout);
} else {
  await startPreviewCluster(action);
  if (action === "access") {
    const file = fileURLToPath(new URL("./previewReader.sql", import.meta.url));
    await execute("psql", ["-X", "-1", "-v", "ON_ERROR_STOP=1", "-f", file], {
      env: pgEnvironment,
    });
  }
  if (action === "audit") {
    // Дочерние процессы имитатора не наследуют конфигурацию провайдера и рабочие подключения.
    const rejectFetch =
      "globalThis.fetch=async()=>{process.exitCode=1;throw new Error('model_transport_forbidden')}";
    for (const [script, flags] of [
      ["./migratePreview.mjs", []],
      ["./runArticleDossier.test.ts", ["--test"]],
    ]) {
      const file = fileURLToPath(new URL(script, import.meta.url));
      const run = await execute(
        process.execPath,
        ["--import=tsx/esm", ...flags, file],
        {
          env: {
            ...pgEnvironment,
            NODE_OPTIONS:
              "--import=data:text/javascript," +
              encodeURIComponent(rejectFetch),
          },
        },
      ).catch((e) => {
        throw new Error(e.stdout + "\n" + e.stderr, { cause: e });
      });
      process.stdout.write(run.stdout);
    }
  }
  if (action !== "stop") {
    const manifest =
      (await refreshPreviewManifest()) ??
      "Для первой задачи выполните команду audit.\n";
    process.stdout.write(manifest);
    if (action === "verify") {
      const file = fileURLToPath(
        new URL("./checkDossierAccess.mjs", import.meta.url),
      );
      const result = await execute(
        process.execPath,
        ["--import=tsx/esm", file],
        { env: pgEnvironment },
      );
      process.stdout.write(result.stdout);
    }
  }
}
