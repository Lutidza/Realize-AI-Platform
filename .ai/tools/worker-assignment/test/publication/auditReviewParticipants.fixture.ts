/**
 * @file .ai/tools/worker-assignment/test/publication/auditReviewParticipants.fixture.ts
 * @version 1.1.1
 * @date 2026-11-26
 * @description Готовит тестовые данные участников для сценариев публикации и ревью.
 */
import { randomUUID } from "node:crypto";
import type { AuditReviewParticipants } from "./AuditReviewParticipants.types";
import type { FoundationProjectMembership } from "./FoundationTask.types";

/** Распределение полномочий в сценарии независимого ревью. */
export const sampleReviewProjectRoles = {
  owner: "auditor",
  taskAuthor: "implementationAuthor",
  assignee: null,
  members: [
    "auditor",
    "implementationAuthor",
    "independentReviewer",
    "replacementReviewer",
  ],
} as const satisfies FoundationProjectMembership<keyof AuditReviewParticipants>;

/** Каждый набор получает свои адреса для изолированной регистрации в общей тестовой БД. */
export function sampleAuditReviewParticipants(): AuditReviewParticipants {
  const suffix = `+${randomUUID()}@example.invalid`;
  return {
    auditor: { name: "Аудитор", email: `auditor${suffix}` },
    implementationAuthor: {
      name: "Автор реализации",
      email: `author${suffix}`,
    },
    independentReviewer: {
      name: "Независимый ревьюер",
      email: `reviewer${suffix}`,
    },
    replacementReviewer: {
      name: "Второй независимый ревьюер",
      email: `replacement${suffix}`,
    },
  };
}
