/**
 * @file packages/payload-ai-plugin/src/endpoints/validatePageDraftTextPatch.validator.ts
 * @version 1.0.0
 * @date 2026-09-12
 * @description Отклоняет host patch, меняющий данные за пределами подтверждённых текстовых полей.
 */
import type { PageDraftTextChange } from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import { EndpointError } from "./http";
import { pageDraftTextPath } from "./pageDraftTextPath.util";
import type { AIDocument } from "./repository";

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const encode = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
const equivalent = (a: unknown, b: unknown) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    hashCanonicalJSON(a) === hashCanonicalJSON(b));

/** Допустимые null/absence относятся только к изменяемым пустым текстовым полям. */
export const validatePageDraftTextPatch = (
  before: AIDocument,
  patch: Record<string, unknown>,
  changes: PageDraftTextChange[],
): AIDocument => {
  const targets = new Map(changes.map((change) => [change.path, change]));
  const visitedTargets = new Set<string>();
  const topFields = new Set(
    changes.map((change) => pageDraftTextPath(change.path)[0]),
  );
  if (
    !object(patch) ||
    Object.keys(patch).some(
      (key) =>
        !topFields.has(key) ||
        !["title", "meta", "hero", "layout"].includes(key),
    )
  )
    throw new EndpointError(
      "CONFLICT",
      "Адаптер попытался изменить неподтверждённые поля страницы.",
      409,
    );
  const after = { ...structuredClone(before), ...structuredClone(patch) };
  const visit = (previous: unknown, next: unknown, path: string): void => {
    const change = targets.get(path);
    if (change) {
      visitedTargets.add(path);
      if ((previous ?? "") !== change.before || (next ?? "") !== change.after)
        throw new EndpointError(
          "CONFLICT",
          "Точный текст host patch не совпадает с подтверждённым изменением.",
          409,
        );
      return;
    }
    if (equivalent(previous, next)) return;
    if (
      Array.isArray(previous) &&
      Array.isArray(next) &&
      previous.length === next.length
    ) {
      previous.forEach((value, index) =>
        visit(value, next[index], `${path}/${index}`),
      );
      return;
    }
    // Пустой optional group может отсутствовать до первой записи его текстового поля.
    if ((object(previous) || previous == null) && object(next)) {
      const source = object(previous) ? previous : {};
      for (const key of new Set([...Object.keys(source), ...Object.keys(next)]))
        visit(source[key], next[key], `${path}/${encode(key)}`);
      return;
    }
    throw new EndpointError(
      "CONFLICT",
      "Адаптер изменил структуру, связи или другие неподтверждённые данные страницы.",
      409,
    );
  };
  visit(before, after, "");
  if (visitedTargets.size !== targets.size)
    throw new EndpointError(
      "CONFLICT",
      "Адаптер не применил все подтверждённые изменения текста.",
      409,
    );
  return { ...after, _status: "draft" };
};
