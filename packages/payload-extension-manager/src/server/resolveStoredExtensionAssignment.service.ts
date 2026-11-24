/**
 * @file packages/payload-extension-manager/src/server/resolveStoredExtensionAssignment.service.ts
 * @version 1.1.0
 * @date 2026-11-12
 * @description Разрешает сохранённое назначение против текущей сборки, не изменяя исходный pointer.
 * @see documentation/specifications/extension-management.md
 */
import type { TemplateTarget } from "@realize/template-contracts";
import type { ExtensionAssignment } from "../appearance/ExtensionAppearance.types";
import type { ExtensionCatalog } from "../catalog/ExtensionCatalog.types";
import { assertExtensionAssignmentReady } from "../catalog/assertExtensionAssignmentReady.validator";
import { resolveExtensionAssignment } from "../catalog/resolveExtensionAssignment.validator";
import { hashExtensionValue } from "../appearance/hashExtensionValue.server";

/** Один контракт recovery используется runtime host и read-only inventory. */
export function resolveStoredExtensionAssignment(input: {
  catalog: ExtensionCatalog;
  target: TemplateTarget;
  current: ExtensionAssignment | null;
  fallback: ExtensionAssignment | null;
}): { assignment: ExtensionAssignment | null; requiresRecovery: boolean } {
  if (!input.current) return { assignment: null, requiresRecovery: false };
  try {
    const assignment = resolveExtensionAssignment({
      catalog: input.catalog,
      target: input.target,
      selection: input.current.selection,
      settings: input.current.settings,
    });
    if (hashExtensionValue(assignment) !== hashExtensionValue(input.current))
      throw new Error("ASSIGNMENT_CHANGED");
    assertExtensionAssignmentReady(input.catalog, assignment.selection);
    return { assignment, requiresRecovery: false };
  } catch {
    // Fallback также проходит exact validation и admission: сохранённый preview-only pointer не исполняется.
    try {
      if (!input.fallback) return { assignment: null, requiresRecovery: true };
      const fallback = resolveExtensionAssignment({
        catalog: input.catalog,
        target: input.target,
        selection: input.fallback.selection,
        settings: input.fallback.settings,
      });
      if (hashExtensionValue(fallback) !== hashExtensionValue(input.fallback))
        throw new Error("ASSIGNMENT_CHANGED");
      assertExtensionAssignmentReady(input.catalog, fallback.selection);
      return { assignment: fallback, requiresRecovery: true };
    } catch {
      return { assignment: null, requiresRecovery: true };
    }
  }
}
