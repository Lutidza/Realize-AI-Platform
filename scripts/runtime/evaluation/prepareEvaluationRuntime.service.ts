/**
 * @file scripts/runtime/evaluation/prepareEvaluationRuntime.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Проверяет integration/model и финансовый admission до bounded модельного прогона.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CodexAccountClient } from "@realize/codex-adapter/account";
import { CodexConnectionService } from "@realize/payload-ai-control/server/integration-runtime";
import {
  readUsageIdentity,
  EvaluationAdmissionRepository,
} from "@realize/payload-ai-control/server/usage";
import type { Pool } from "pg";

/** Применяет текущую модель интеграции или единственную default model/list; fallback не подставляется. */
export async function prepareEvaluationRuntime(
  pool: Pool,
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
  allowUnknownSubscriptionCost: boolean,
) {
  const lease = await new CodexConnectionService({
    pool,
    encryptionKey: environment.REALIZE_INTEGRATIONS_ENCRYPTION_KEY,
    sourceEnvironment: environment,
  }).acquire({ isolated: true });
  try {
    const account = await CodexAccountClient.connect({
      ...lease,
      codexBinary: environment.REALIZE_CODEX_BINARY || undefined,
      signal: AbortSignal.any([signal, lease.signal]),
    });
    let models;
    try {
      models = await account.listModels();
    } finally {
      await account.close();
    }
    const defaults = models.filter((model) => model.isDefault);
    const model =
      lease.model || (defaults.length === 1 ? defaults[0].model : undefined);
    if (!model || !models.some((item) => item.model === model))
      throw new Error("EVAL_MODEL_UNAVAILABLE");
    const { stdout } = await promisify(execFile)(
      environment.REALIZE_CODEX_BINARY || "codex",
      ["--version"],
      {
        env: lease.environment,
        timeout: 5000,
        maxBuffer: 4096,
        signal,
      },
    );
    const version = stdout.trim();
    if (!/^codex-cli [\w.+-]+$/.test(version))
      throw new Error("EVAL_CODEX_VERSION_INVALID");
    const identity = readUsageIdentity(environment);
    const hardBudget = await new EvaluationAdmissionRepository({
      pool,
    }).hasHardBudget(identity.installationId, identity.projectId);
    const subscription =
      lease.authMode === "chatgpt" && allowUnknownSubscriptionCost;
    if (!hardBudget && !subscription)
      throw new Error(
        "EVAL_HARD_BUDGET_REQUIRED_OR_EXPLICIT_SUBSCRIPTION_MODE",
      );
    return {
      lease,
      model,
      codexVersion: version,
      unknownCost: subscription
        ? ("subscription_bounded" as const)
        : ("deny" as const),
    };
  } catch (error) {
    await lease.dispose();
    throw error;
  }
}
