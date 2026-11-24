/**
 * @file packages/template-contracts/src/layouts/createTemplateLayoutCatalog.service.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Связывает проверенный каталог exact layout references с SHA-256 без чтения source файлов.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import { createHash } from "node:crypto";
import type { TemplateLayoutCatalog } from "./LayoutDescriptor.types";
import { parseTemplateLayoutCatalog } from "./parseTemplateLayoutCatalog.validator";
import { freezeLayoutValue } from "./freezeLayoutValue.util";
import { LayoutContractError } from "./LayoutContract.error";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Hash покрывает descriptor metadata, alias pins и template version; код и bytes guides не хешируются. */
export function createTemplateLayoutCatalog(
  value: unknown,
  expectedCatalogHash?: string,
): TemplateLayoutCatalog {
  const parsed = parseTemplateLayoutCatalog(value);
  const snapshot = {
    template: parsed.template,
    defaultLayoutId: parsed.defaultLayoutId,
    aliases: parsed.aliases,
    descriptors: parsed.descriptors,
  };
  const catalogHash = createHash("sha256")
    .update(canonicalJson(snapshot), "utf8")
    .digest("hex");
  if ("catalogHash" in parsed && parsed.catalogHash !== catalogHash)
    throw new LayoutContractError("HASH_MISMATCH", "/catalogHash");
  if (expectedCatalogHash !== undefined && expectedCatalogHash !== catalogHash)
    throw new LayoutContractError("STALE_CATALOG", "/expectedCatalogHash");
  return freezeLayoutValue({ ...snapshot, catalogHash });
}
