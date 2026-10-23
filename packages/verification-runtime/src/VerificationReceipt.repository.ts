/**
 * @file packages/verification-runtime/src/VerificationReceipt.repository.ts
 * @version 1.1.0
 * @date 2026-10-22
 * @description Хранит только runner receipts в отдельном namespace общего безопасного atomic JSON owner.
 */
import { PolicyError } from "@realize/git-runtime";
import { PrivateJsonRepository } from "./PrivateJson.repository.ts";
import type {
  VerificationPlan,
  VerificationCheck,
  VerificationReceipt,
  VerificationOptions,
} from "./Verification.types.ts";
import { hashVerificationValue } from "./hashVerificationRecipe.util.ts";

export function verificationReceiptRepository(
  plan: VerificationPlan,
  check: VerificationCheck,
  options: VerificationOptions,
): PrivateJsonRepository {
  return new PrivateJsonRepository({
    root: options.storage.root,
    relativePath: `${options.storage.directory}/${hashVerificationValue([plan.projectId, plan.taskId])}/check-${hashVerificationValue(check.id)}.json`,
  });
}

export function sealVerificationReceipt(
  value: Omit<VerificationReceipt, "integrity">,
): VerificationReceipt {
  return { ...value, integrity: hashVerificationValue(value) };
}

/** Корректный JSON или прежний log не заменяет типизированный завершённый receipt с целым binding. */
export async function readVerificationReceipt(
  plan: VerificationPlan,
  check: VerificationCheck,
  options: VerificationOptions,
): Promise<VerificationReceipt | null> {
  const raw = await verificationReceiptRepository(plan, check, options).load();
  if (raw === null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new PolicyError("verification_receipt_invalid", "Receipt повреждён.");
  const receipt = raw as VerificationReceipt;
  const { integrity, ...value } = receipt;
  const allowed = [
    "version",
    "receiptId",
    "projectId",
    "taskId",
    "checkId",
    "recipeKey",
    "key",
    "status",
    "startedAt",
    "finishedAt",
    "result",
    "integrity",
  ];
  if (
    Object.keys(raw).some((key) => !allowed.includes(key)) ||
    integrity !== hashVerificationValue(value) ||
    receipt.version !== 1 ||
    receipt.projectId !== plan.projectId ||
    receipt.taskId !== plan.taskId ||
    receipt.checkId !== check.id ||
    typeof receipt.receiptId !== "string" ||
    !/^[0-9a-f-]{36}$/u.test(receipt.receiptId) ||
    !/^[0-9a-f]{64}$/u.test(receipt.key) ||
    !/^[0-9a-f]{64}$/u.test(receipt.recipeKey) ||
    !["running", "passed", "failed", "cancelled"].includes(receipt.status) ||
    !Number.isFinite(Date.parse(receipt.startedAt)) ||
    (receipt.status !== "running" &&
      (!receipt.result ||
        receipt.result.status !== receipt.status ||
        !Number.isFinite(Date.parse(receipt.finishedAt ?? "")))) ||
    (receipt.status === "passed" &&
      (receipt.result?.exitCode !== 0 || receipt.result.reason))
  )
    throw new PolicyError(
      "verification_receipt_invalid",
      "Receipt повреждён или не соответствует проверке.",
    );
  return receipt;
}
