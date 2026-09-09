/**
 * @file .ai/tools/source-headers/src/validateSourceHeader.validator.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Проверяет отдельные обязательные поля одной начальной шапки исходника.
 */

import { readLeadingComments } from "./readLeadingComments.util.ts";
import type { HeaderCommentStyle } from "./SourceHeaders.types.ts";

export const validateSourceHeader = (
  source: string,
  file: string,
  style: HeaderCommentStyle,
): string[] => {
  const candidates = readLeadingComments(source, style).filter((comment) =>
    /(?:^|\n)\s*\*?\s*@file\b/.test(comment),
  );
  if (candidates.length !== 1) {
    return [
      candidates.length
        ? "Обязательные поля должны находиться в одной начальной шапке."
        : "Отсутствует начальная шапка с обязательными полями.",
    ];
  }
  const fields = new Map<string, string[]>();
  let description: string[] | undefined;
  for (const line of candidates[0].split(/\r?\n/)) {
    const match = line.match(
      /^\s*\*?\s*@(file|version|date|description)\b[\t ]*(.*)$/,
    );
    if (match) {
      const values = [...(fields.get(match[1]) ?? []), match[2].trim()];
      fields.set(match[1], values);
      description = match[1] === "description" ? values : undefined;
    } else {
      const text = line.replace(/^\s*\*?\s*/, "").trim();
      if (text.startsWith("@")) description = undefined;
      else if (description && text) {
        const index = description.length - 1;
        description[index] = `${description[index]} ${text}`.trim();
      }
    }
  }
  const violations: string[] = [];
  for (const tag of ["file", "version", "date", "description"]) {
    const values = fields.get(tag) ?? [];
    if (values.length !== 1 || !values[0]) {
      violations.push(
        `@${tag}: требуется одно непустое поле на отдельной строке.`,
      );
      continue;
    }
    const value = values[0];
    if (tag === "file" && value !== file) {
      violations.push(`@file: ожидается ${file}.`);
    } else if (
      tag === "version" &&
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
    ) {
      violations.push(
        "@version: требуется MAJOR.MINOR.PATCH без даты и ведущих нулей.",
      );
    } else if (tag === "date") {
      const date = new Date(`${value}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      ) {
        violations.push(
          "@date: требуется существующая календарная дата YYYY-MM-DD.",
        );
      }
    } else if (tag === "description" && !/[А-Яа-яЁё]/.test(value)) {
      violations.push("@description: требуется непустое описание на русском.");
    }
  }
  return violations;
};
