/**
 * @file .ai/tools/agent-search/src/writeSearchObservation.adapter.mjs
 * @version 1.1.0
 * @date 2026-09-27
 * @description Экспортирует обезличенную диагностику в новый файл явно выбранной задачи.
 * @see documentation/architecture/repository-search.md
 */
import { buildSearchObservation } from "./buildSearchObservation.mapper.mjs";
import { realpath, open } from "node:fs/promises";
import path from "node:path";

/** Не создаёт фоновый процесс, сетевое соединение или файл без явного флага. */
export async function writeSearchObservation(
  root,
  options,
  result,
  observedAt,
  event = buildSearchObservation(options, result, observedAt),
) {
  const target = options.metricsFile;
  if (!target) return;
  const relative = path.relative(root, target);
  if (
    !path.isAbsolute(target) ||
    !/^\.ai-workspace\/tasks\/[A-Za-z0-9_-]+\/logs\/[A-Za-z0-9_-]+\.json$/u.test(
      relative,
    )
  )
    throw new Error(
      "--metrics-file требует абсолютный путь .ai-workspace/tasks/<task>/logs/<name>.json.",
    );
  if ((await realpath(path.dirname(target))) !== path.dirname(target))
    throw new Error("Каталог диагностики не должен проходить через symlink.");
  // wx запрещает замену существующего файла, включая конечный symlink.
  const file = await open(target, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(event) + "\n");
  } finally {
    await file.close();
  }
}
