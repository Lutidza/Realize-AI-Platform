/**
 * @file packages/verification-runtime/src/runVerification.service.ts
 * @version 1.3.0
 * @date 2026-11-05
 * @description Выполняет только устаревшие checks, фиксирует running до spawn и перепроверяет inputs перед passed receipt.
 */
import { randomUUID } from "node:crypto";
import { PolicyError } from "@realize/git-runtime";
import type {
  VerificationOptions,
  VerificationResult,
  VerificationReport,
} from "./Verification.types.ts";
import { validateVerificationPlan } from "./validateVerificationPlan.validator.ts";
import { hashVerificationRecipe } from "./hashVerificationRecipe.util.ts";
import {
  readVerificationSharedCheckpoint,
  readVerificationCheckpoint,
} from "./readVerificationCheckpoint.adapter.ts";
import {
  verificationReceiptRepository,
  readVerificationReceipt,
  sealVerificationReceipt,
} from "./VerificationReceipt.repository.ts";
import { runVerificationProcess } from "./runVerificationProcess.adapter.ts";
import {
  measureVerificationMeasurement,
  measureVerificationMeasurementSync,
} from "./verificationMeasurement.util.ts";
import {
  assertVerificationRoot,
  verificationReason,
  verificationDiagnostic,
  verificationReport,
  verifyVerification,
} from "./verifyVerification.service.ts";

/** Запускает checks и receipts; необязательный onMeasurement сообщает локальные spans без записи в report. */
export async function runVerification(
  input: unknown,
  options: VerificationOptions,
): Promise<VerificationReport> {
  return measureVerificationMeasurement(options, "verification_run_total", () =>
    runVerificationCore(input, options),
  );
}

