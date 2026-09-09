/**
 * @file .ai/tools/source-headers/src/checkSourceHeaders.service.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Проверяет только явно переданные файлы с учётом форматов и подтверждённых исключений.
 */

import { readFile, realpath, stat } from "node:fs/promises";
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  generatedHeaderDirectories,
  generatedHeaderExceptions,
  nonSourceHeaderExtensions,
  sourceHeaderStyles,
} from "./sourceHeaders.config.ts";
import type {
  SourceHeadersInput,
  SourceHeadersReport,
} from "./SourceHeaders.types.ts";
import { validateSourceHeader } from "./validateSourceHeader.validator.ts";

/** Не обходит каталоги, не обращается к Git и не изменяет проверяемые файлы. */
export const checkSourceHeaders = async ({
  root,
  files,
}: SourceHeadersInput): Promise<SourceHeadersReport> => {
  const report: SourceHeadersReport = {
    checked: 0,
    skipped: [],
    violations: [],
  };
  if (!files.length) {
    report.violations.push({
      file: "<вход>",
      message: "Требуется явный список файлов.",
    });
    return report;
  }
  const rootPath = await realpath(root);
  const visited = new Set<string>();
  for (const input of files) {
    const absolute = resolve(rootPath, input);
    const local = relative(rootPath, absolute);
    const file = local.split(sep).join("/");
    if (visited.has(file)) continue;
    visited.add(file);
    if (
      !input ||
      isAbsolute(local) ||
      local === ".." ||
      local.startsWith(`..${sep}`)
    ) {
      report.violations.push({
        file: input,
        message: "Путь должен указывать на файл внутри проекта.",
      });
      continue;
    }
    try {
      const actual = relative(rootPath, await realpath(absolute));
      if (
        isAbsolute(actual) ||
        actual === ".." ||
        actual.startsWith(`..${sep}`)
      ) {
        report.violations.push({
          file,
          message: "Ссылка ведёт за пределы проекта.",
        });
        continue;
      }
      if (!(await stat(absolute)).isFile()) {
        report.violations.push({
          file,
          message: "Требуется файл; каталоги не обходятся.",
        });
        continue;
      }
      const extension = extname(file).toLowerCase();
      const reason =
        (Object.hasOwn(generatedHeaderExceptions, file)
          ? generatedHeaderExceptions[file]
          : undefined) ??
        (file.split("/").includes("node_modules")
          ? "Сторонняя зависимость node_modules."
          : undefined) ??
        (generatedHeaderDirectories.some((path) => file.startsWith(path))
          ? "Результат генерации или сборки."
          : undefined) ??
        (nonSourceHeaderExtensions.has(extension)
          ? "Формат без исходной шапки или материал вне проверки кода."
          : undefined);
      if (reason) {
        report.skipped.push({ file, reason });
        continue;
      }
      const style =
        basename(file) === "Dockerfile"
          ? "hash"
          : sourceHeaderStyles[extension];
      if (!style) {
        report.violations.push({
          file,
          message: "Формат не поддерживается: нужна ручная проверка шапки.",
        });
        continue;
      }
      const source = new TextDecoder("utf-8", { fatal: true }).decode(
        await readFile(absolute),
      );
      report.checked++;
      for (const message of validateSourceHeader(source, file, style)) {
        report.violations.push({ file, message });
      }
    } catch {
      report.violations.push({
        file,
        message:
          "Не удалось прочитать текстовый файл UTF-8; проверь путь и доступ.",
      });
    }
  }
  return report;
};
