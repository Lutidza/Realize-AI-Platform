/**
 * @file .ai/tools/worker-assignment/test/publication/AuditReviewParticipants.types.ts
 * @version 1.1.0
 * @date 2026-11-26
 * @description Описывает данные участника и состав ролей тестового сценария ревью.
 */
export type ReviewParticipant = {
  readonly name: string;
  readonly email: string;
};

export type AuditReviewParticipants = {
  readonly auditor: ReviewParticipant;
  readonly implementationAuthor: ReviewParticipant;
  readonly independentReviewer: ReviewParticipant;
  readonly replacementReviewer: ReviewParticipant;
};

export type AssignedReviewerRole =
  "independentReviewer" | "implementationAuthor";
