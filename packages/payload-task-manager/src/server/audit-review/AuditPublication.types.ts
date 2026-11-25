/**
 * @file packages/payload-task-manager/src/server/audit-review/AuditPublication.types.ts
 * @version 1.1.0
 * @date 2026-11-25
 * @description Определяет версионированный вход досье и ссылки, которые может получить очередь ревью.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
export type AuditTaskBinding = {
  projectId: string;
  taskId: string;
  taskRevision: number;
  executionId: string;
  planRevision: number;
  stageId: string;
  taskAssignmentId: string;
  assignmentRevision: number;
};

export type AuditFileCoverage = {
  path: string;
  sha256: string;
  status: "read" | "unread";
  ranges: { startLine: number; endLine: number }[];
  receipts: {
    sourceRequestId: string;
    requestId: string;
    toolCallId: string;
    startLine: number;
    endLine: number;
    truncated: boolean;
  }[];
};

/** Вход закрытого серверного адаптера. Исходные байты не входят в сообщение очереди. */
export type AuditPublication = {
  schemaVersion: 1;
  attemptId: string;
  checkpointRevision: number;
  task: AuditTaskBinding;
  report: string;
  reportSha256: string;
  coverage: AuditFileCoverage[];
  handoffSha256: string;
  sources: { path: string; sha256: string; bytes: Buffer }[];
};

export type AuditArtifactRef = {
  artifactId: string;
  revision: number;
  sha256: string;
};
export type PublishedAudit = {
  resultId: string;
  resultRevision: number;
  task: AuditTaskBinding;
  attemptId: string;
  checkpointRevision: number;
  handoffSha256: string;
  report: AuditArtifactRef;
  coverage: AuditArtifactRef;
};
export type ReviewTarget = {
  executionId: string;
  stageId: string;
  assignmentId: string;
  assignmentRevision: number;
  iteration: number;
};

export type ReviewDelivery = Pick<
  PublishedAudit,
  "task" | "resultId" | "resultRevision" | "report" | "coverage"
> & {
  target: ReviewTarget;
  rework?: {
    workId: string;
    parentConclusionId: string;
    parentConclusionRevision: number;
    parentConclusionSha256: string;
    kind: "return_audit" | "clarify_reviewer";
    conclusionRevision: number;
  };
};
