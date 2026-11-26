/**
 * @file packages/payload-task-manager/src/server/audit-review/rework/auditRevisionResponses.validator.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Проверяет, что аудитор адресовал каждый возвращённый критерий и привёл точную цитату новой версии.
 * @see documentation/specifications/task-management/execution/review-rework.md
 */
import { z } from "zod";
import { REVIEW_CRITERIA } from "../conclusions/reviewCriteria.constants";
import type { AuditRework } from "../conclusions/ReviewAcceptance.types";
import type { AuditRevisionResponse } from "./AuditRevision.types";

const text = z.string().refine((s) => s.trim().length > 0);
const responsesSchema = z
  .array(
    z.strictObject({
      criterion: z.enum(REVIEW_CRITERIA),
      response: text,
      reportQuote: text,
    }),
  )
  .min(1)
  .max(REVIEW_CRITERIA.length);

/** Сохраняет точные тексты, нормализуя только порядок пунктов по сохранённому решению. */
export function validateAuditRevisionResponses(
  work: AuditRework,
  report: string,
  input: unknown,
): AuditRevisionResponse[] {
  const fields = responsesSchema.safeParse(input);
  if (!fields.success || fields.data.length !== work.points.length)
    throw new Error("audit_revision_responses_invalid");
  const byCriterion = new Map(
    fields.data.map((item) => [item.criterion, item]),
  );
  return work.points.map((point) => {
    const item = byCriterion.get(point.criterion);
    if (!item || !report.includes(item.reportQuote))
      throw new Error("audit_revision_responses_invalid");
    return item;
  });
}
