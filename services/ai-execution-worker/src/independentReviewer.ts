/**
 * @file services/ai-execution-worker/src/independentReviewer.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Запускает отдельную read-only проверку через выбранную интеграцию Codex.
 */

import { createHash, randomUUID } from "node:crypto";

import type { AgentEvent } from "@realize/ai-contracts";
import { buildIndependentReviewDeveloperInstructions } from "@realize/change-engine";
import { OpenAICodexAdapter } from "@realize/codex-adapter";
import type { CodexConnectionResolver } from "@realize/payload-ai-control/server/integration-runtime";

import type { ExecutionWorkerConfig } from "./config";
import type {
  ClaimedPreviewDeployment,
  IndependentReviewResult,
} from "./previewTypes";

/** Expected fail-closed rejection from an independent reviewer. */
export class IndependentReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndependentReviewError";
  }
}

const boundedText = (value: unknown, maximum: number, name: string): string => {
  if (typeof value !== "string") {
    throw new IndependentReviewError(`Reviewer ${name} must be a string.`);
  }
  const result = value.trim();
  if (!result || result.length > maximum) {
    throw new IndependentReviewError(
      `Reviewer ${name} must contain 1 to ${maximum} characters.`,
    );
  }
  return result;
};

/** Parses the exact reviewer JSON contract and rejects ambiguous output. */
export const parseIndependentReview = (
  value: string,
  model?: string,
): IndependentReviewResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.trim());
  } catch {
    throw new IndependentReviewError("Reviewer returned invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new IndependentReviewError(
      "Reviewer result must be one JSON object.",
    );
  }
  const source = parsed as Record<string, unknown>;
  if (!["approved", "changes_requested"].includes(String(source.status))) {
    throw new IndependentReviewError("Reviewer status is invalid.");
  }
  if (!Array.isArray(source.findings) || source.findings.length > 50) {
    throw new IndependentReviewError(
      "Reviewer findings must be an array of at most 50 items.",
    );
  }
  const findings = source.findings.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new IndependentReviewError("Reviewer finding must be an object.");
    }
    const finding = item as Record<string, unknown>;
    if (!["blocking", "warning"].includes(String(finding.severity))) {
      throw new IndependentReviewError("Reviewer finding severity is invalid.");
    }
    if (
      !["architecture", "correctness", "security", "tests"].includes(
        String(finding.category),
      )
    ) {
      throw new IndependentReviewError("Reviewer finding category is invalid.");
    }
    let path: string | undefined;
    if (finding.path !== undefined) {
      path = boundedText(finding.path, 240, "finding path");
      if (
        path.startsWith("/") ||
        path.includes("\0") ||
        path.split("/").includes("..")
      ) {
        throw new IndependentReviewError("Reviewer finding path is unsafe.");
      }
    }
    return {
      category: finding.category as
        "architecture" | "correctness" | "security" | "tests",
      ...(path ? { path } : {}),
      severity: finding.severity as "blocking" | "warning",
      summary: boundedText(finding.summary, 500, "finding summary"),
    };
  });
  const status = source.status as "approved" | "changes_requested";
  if (
    status === "approved" &&
    findings.some((item) => item.severity === "blocking")
  ) {
    throw new IndependentReviewError(
      "Approved review contains a blocking finding.",
    );
  }
  const summary = boundedText(source.summary, 1_000, "summary");
  const completedAt = new Date().toISOString();
  return {
    completedAt,
    evidenceHash: createHash("sha256")
      .update(JSON.stringify([status, summary, findings]))
      .digest("hex"),
    findings,
    model,
    status,
    summary,
  };
};

/** Executes one independent reviewer turn with no implementation thread reuse. */
export const runIndependentReview = async (input: {
  config: ExecutionWorkerConfig;
  codex: CodexConnectionResolver;
  job: ClaimedPreviewDeployment;
  workspace: string;
}): Promise<IndependentReviewResult> => {
  const lease = await input.codex.acquire();
  const adapter = new OpenAICodexAdapter({
    codexBinary: input.config.codexBinary,
    environment: lease.environment,
    signal: lease.signal,
  });
  const runID = randomUUID();
  let content = "";
  let failure: string | undefined;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void adapter.cancelRun(runID);
  }, input.config.reviewTimeoutMs);
  timer.unref();
  try {
    for await (const event of adapter.runTurn({
      cwd: input.workspace,
      developerInstructions: buildIndependentReviewDeveloperInstructions(),
      ephemeral: true,
      model: input.config.reviewModel,
      prompt: [
        `Change Request: ${input.job.changeRequestID}.`,
        `Base commit: ${input.job.baseCommit}.`,
        `Accepted diff SHA-256: ${input.job.sourceDiffHash}.`,
        `Approved paths: ${JSON.stringify(input.job.allowedPaths)}.`,
        `Original request: ${input.job.originalRequest}`,
        `Approved plan: ${input.job.plan}`,
        "Inspect git diff --cached and relevant repository context, then return the required JSON verdict.",
      ].join("\n\n"),
      runID,
      sandboxProfile: "review-readonly",
    })) {
      const normalized = event as AgentEvent;
      if (normalized.type === "assistant.completed")
        content = normalized.content;
      else if (normalized.type === "run.failed") failure = normalized.message;
      else if (normalized.type === "run.cancelled" && !timedOut) {
        failure = "Independent review was cancelled.";
      }
    }
  } finally {
    clearTimeout(timer);
    await lease.dispose();
  }
  if (timedOut)
    throw new IndependentReviewError("Independent review timed out.");
  if (failure) throw new IndependentReviewError(failure);
  return parseIndependentReview(content, input.config.reviewModel);
};