async function runVerificationCore(
  input: unknown,
  options: VerificationOptions,
): Promise<VerificationReport> {
  const plan = measureVerificationMeasurementSync(
    options,
    "plan_validation",
    () => validateVerificationPlan(input),
  );
  await measureVerificationMeasurement(options, "root_validation", () =>
    assertVerificationRoot(plan, options),
  );
  const lockStore = verificationReceiptRepository(
    plan,
    plan.checks[0],
    options,
  );
  try {
    return await lockStore.withExclusiveAccess(async () => {
      const results: VerificationResult[] = [];
      let shared = await measureVerificationMeasurement(
        options,
        "initial_shared_checkpoint",
        () => readVerificationSharedCheckpoint(plan.repositoryRoot, options),
      );
      for (const check of plan.checks) {
        const store = verificationReceiptRepository(plan, check, options);
        const base = {
          id: check.id,
          executed: false,
          reused: false,
          recipeKey: hashVerificationRecipe(check),
          key: null,
          receiptId: null,
          logPath: store.relativePath,
        };
        try {
          if (options.signal?.aborted)
            throw new PolicyError(
              "verification_cancelled",
              "Проверка отменена.",
            );
          const before = await measureVerificationMeasurement(
            options,
            "initial_check_checkpoint",
            () =>
              readVerificationCheckpoint(
                plan.repositoryRoot,
                check,
                shared,
                options,
              ),
          );
          const previous = await measureVerificationMeasurement(
            options,
            "receipt_read_validation",
            () => readVerificationReceipt(plan, check, options),
          ).catch(() => null);
          const canReuse = measureVerificationMeasurementSync(
            options,
            "receipt_reuse_decision",
            () =>
              check.reuse === "local" &&
              previous?.status === "passed" &&
              previous.key === before.digest &&
              previous.recipeKey === base.recipeKey,
          );
          if (canReuse && previous) {
            results.push({
              ...base,
              status: "passed",
              reused: true,
              key: before.digest,
              receiptId: previous.receiptId,
              ...(previous.result && previous.finishedAt
                ? {
                    evidence: {
                      startedAt: previous.startedAt,
                      finishedAt: previous.finishedAt,
                      durationMs: Math.max(
                        0,
                        Date.parse(previous.finishedAt) -
                          Date.parse(previous.startedAt),
                      ),
                      result: previous.result,
                    },
                  }
                : {}),
            });
            continue;
          }
          const running = {
            version: 1 as const,
            receiptId: randomUUID(),
            projectId: plan.projectId,
            taskId: plan.taskId,
            checkId: check.id,
            recipeKey: base.recipeKey,
            key: before.digest,
            status: "running" as const,
            startedAt: new Date().toISOString(),
          };
          await measureVerificationMeasurement(
            options,
            "running_receipt_write",
            () => store.save(sealVerificationReceipt(running)),
          );
          const result = await measureVerificationMeasurement(
            options,
            "subprocess",
            () =>
              runVerificationProcess(
                plan.repositoryRoot,
                check,
                before,
                options,
              ),
            (processResult) => ({
              outcome: processResult.status === "passed" ? "success" : "error",
            }),
          );
          try {
            const after = await measureVerificationMeasurement(
              options,
              "post_process_revalidation_total",
              async () => {
                shared = await measureVerificationMeasurement(
                  options,
                  "revalidation_shared_checkpoint",
                  () =>
                    readVerificationSharedCheckpoint(
                      plan.repositoryRoot,
                      options,
                    ),
                );
                return measureVerificationMeasurement(
                  options,
                  "revalidation_check_checkpoint",
                  () =>
                    readVerificationCheckpoint(
                      plan.repositoryRoot,
                      check,
                      shared,
                      options,
                    ),
                );
              },
              (after) => ({
                outcome:
                  after.digest === before.digest ? "success" : "invalidated",
              }),
            );
            if (after.digest !== before.digest) {
              result.status = "failed";
              result.reason = "verification_inputs_changed";
            }
          } catch (error) {
            result.status = "failed";
            result.reason = verificationReason(error);
          }
          const finishedAt = new Date().toISOString();
          await measureVerificationMeasurement(
            options,
            "finished_receipt_write",
            () =>
              store.save(
                sealVerificationReceipt({
                  ...running,
                  status: result.status,
                  finishedAt,
                  result,
                }),
              ),
          );
          results.push({
            ...base,
            status: result.status,
            executed: true,
            key: before.digest,
            receiptId: running.receiptId,
            ...(result.reason ? { reason: result.reason } : {}),
            evidence: {
              startedAt: running.startedAt,
              finishedAt,
              durationMs: Math.max(
                0,
                Date.parse(finishedAt) - Date.parse(running.startedAt),
              ),
              result,
            },
          });
        } catch (error) {
          results.push({
            ...base,
            status: options.signal?.aborted ? "cancelled" : "blocked",
            reason: verificationReason(error),
            diagnostic: verificationDiagnostic(error),
          });
        }
      }
      // Поздняя проверка могла изменить inputs уже завершённой: итог не выдаёт устаревший pass.
      const final = await measureVerificationMeasurement(
        options,
        "final_verification_total",
        () => verifyVerification(plan, options),
      ).catch(() => null);
      for (const result of results) {
        const verified = final?.checks.find((entry) => entry.id === result.id);
        if (
          result.status === "passed" &&
          (!verified ||
            verified.status !== "passed" ||
            verified.key !== result.key ||
            verified.receiptId !== result.receiptId)
        ) {
          result.status = "stale";
          result.reused = false;
          result.reason = "verification_inputs_changed";
        }
      }
      return verificationReport(plan, results);
    });
  } catch (error) {
    return verificationReport(
      plan,
      plan.checks.map((check) => ({
        id: check.id,
        status: "blocked",
        executed: false,
        reused: false,
        recipeKey: hashVerificationRecipe(check),
        key: null,
        receiptId: null,
        reason: verificationReason(error),
        diagnostic: verificationDiagnostic(error),
      })),
    );
  }
}
