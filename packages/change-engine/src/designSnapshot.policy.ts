/**
 * @file packages/change-engine/src/designSnapshot.policy.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Готовит детерминированный текстовый snapshot и hash-diff без I/O и исполнения кода.
 * @see documentation/specifications/design-workshop.md
 */
import { createHash } from "node:crypto";
import {
  ContractValidationError,
  designSnapshotSchema,
  type DesignSnapshot,
  type DesignSnapshotDiffDto,
  type PrepareDesignChangeInput,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "./canonicalJson";

/** Порядок файлов не влияет на identity; порядок экранов и материалов сохраняется. */
export function normalizeDesignSnapshot(value: unknown): DesignSnapshot {
  const parsed = designSnapshotSchema.safeParse(value);
  if (!parsed.success)
    throw new ContractValidationError(
      "Макет нарушает схему, допустимые пути или лимиты.",
    );
  return {
    ...parsed.data,
    files: parsed.data.files.sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    ),
  };
}

export function diffDesignSnapshots(
  before: DesignSnapshot,
  after: DesignSnapshot,
): DesignSnapshotDiffDto {
  const hashes = (snapshot: DesignSnapshot) =>
    new Map(
      snapshot.files.map((file) => [
        file.path,
        createHash("sha256").update(file.content, "utf8").digest("hex"),
      ]),
    );
  const previous = hashes(before);
  const next = hashes(after);
  return {
    briefChanged:
      hashCanonicalJSON(before.brief) !== hashCanonicalJSON(after.brief),
    sourcesChanged:
      hashCanonicalJSON(before.sources) !== hashCanonicalJSON(after.sources),
    files: [...new Set([...previous.keys(), ...next.keys()])]
      .sort()
      .flatMap((path) => {
        const beforeHash = previous.get(path) ?? null;
        const afterHash = next.get(path) ?? null;
        return beforeHash === afterHash
          ? []
          : [
              {
                path,
                beforeHash,
                afterHash,
                kind:
                  beforeHash === null
                    ? ("added" as const)
                    : afterHash === null
                      ? ("deleted" as const)
                      : ("modified" as const),
              },
            ];
      }),
  };
}

/** Put/delete применяются к одной базе целиком; отсутствующий delete и no-op отклоняются. */
export function prepareDesignSnapshot(
  base: DesignSnapshot,
  input: PrepareDesignChangeInput,
) {
  const files = new Map(base.files.map((file) => [file.path, file]));
  for (const operation of input.operations) {
    if (operation.kind === "put")
      files.set(operation.path, {
        path: operation.path,
        content: operation.content,
      });
    else if (!files.delete(operation.path))
      throw new ContractValidationError(
        "Удаляемый файл отсутствует в базовой версии.",
      );
  }
  const snapshot = normalizeDesignSnapshot({
    schemaVersion: "1.0",
    brief: input.brief ?? base.brief,
    sources: input.sources ?? base.sources,
    files: [...files.values()],
  });
  const contentHash = hashCanonicalJSON(snapshot);
  if (contentHash === hashCanonicalJSON(base))
    throw new ContractValidationError("Изменение не меняет выбранную версию.");
  return { snapshot, contentHash, diff: diffDesignSnapshots(base, snapshot) };
}
