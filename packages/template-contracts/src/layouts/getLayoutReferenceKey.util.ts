/**
 * @file packages/template-contracts/src/layouts/getLayoutReferenceKey.util.ts
 * @version 1.0.0
 * @date 2026-11-17
 * @description Сопоставляет exact layout references без потери scope identity и native версии.
 * @see documentation/specifications/realize-ai-control-panel-first-release.md
 */
import type { LayoutVersionedRef } from "./LayoutDescriptor.types";

/** Tuple key не смешивает разделители внутри разных частей identity/version. */
export function getLayoutReferenceKey(reference: LayoutVersionedRef): string {
  return JSON.stringify([
    reference.identity.namespace,
    reference.identity.id,
    reference.version,
  ]);
}
