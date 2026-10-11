/**
 * @file tests/int/evaluation-delivery-gate.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет настоящий release reader и gate на stale коде, истёкшем evidence и отсутствующем review.
 */
// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { hashCanonicalJSON } from "@realize/change-engine";
import { checkEvaluationGate } from "../../scripts/runtime/evaluation/checkEvaluationGate.service";
import { readEvaluationFingerprint } from "../../scripts/runtime/evaluation/readEvaluationFingerprint.service";
import {
  evaluationFixture,
  evaluationReviewFixture,
} from "./fixtures/evaluation.fixture";

describe("evaluation release gate", () => {
  it("requires fresh matching runtime evidence and bound review without model calls", async () => {
    const directory = `.ai-workspace/tasks/eval-gate-${randomUUID()}`;
    await mkdir(directory, { recursive: true });
    try {
      const envelope = evaluationFixture();
      Object.assign(
        envelope.report.candidate,
        await readEvaluationFingerprint(process.cwd()),
      );
      envelope.report.createdAt = new Date().toISOString();
      envelope.report.environment = {
        ...envelope.report.environment,
        platform: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
      };
      envelope.contentHash = hashCanonicalJSON(envelope.report);
      const review = evaluationReviewFixture(envelope);
      review.reviewedAt = new Date().toISOString();
      const reportPath = `${directory}/synthetic-report.json`,
        reviewPath = `${directory}/synthetic-review.json`;
      const save = async () => {
        envelope.contentHash = hashCanonicalJSON(envelope.report);
        await writeFile(reportPath, JSON.stringify(envelope));
      };
      await save();
      await writeFile(reviewPath, JSON.stringify(review));
      expect(
        (await checkEvaluationGate(process.cwd(), reportPath, reviewPath))
          .status,
      ).toBe("passed");
      await expect(
        checkEvaluationGate(
          process.cwd(),
          reportPath,
          `${directory}/absent.json`,
        ),
      ).rejects.toThrow();
      const original = envelope.report.candidate.runtimeHash;
      envelope.report.candidate.runtimeHash = "f".repeat(64);
      await save();
      await expect(
        checkEvaluationGate(process.cwd(), reportPath, reviewPath),
      ).rejects.toThrow("EVAL_STALE_EVIDENCE");
      envelope.report.candidate.runtimeHash = original;
      envelope.report.createdAt = new Date(
        Date.now() - 8 * 86400000,
      ).toISOString();
      await save();
      await expect(
        checkEvaluationGate(process.cwd(), reportPath, reviewPath),
      ).rejects.toThrow("EVAL_EVIDENCE_EXPIRED");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30000);
});
