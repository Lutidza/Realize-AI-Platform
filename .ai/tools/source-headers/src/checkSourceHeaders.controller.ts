/**
 * @file .ai/tools/source-headers/src/checkSourceHeaders.controller.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Принимает список файлов CLI и выводит результат проверки обязательных шапок.
 */

import { fileURLToPath } from "node:url";

import { checkSourceHeaders } from "./checkSourceHeaders.service.ts";

const files = process.argv.slice(2);
if (files[0] === "--") files.shift();
if (files.length === 1 && files[0] === "--help") {
  console.log("npm run check:headers -- <файл> [файл ...]");
} else if (!files.length || files.some((file) => file.startsWith("--"))) {
  console.error(
    "Укажи явный список файлов: npm run check:headers -- <файл> [файл ...]",
  );
  process.exitCode = 2;
} else {
  try {
    const report = await checkSourceHeaders({
      root: fileURLToPath(new URL("../../../../", import.meta.url)),
      files,
    });
    for (const issue of report.violations)
      console.error(`${issue.file}: ${issue.message}`);
    console.log(
      `Шапки: проверено ${report.checked}, исключено ${report.skipped.length}, нарушений ${report.violations.length}.`,
    );
    process.exitCode = report.violations.length ? 1 : 0;
  } catch {
    console.error("Не удалось запустить проверку шапок в корне проекта.");
    process.exitCode = 2;
  }
}
