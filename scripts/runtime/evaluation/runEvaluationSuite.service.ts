/**
 * @file scripts/runtime/evaluation/runEvaluationSuite.service.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Выполняет шесть ограниченных сценариев, сохраняя immutable evidence и расходы неудач.
 */
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  writeFile,
  rm,
  realpath,
  lstat,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Pool } from "pg";
import {
  UsageLedgerRepository,
  readUsageIdentity,
} from "@realize/payload-ai-control/server/usage";
import { hashCanonicalJSON } from "@realize/change-engine";
import {
  EVALUATION_SUITE,
  EVALUATION_SCENARIOS,
  EVALUATION_BUDGET,
  assessEvaluationReport,
} from "@realize/change-engine/evaluation";
import {
  evaluationReportSchema,
  type EvaluationReport,
} from "@realize/ai-contracts/evaluation";
import { readEvaluationFingerprint } from "./readEvaluationFingerprint.service";
import { prepareEvaluationRuntime } from "./prepareEvaluationRuntime.service";
import { runEvaluationCase } from "./runEvaluationCase.service";
import type { EvaluationSuiteOptions } from "./EvaluationRuntime.types";

/** CLI принадлежит владельцу checkout; HTTP endpoint для произвольного запуска отсутствует. */
export async function runEvaluationSuite(options: EvaluationSuiteOptions) {
  if (
    !/^\.ai-workspace\/tasks\/[a-z0-9-]+\/logs\/[a-z0-9.-]+\.json$/.test(
      options.output,
    )
  )
    throw new Error("EVAL_OUTPUT_PATH_INVALID");
  const root = await realpath(options.root),
    output = resolve(root, options.output),
    parent = dirname(output);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  if ((await realpath(parent)) !== parent)
    throw new Error("EVAL_OUTPUT_SYMLINK");
  try {
    await lstat(output);
    throw new Error("EVAL_OUTPUT_EXISTS");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const lock = output + ".lock";
  await mkdir(lock, { mode: 0o700 });
  const pool = new Pool({
    connectionString:
      options.environment.DATABASE_URI || options.environment.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
    statement_timeout: 8000,
  });
  let prepared:
    Awaited<ReturnType<typeof prepareEvaluationRuntime>> | undefined;
  let workspace: string | undefined;
  const started = performance.now();
  const timeout = AbortSignal.timeout(EVALUATION_BUDGET.maxDurationMs);
  const signal = AbortSignal.any([options.signal, timeout]);
  try {
    if (!options.environment.DATABASE_URI && !options.environment.DATABASE_URL)
      throw new Error("EVAL_DATABASE_REQUIRED");
    const fingerprint = await readEvaluationFingerprint(root);
    prepared = await prepareEvaluationRuntime(
      pool,
      options.environment,
      signal,
      options.allowUnknownSubscriptionCost,
    );
    if (options.preflight)
      return {
        preflight: "passed",
        ...fingerprint,
        model: prepared.model,
        authMode: prepared.lease.authMode,
        codexVersion: prepared.codexVersion,
        unknownCost: prepared.unknownCost,
      };
    const runId = randomUUID();
    const report: EvaluationReport = {
      schemaVersion: "1.0",
      runId,
      createdAt: new Date().toISOString(),
      suite: EVALUATION_SUITE,
      candidate: {
        ...fingerprint,
        model: prepared.model,
        authMode: prepared.lease.authMode,
        platformReleaseId: readUsageIdentity(options.environment)
          .platformReleaseId,
        modelCatalogRevision: null,
        routerPolicyVersion: null,
      },
      environment: {
        platform: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
        codexVersion: prepared.codexVersion,
      },
      budget: { ...EVALUATION_BUDGET, unknownCost: prepared.unknownCost },
      elapsedMs: 0,
      termination: "completed",
      cases: [],
    };
    const tmp = join(dirname(parent), "tmp");
    await mkdir(tmp, { recursive: true, mode: 0o700 });
    if ((await realpath(tmp)) !== tmp)
      throw new Error("EVAL_WORKSPACE_SYMLINK");
    workspace = await mkdtemp(join(tmp, "eval-"));
    const usage = new UsageLedgerRepository({ pool });
    const tokens = new Map<string, number>();
    let tokenLimit = false;
    const onTokens = (attemptId: string, count: number) => {
      tokens.set(attemptId, count);
      tokenLimit =
        [...tokens.values()].reduce((sum, x) => sum + x, 0) >=
        EVALUATION_BUDGET.maxObservedTokens;
      return tokenLimit;
    };
    outer: for (let repeat = 0; repeat < EVALUATION_SUITE.repeats; repeat++) {
      for (const scenario of EVALUATION_SCENARIOS) {
        if (signal.aborted || tokenLimit) {
          report.termination = "budget";
          break outer;
        }
        let result;
        try {
          result = await runEvaluationCase({
            runtime: {
              pool,
              lease: prepared.lease,
              model: prepared.model,
              environment: options.environment,
              candidate: report.candidate,
              signal,
              writer: usage,
              taskId: `eval:${runId}`,
              budget: report.budget,
              onTokens,
            },
            directory: join(workspace, `${scenario.id}-${repeat}`),
            scenarioId: scenario.id,
            repeat,
          });
        } catch {
          report.termination = "failure";
          break outer;
        }
        report.cases.push(result);
        console.log(
          JSON.stringify({
            scenarioId: scenario.id,
            repeat,
            outcome: result.outcome,
            stopReason: result.stopReason,
            attemptId: result.attemptId,
          }),
        );
        // Ошибка инфраструктуры не разрешает шесть одинаковых платных повторов.
        if (result.stopReason !== "none") {
          report.termination =
            signal.aborted || tokenLimit ? "budget" : "failure";
          break outer;
        }
      }
    }
    try {
      await prepared.lease.dispose();
    } catch {
      report.termination = "failure";
    } finally {
      prepared = undefined;
    }
    try {
      await rm(workspace, { recursive: true, force: true });
      workspace = undefined;
    } catch {
      report.termination = "failure";
    }
    report.elapsedMs = Math.round(performance.now() - started);
    // Нельзя утверждать связь с кодом, изменившимся во время модели.
    if (
      hashCanonicalJSON(await readEvaluationFingerprint(root)) !==
      hashCanonicalJSON(fingerprint)
    )
      report.termination = "failure";
    const parsed = evaluationReportSchema.parse(report),
      envelope = { report: parsed, contentHash: hashCanonicalJSON(parsed) };
    await writeFile(output, JSON.stringify(envelope, null, 2) + "\n", {
      flag: "wx",
      mode: 0o640,
    });
    return {
      output: options.output,
      contentHash: envelope.contentHash,
      assessment: assessEvaluationReport(envelope),
    };
  } finally {
    try {
      await prepared?.lease.dispose();
    } finally {
      try {
        await pool.end();
      } finally {
        if (workspace) await rm(workspace, { recursive: true, force: true });
        await rm(lock, { recursive: true, force: true });
      }
    }
  }
}
