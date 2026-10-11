/**
 * @file scripts/runtime/evaluation/checkEvaluationGate.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет exact baseline и review перед выпуском изменённого агентского runtime.
 */
import { evaluationEnvelopeSchema } from "@realize/ai-contracts/evaluation";
import { assessEvaluationReport } from "@realize/change-engine/evaluation";
import { readReleaseSourceJSON } from "../../release/readReleaseSourceFiles.adapter";
import { readEvaluationFingerprint } from "./readEvaluationFingerprint.service";

/** Файлы берутся из доверенного owner checkout; hash сам по себе не подтверждает автора evidence. */
export async function checkEvaluationGate(
  root: string,
  reportPath: string,
  reviewPath: string,
) {
  const envelope = evaluationEnvelopeSchema.parse(
    await readReleaseSourceJSON(root, reportPath),
  );
  const fingerprint = await readEvaluationFingerprint(root);
  const age = Date.now() - Date.parse(envelope.report.createdAt);
  if (age < -300_000 || age > 7 * 24 * 60 * 60 * 1000)
    throw new Error("EVAL_EVIDENCE_EXPIRED");
  for (const [key, value] of Object.entries(fingerprint)) {
    if (envelope.report.candidate[key as keyof typeof fingerprint] !== value)
      throw new Error(`EVAL_STALE_EVIDENCE:${key}`);
  }
  if (
    envelope.report.environment.platform !== process.platform ||
    envelope.report.environment.architecture !== process.arch ||
    envelope.report.environment.nodeVersion !== process.version
  )
    throw new Error("EVAL_ENVIRONMENT_MISMATCH");
  const review = await readReleaseSourceJSON(root, reviewPath);
  const result = assessEvaluationReport(envelope, review);
  if (result.status !== "passed")
    throw new Error(`EVAL_GATE_${result.status.toUpperCase()}`);
  return { reportHash: envelope.contentHash, ...result };
}
