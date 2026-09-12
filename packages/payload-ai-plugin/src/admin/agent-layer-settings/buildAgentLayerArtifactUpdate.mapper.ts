/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/buildAgentLayerArtifactUpdate.mapper.ts
 * @version 1.0.0
 * @date 2026-09-10
 * @description Собирает замену одной записи с точной идентичностью, CAS и монотонной ревизией.
 */

import {
  ContractValidationError,
  parseAIConfigArtifact,
  parseUpdateAIConfigDraftInput,
} from "@realize/ai-contracts";
import type {
  AIConfigArtifact,
  AIConfigDraftDTO,
  UpdateAIConfigDraftInput,
} from "@realize/ai-contracts";

/** Порядок полей объекта не влияет на содержание; порядок элементов массива влияет. */
const equalContent = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => equalContent(item, right[index]))
    );
  }
  const entries = Object.entries(left);
  const rightEntries = new Map(Object.entries(right));
  return (
    entries.length === rightEntries.size &&
    entries.every(
      ([key, value]) =>
        rightEntries.has(key) && equalContent(value, rightEntries.get(key)),
    )
  );
};

/** Входную revision заменяет на серверно ожидаемую, сохраняя соседние записи и lineage. */
export const buildAgentLayerArtifactUpdate = (
  draft: AIConfigDraftDTO,
  artifact: AIConfigArtifact,
  originalKey?: string,
): UpdateAIConfigDraftInput => {
  if (draft.state === "released" || draft.state === "validating") {
    throw new ContractValidationError(
      "Этот черновик доступен только для чтения. Создайте копию.",
    );
  }
  const previous = draft.artifacts.find(
    (item) => item.kind === artifact.kind && item.key === originalKey,
  );
  const label =
    artifact.kind === "local_rule"
      ? "Правило"
      : artifact.kind === "agent_profile"
        ? "Профиль"
        : "Артефакт";
  if (originalKey !== undefined && !previous) {
    throw new ContractValidationError(
      `${label} больше не ${artifact.kind === "local_rule" ? "найдено" : "найден"} в выбранном черновике. Загрузите актуальную версию.`,
    );
  }
  if (
    draft.artifacts.some(
      (item) =>
        item.kind === artifact.kind &&
        item.key === artifact.key &&
        item !== previous,
    )
  ) {
    throw new ContractValidationError(
      `${label} с таким ключом уже существует.`,
    );
  }
  const parsed = parseAIConfigArtifact(artifact);
  const { revision: _nextRevision, ...nextContent } = parsed;
  const { revision: _previousRevision, ...previousContent } =
    previous ?? parsed;
  const revision =
    previous && previous.key === parsed.key
      ? previous.revision + (equalContent(previousContent, nextContent) ? 0 : 1)
      : 1;
  const updated = parseAIConfigArtifact({ ...parsed, revision });
  return parseUpdateAIConfigDraftInput({
    artifacts: previous
      ? draft.artifacts.map((item) => (item === previous ? updated : item))
      : [...draft.artifacts, updated],
    baseRelease: draft.baseRelease ?? null,
    expectedRevision: draft.revision,
    schemaVersion: "1.0",
  });
};
