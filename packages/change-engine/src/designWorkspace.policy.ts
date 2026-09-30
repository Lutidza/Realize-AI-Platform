/**
 * @file packages/change-engine/src/designWorkspace.policy.ts
 * @version 1.0.0
 * @date 2026-09-25
 * @description Строит проверенный manifest файловой проекции из immutable DB snapshot.
 * @see documentation/specifications/design-workshop.md
 */
import { createHash } from "node:crypto";
import {
  ContractValidationError,
  designWorkspaceSourceSchema,
  type DesignWorkspaceManifest,
  type DesignWorkspaceReceipt,
} from "@realize/ai-contracts";
import { normalizeDesignSnapshot } from "./designSnapshot.policy";
import { hashCanonicalJSON } from "./canonicalJson";

/** Только полное совпадение canonical hash разрешает подготовку файлов; I/O здесь нет. */
export function prepareDesignWorkspace(value: unknown) {
  const parsed = designWorkspaceSourceSchema.safeParse(value);
  if (!parsed.success)
    throw new ContractValidationError(
      "Недопустимый источник файловой версии макета.",
    );
  const source = {
    pin: parsed.data.pin,
    snapshot: normalizeDesignSnapshot(parsed.data.snapshot),
  };
  if (hashCanonicalJSON(source.snapshot) !== source.pin.revision.contentHash)
    throw new ContractValidationError(
      "Содержимое не соответствует сохранённой версии макета.",
    );
  const manifest: DesignWorkspaceManifest = {
    ...source.pin,
    files: source.snapshot.files.map(({ path, content }) => ({
      path,
      sha256: createHash("sha256").update(content, "utf8").digest("hex"),
      bytes: Buffer.byteLength(content, "utf8"),
    })),
  };
  const receipt: DesignWorkspaceReceipt = {
    ...source.pin,
    mode: "snapshot_directory",
    manifestHash: hashCanonicalJSON(manifest),
    fileCount: manifest.files.length,
    totalBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
  };
  return { source, manifest, receipt };
}
