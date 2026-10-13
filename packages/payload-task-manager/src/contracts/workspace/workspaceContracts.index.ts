/**
 * @file packages/payload-task-manager/src/contracts/workspace/workspaceContracts.index.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Публикует чистые локальные workspace contracts отдельно от серверного Foundation API.
 * @see documentation/specifications/task-management-execution.md
 */
export { workspaceTaskSchema } from "./workspaceTask.validator";
export { workspaceArtifactManifestSchema } from "./workspaceArtifactManifest.validator";
export { workspaceResultSchema } from "./workspaceResult.validator";
export { workspaceTransitionSchema } from "./workspaceTransition.validator";
export type {
  WorkspaceTask,
  WorkspaceTaskStatus,
  WorkspaceExecution,
  WorkspaceAcceptance,
  WorkspaceDelivery,
  WorkspaceTaskRef,
  WorkspaceArtifactManifest,
  WorkspaceArtifact,
  WorkspaceArtifactProducer,
  WorkspaceArtifactProducerIdentity,
  WorkspaceArtifactRetention,
  WorkspaceResult,
  WorkspaceResultArtifact,
  WorkspaceResultCheck,
  WorkspaceTransition,
} from "./WorkspaceContracts.types";
