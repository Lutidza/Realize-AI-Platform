/**
 * @file packages/ai-contracts/src/capabilities.ts
 * @version 2026-09-01
 * @description Задаёт provider-neutral контракт server-owned AI capabilities.
 * @docref Realize AI Commerce v1.0 — Change Engine
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/11-change-engine.md
 */

import type { ChangeRiskLevel } from "./api";

/** Стабильная ссылка на exact версию capability или server-owned контракта. */
export type VersionedContractReference = {
  id: string;
  version: string;
};

/** Нормативные классы изменений, доступные Capability Registry. */
export type CapabilityClass =
  | "code"
  | "configuration"
  | "content"
  | "data"
  | "design"
  | "frontend"
  | "module"
  | "plugin"
  | "release"
  | "schema";

/** Hash-bound решения, которые policy может потребовать для capability. */
export type CapabilityApprovalStage =
  | "implementation_acceptance"
  | "plan_approval"
  | "preview_acceptance"
  | "release_approval"
  | "rollback_confirmation"
  | "write_confirmation";

/** Read/write ceiling, который installation binding может только сузить. */
export type CapabilityScopePolicy = {
  protectedResources: "deny" | "operator-only";
  read: readonly string[];
  write: readonly string[];
};

/** Ограничения количества затрагиваемых ресурсов для одного invocation. */
export type CapabilityLimits = {
  maxBatchSize: number;
  maxTargets: number;
};

/** Детерминированные свойства исполнения, публикуемые registry. */
export type CapabilitySupport = {
  dryRun: boolean;
  idempotency: boolean;
  preview: boolean;
  rollback: boolean;
};

/**
 * Сериализуемое описание одной server-owned возможности.
 *
 * Строковые implementation references являются registry IDs, а не командами
 * или исполняемым содержимым installation config.
 */
export type CapabilityDescriptor = {
  actions: readonly string[];
  approvals: readonly CapabilityApprovalStage[];
  capabilityClass: CapabilityClass;
  description: string;
  executor: VersionedContractReference;
  id: string;
  inputSchema: VersionedContractReference;
  limits: CapabilityLimits;
  projectProfiles: readonly string[];
  requiredCheckIDs: readonly string[];
  resolver: VersionedContractReference;
  riskLevel: ChangeRiskLevel;
  riskSignals: readonly string[];
  scopes: CapabilityScopePolicy;
  support: CapabilitySupport;
  title: string;
  version: string;
};

/** Exact ссылка, сохраняемая в run, Change Request и installation binding. */
export type CapabilityReference = Pick<CapabilityDescriptor, "id" | "version">;
