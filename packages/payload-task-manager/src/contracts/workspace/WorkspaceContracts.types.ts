/**
 * @file packages/payload-task-manager/src/contracts/workspace/WorkspaceContracts.types.ts
 * @version 1.0.0
 * @date 2026-10-13
 * @description Выводит типы локального досье и manifest из единственных строгих workspace schemas.
 * @see documentation/specifications/task-management-execution.md
 */
import type { z } from "zod";
import type { workspaceTaskSchema } from "./workspaceTask.validator";
import type { workspaceArtifactManifestSchema } from "./workspaceArtifactManifest.validator";
import type { workspaceResultSchema } from "./workspaceResult.validator";
import type { workspaceTransitionSchema } from "./workspaceTransition.validator";

/** Локальная идентичность и предметные состояния сохраняются отдельно от server task refs. */
export type WorkspaceTask = z.infer<typeof workspaceTaskSchema>;
export type WorkspaceTaskStatus = WorkspaceTask["status"];
export type WorkspaceExecution = WorkspaceTask["execution"];
export type WorkspaceAcceptance = WorkspaceTask["acceptance"];
export type WorkspaceDelivery = WorkspaceTask["delivery"];
export type WorkspaceTaskRef = NonNullable<WorkspaceTask["taskRef"]>;

/** Версии файлов, provenance и удержания; содержимое остаётся у storage adapter. */
export type WorkspaceArtifactManifest = z.infer<
  typeof workspaceArtifactManifestSchema
>;
export type WorkspaceArtifact = WorkspaceArtifactManifest["artifacts"][number];
export type WorkspaceArtifactProducer = WorkspaceArtifact["producer"];
export type WorkspaceArtifactProducerIdentity = NonNullable<
  WorkspaceArtifactProducer["identity"]
>;
export type WorkspaceArtifactRetention = WorkspaceArtifact["retention"];

/** Manifest конкретной сдачи результата, ещё не решение о его приёмке. */
export type WorkspaceResult = z.infer<typeof workspaceResultSchema>;
export type WorkspaceResultArtifact = WorkspaceResult["artifacts"][number];
export type WorkspaceResultCheck = WorkspaceResult["checks"][number];

/** Allowlist предметного перехода и наблюдаемых projections без runtime controls. */
export type WorkspaceTransition = z.infer<typeof workspaceTransitionSchema>;
