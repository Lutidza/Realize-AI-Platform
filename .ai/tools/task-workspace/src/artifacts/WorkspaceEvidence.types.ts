/**
 * @file .ai/tools/task-workspace/src/artifacts/WorkspaceEvidence.types.ts
 * @version 1.0.1
 * @date 2026-10-15
 * @description Описывает вход публикации результата и ограниченную синхронную фазу проверки evidence.
 * @see documentation/specifications/task-management-execution.md
 */
import type {
  WorkspaceArtifact,
  WorkspaceArtifactManifest,
  WorkspaceResult,
  WorkspaceResultArtifact,
} from "@realize/payload-task-manager/workspace-contracts";

/** Identity, revision, criteriaHash и submittedAt назначаются владельцем публикации. */
export type PublishWorkspaceResultInput = Pick<
  WorkspaceResult,
  "summary" | "artifacts" | "checks"
>;

/** Capability действует только внутри синхронного callback без записей; storage и dossier не подменяются. */
export type WorkspaceEvidencePhase = Readonly<{
  assertContext(
    storage: import("../filesystem/WorkspaceFs.adapter.mjs").WorkspaceFs,
    dossier: import("../dossier/Dossier.types.ts").WorkspaceDossier,
  ): void;
  verifyArtifact(artifact: WorkspaceArtifact): void;
  verifyEvidence(
    manifest: WorkspaceArtifactManifest,
    refs: WorkspaceResultArtifact[] | null,
    evidence: string,
  ): void;
}>;
