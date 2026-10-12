/**
 * @file packages/template-contracts/src/parseTemplateManifest.validator.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Принимает manifest только после строгой проверки package contract.
 */

import { TemplateContractError } from "./TemplateContract.error";
import type { TemplateManifest } from "./TemplateManifest.types";
import { templateManifestSchema } from "./templateManifest.schemas";

/** Не выполняет exports, не загружает settings schema и не подтверждает доверие к коду. */
export function parseTemplateManifest(input: unknown): TemplateManifest {
  const result = templateManifestSchema.safeParse(input);
  if (!result.success) throw new TemplateContractError("INVALID_MANIFEST");
  return result.data;
}
