/**
 * @file .ai/tools/worker-assignment/test/publication/AuditReviewFixture.types.ts
 * @version 1.0.2
 * @date 2026-11-26
 * @description Описывает входные данные сценария публикации аудита и назначения ревьюера.
 * @see documentation/specifications/task-management/execution/audit-report-publication.md
 */
import type { ReviewTarget } from "@realize/payload-task-manager/audit-review";
import type { CheckpointAuditInput } from "../checkpoints/CheckpointScenario.types";
import type { setupCheckpointStorage } from "../checkpoints/checkpointStorage.fixture";
import type {
  AssignedReviewerRole,
  AuditReviewParticipants,
} from "./AuditReviewParticipants.types";
import type {
  FoundationProjectMembership,
  FoundationTaskFields,
} from "./FoundationTask.types";

export type AuditReviewFixtureOptions = {
  audit: CheckpointAuditInput;
  participants: AuditReviewParticipants;
  assignedReviewerRole: AssignedReviewerRole;
  review: Omit<ReviewTarget, "executionId">;
  foundation: FoundationTaskFields;
  projectRoles: FoundationProjectMembership<keyof AuditReviewParticipants>;
  runAudit: (
    scenario: Awaited<ReturnType<typeof setupCheckpointStorage>>,
  ) => Promise<void>;
};
