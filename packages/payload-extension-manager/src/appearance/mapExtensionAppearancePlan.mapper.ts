/**
 * @file packages/payload-extension-manager/src/appearance/mapExtensionAppearancePlan.mapper.ts
 * @version 1.0.0
 * @date 2026-10-12
 * @description Возвращает allowlist плана без actor/request metadata.
 * @see documentation/specifications/extension-management.md
 */
import type {
  ExtensionAssignment,
  ExtensionAppearancePlan,
  ExtensionAppearancePlanDto,
} from "./ExtensionAppearance.types";

/** Detached settings не позволяют потребителю менять immutable plan в памяти вызывающего сервиса. */
export function mapExtensionAppearancePlan(
  plan: ExtensionAppearancePlan,
  current: ExtensionAssignment | null,
): ExtensionAppearancePlanDto {
  return {
    planId: plan.id,
    planHash: plan.hash,
    action: plan.action,
    target: plan.target,
    expectedRevision: plan.expectedRevision,
    catalogHash: plan.catalogHash,
    current: current === null ? null : structuredClone(current),
    desiredAssignment: structuredClone(plan.desiredAssignment),
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
  };
}
