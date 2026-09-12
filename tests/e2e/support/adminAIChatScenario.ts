/**
 * @file tests/e2e/support/adminAIChatScenario.ts
 * @version 1.0.0
 * @date 2026-09-11
 * @description Предоставляет deterministic chat, execution, preview, source и release fixtures.
 */

import type {
  AIStreamEvent,
  ChangeRequestDTO,
  ConversationDTO,
  ConversationDetailDTO,
  ExecutionJobDTO,
  MessageDTO,
  PreviewDeploymentDTO,
  ReleaseCandidateDTO,
  RunDTO,
  RunStatus,
} from "@realize/ai-contracts";
import type { Page, Route } from "@playwright/test";

import {
  sourcePromotionFor,
  type SourcePromotionFixtureState,
} from "./sourcePromotionFixture";

const createdAt = "2026-08-18T12:00:00.000Z";
const conversationID = "e2e-conversation";
const runID = "e2e-run";

export const ADMIN_AI_FINAL_ANSWER =
  "План: изменить src/components/Header/index.tsx и выполнить npm run typecheck.";
export const ADMIN_AI_USER_MESSAGE = "Проверь восстановление ответа";

const conversation: ConversationDTO = {
  createdAt,
  id: conversationID,
  lastMessageAt: createdAt,
  status: "active",
  title: "Проверка восстановления ответа",
  updatedAt: createdAt,
};

const userMessage: MessageDTO = {
  changePlan: { status: "unavailable", reason: "not_assistant" },
  content: ADMIN_AI_USER_MESSAGE,
  conversationID,
  createdAt,
  dataOperationIntentAvailable: false,
  id: "e2e-user-message",
  kind: "user_message",
  role: "user",
  runID,
  sequence: 1,
};

const assistantMessage: MessageDTO = {
  changePlan: { status: "ready" },
  content: ADMIN_AI_FINAL_ANSWER,
  conversationID,
  createdAt,
  dataOperationIntentAvailable: false,
  id: "e2e-assistant-message",
  kind: "assistant_message",
  role: "assistant",
  runID,
  sequence: 2,
};

type ExecutionFixtureState = "accepted" | "completed" | "none" | "queued";
type PreviewFixtureState = "accepted" | "none" | "queued" | "ready";
type ReleaseFixtureState = "approved" | "none" | "queued" | "ready";

const executionJobFor = (
  state: Exclude<ExecutionFixtureState, "none">,
): ExecutionJobDTO => {
  const completed = state === "completed" || state === "accepted";
  return {
    allowedPaths: ["src/components/Header/index.tsx"],
    artifactsExpireAt: "2099-08-20T12:00:00.000Z",
    baseCommit: "d".repeat(40),
    branch: "ai/change-e2e123456789",
    changedPaths: completed ? ["src/components/Header/index.tsx"] : [],
    checks: completed
      ? [
          {
            command: "npm run typecheck",
            durationMs: 1_420,
            evidenceHash: "e".repeat(64),
            finishedAt: createdAt,
            id: "e2e-check",
            outputSummary: "TypeScript checks passed.",
            startedAt: createdAt,
            status: "passed",
          },
        ]
      : [],
    createdAt,
    diff: completed
      ? "diff --git a/src/components/Header/index.tsx b/src/components/Header/index.tsx\n+// verified e2e change\n"
      : undefined,
    diffHash: completed ? "f".repeat(64) : undefined,
    diffStat: completed
      ? [
          {
            additions: 1,
            deletions: 0,
            path: "src/components/Header/index.tsx",
          },
        ]
      : [],
    diffTruncated: false,
    evidenceHash: completed ? "9".repeat(64) : undefined,
    finishedAt: completed ? createdAt : undefined,
    id: "e2e-execution-job",
    stage: completed ? "complete" : "queued",
    status: completed ? "completed" : "queued",
    updatedAt: createdAt,
    workerSummary: completed
      ? "Изменён только утверждённый Header; проверки пройдены."
      : undefined,
  };
};

const previewDeploymentFor = (
  state: Exclude<PreviewFixtureState, "none">,
): PreviewDeploymentDTO => {
  const ready = state === "ready" || state === "accepted";
  return {
    artifactHash: ready ? "1".repeat(64) : undefined,
    artifactKind: "local-git-preview",
    baseCommit: "d".repeat(40),
    branch: "ai/preview-e2e123456789",
    checks: ready
      ? [
          {
            command: "playwright preview smoke",
            durationMs: 2_100,
            evidenceHash: "2".repeat(64),
            finishedAt: createdAt,
            id: "e2e-preview-check",
            outputSummary:
              "Preview readiness and storefront passed in Chromium.",
            startedAt: createdAt,
            status: "passed",
          },
        ]
      : [],
    commitSHA: ready ? "3".repeat(40) : undefined,
    createdAt,
    environment: "local-preview",
    evidenceHash: ready ? "4".repeat(64) : undefined,
    expiresAt: "2099-08-21T12:00:00.000Z",
    healthSummary: ready ? "Readiness passed." : undefined,
    id: "e2e-preview-deployment",
    previewURL: ready ? "http://127.0.0.1:3200" : undefined,
    reviewer: ready
      ? {
          completedAt: createdAt,
          evidenceHash: "5".repeat(64),
          findings: [],
          status: "approved",
          summary: "Scope, architecture and checks are sufficient.",
        }
      : undefined,
    runtimeState: ready ? "active" : "pending",
    sourceDiffHash: "f".repeat(64),
    stage: ready ? "complete" : "queued",
    status: ready ? (state === "accepted" ? "accepted" : "ready") : "queued",
    treeHash: ready ? "6".repeat(40) : undefined,
    updatedAt: createdAt,
  };
};

const releaseCandidateFor = (
  state: Exclude<ReleaseFixtureState, "none">,
): ReleaseCandidateDTO => {
  const ready = state === "approved" || state === "ready";
  const imageDigest = `sha256:${"a".repeat(64)}`;
  return {
    artifactKind: "oci-image",
    configVersion: ready ? "payload-config-v1" : undefined,
    createdAt,
    environment: "oci-preview",
    evidenceHash: ready ? "b".repeat(64) : undefined,
    expiresAt: "2099-08-22T12:00:00.000Z",
    gitCommit: "3".repeat(40),
    healthSummary: ready ? "Readiness и smoke checks пройдены." : undefined,
    id: "e2e-release-candidate",
    imageDigest: ready ? imageDigest : undefined,
    imageRef: ready ? `ghcr.io/realize/e-commerce@${imageDigest}` : undefined,
    manifestHash: ready ? "c".repeat(64) : undefined,
    migrationSetHash: ready
      ? "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
      : undefined,
    migrations: [],
    pluginVersions: ready ? { payload: "3.88.0" } : {},
    previewStatus: ready ? "healthy" : "pending",
    previewURL: ready ? "https://oci-preview.example.test" : undefined,
    provenanceRef: ready ? "oci://provenance/e2e" : undefined,
    sbomDigest: ready ? `sha256:${"e".repeat(64)}` : undefined,
    signatureRef: ready ? "oci://signature/e2e" : undefined,
    signatureVerified: ready,
    sourcePreviewArtifactHash: "1".repeat(64),
    stage: ready ? "complete" : "queued",
    status: state === "approved" ? "approved" : ready ? "ready" : "queued",
    targetEnvironment: "production",
    updatedAt: createdAt,
  };
};

const changeFor = (
  approved: boolean,
  executionState: ExecutionFixtureState,
  previewState: PreviewFixtureState = "none",
  releaseState: ReleaseFixtureState = "none",
  sourcePromotionState: SourcePromotionFixtureState = "none",
): ChangeRequestDTO => ({
  ...(executionState === "accepted"
    ? {
        acceptance: {
          actorRole: "admin",
          boundHash: "8".repeat(64),
          createdAt,
          decision: "approved" as const,
          diffHash: "f".repeat(64),
          expiresAt: "2099-08-20T12:00:00.000Z",
          id: "e2e-acceptance",
        },
      }
    : {}),
  affectedPaths: ["src/components/Header/index.tsx"],
  ...(approved
    ? {
        approval: {
          actorRole: "admin",
          boundHash: "b".repeat(64),
          createdAt,
          decision: "approved" as const,
          expiresAt: "2099-08-19T12:00:00.000Z",
          id: "e2e-approval",
        },
      }
    : {}),
  checks: ["npm run typecheck"],
  conversationID,
  createdAt,
  execution: {
    enabled: approved && executionState === "none",
    ...(executionState !== "none"
      ? { job: executionJobFor(executionState) }
      : {}),
    reason:
      executionState === "none"
        ? approved
          ? undefined
          : "Сначала утвердите точную версию плана."
        : executionState === "queued"
          ? "Задача ожидает отдельный execution worker."
          : executionState === "accepted"
            ? "Результат принят. Перенос diff требует следующего workflow."
            : "Diff и проверки готовы для отдельного принятия человеком.",
  },
  expiresAt: "2099-08-19T12:00:00.000Z",
  id: "e2e-change-request",
  normalizedIntent: ADMIN_AI_USER_MESSAGE,
  originalRequest: ADMIN_AI_USER_MESSAGE,
  plan: ADMIN_AI_FINAL_ANSWER,
  planHash: "a".repeat(64),
  preview: {
    ...(previewState === "accepted"
      ? {
          acceptance: {
            actorRole: "admin",
            artifactHash: "1".repeat(64),
            boundHash: "7".repeat(64),
            createdAt,
            decision: "approved" as const,
            environment: "local-preview" as const,
            expiresAt: "2099-08-21T12:00:00.000Z",
            id: "e2e-preview-acceptance",
          },
        }
      : {}),
    ...(previewState !== "none"
      ? { deployment: previewDeploymentFor(previewState) }
      : {}),
    enabled: executionState === "accepted" && previewState === "none",
    reason:
      previewState === "queued"
        ? "Promotion ожидает отдельный code-lane worker."
        : previewState === "ready"
          ? "Preview готов для отдельного принятия человеком."
          : previewState === "accepted"
            ? "Preview принят; production не изменён."
            : executionState === "accepted"
              ? undefined
              : "Сначала примите точный diff и его evidence.",
  },
  release: {
    ...(releaseState === "approved"
      ? {
          approval: {
            actorRole: "admin",
            boundHash: "f".repeat(64),
            createdAt,
            decision: "approved" as const,
            environment: "production" as const,
            expiresAt: "2099-08-22T12:00:00.000Z",
            id: "e2e-release-approval",
            imageDigest: `sha256:${"a".repeat(64)}`,
            manifestHash: "c".repeat(64),
            migrationSetHash:
              "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
          },
        }
      : {}),
    ...(releaseState !== "none"
      ? { candidate: releaseCandidateFor(releaseState) }
      : {}),
    enabled: previewState === "accepted" && releaseState === "none",
    reason:
      releaseState === "queued"
        ? "OCI candidate ожидает отдельный release worker."
        : releaseState === "ready"
          ? "Signed OCI candidate готов для отдельного approval."
          : releaseState === "approved"
            ? "Exact digest утверждён; production deploy не запускался."
            : previewState === "accepted"
              ? undefined
              : "Сначала примите exact local preview artifact.",
  },
  riskLevel: "R3",
  scopeHash: "c".repeat(64),
  sourcePromotion: {
    ...(sourcePromotionState !== "none"
      ? { promotion: sourcePromotionFor(sourcePromotionState, createdAt) }
      : {}),
    enabled: previewState === "accepted" && sourcePromotionState === "none",
    reason:
      sourcePromotionState === "queued"
        ? "Публикация ожидает отдельный source-control worker."
        : sourcePromotionState === "ready"
          ? "Draft Pull Request создан; main не изменён."
          : previewState === "accepted"
            ? undefined
            : "Сначала примите exact local preview artifact.",
  },
  sourceMessageID: assistantMessage.id,
  state:
    releaseState === "approved"
      ? "release_approved"
      : releaseState === "ready"
        ? "awaiting_release_approval"
        : releaseState === "queued"
          ? "release_preparing"
          : previewState === "accepted"
            ? "preview_accepted"
            : previewState === "ready"
              ? "preview_ready"
              : previewState === "queued"
                ? "preview_queued"
                : executionState === "accepted"
                  ? "changes_accepted"
                  : executionState === "completed"
                    ? "changes_ready"
                    : executionState === "queued"
                      ? "execution_queued"
                      : approved
                        ? "plan_approved"
                        : "awaiting_plan_approval",
  title: "Глобальный drawer ассистента",
  type: "CODE_CHANGE",
  updatedAt: createdAt,
  version:
    releaseState === "approved"
      ? sourcePromotionState === "none"
        ? 19
        : 20
      : releaseState === "ready"
        ? sourcePromotionState === "none"
          ? 18
          : 19
        : releaseState === "queued"
          ? sourcePromotionState === "none"
            ? 17
            : 18
          : sourcePromotionState !== "none"
            ? 17
            : previewState === "accepted"
              ? 16
              : previewState === "ready"
                ? 15
                : previewState === "queued"
                  ? 9
                  : executionState === "accepted"
                    ? 8
                    : executionState === "completed"
                      ? 7
                      : executionState === "queued"
                        ? 3
                        : approved
                          ? 2
                          : 1,
});

const runFor = (status: RunStatus): RunDTO => ({
  conversationID,
  createdAt,
  ...(status === "completed" ? { finishedAt: createdAt } : {}),
  id: runID,
  provider: "openai-codex",
  sandboxProfile: "analysis-readonly",
  startedAt: createdAt,
  status,
  updatedAt: createdAt,
  ...(status === "completed"
    ? {
        usage: {
          cachedInputTokens: 0,
          inputTokens: 10,
          outputTokens: 12,
          totalTokens: 22,
        },
      }
    : {}),
});

const event = (
  sequence: number,
  type: AIStreamEvent["type"],
  payload: Record<string, unknown>,
): AIStreamEvent => ({
  createdAt,
  id: `e2e-event-${sequence}`,
  payload,
  runID,
  sequence,
  type,
  visibility: "user-visible",
});

const fulfillJSON = async (
  route: Route,
  data: unknown,
  status = 200,
): Promise<void> => {
  await route.fulfill({
    body: JSON.stringify({ correlationID: "e2e", data, ok: true }),
    contentType: "application/json",
    status,
  });
};

/** Installs a stateful API fixture that simulates recovery and durable approval. */
export const installAdminAIChatScenario = async (page: Page): Promise<void> => {
  let completed = false;
  let changeCreated = false;
  let planApproved = false;
  let executionState: ExecutionFixtureState = "none";
  let executionPolls = 0;
  let previewState: PreviewFixtureState = "none";
  let previewPolls = 0;
  let releaseState: ReleaseFixtureState = "none";
  let releasePolls = 0;
  let sourcePromotionState: SourcePromotionFixtureState = "none";
  let sourcePromotionPolls = 0;
  let questionSent = false;
  let runPolls = 0;

  await page.route("**/api/realize-ai/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/status")) {
      await fulfillJSON(route, {
        enabled: true,
        mode: "local-development",
        state: "ready",
      });
    } else if (path.endsWith("/conversations")) {
      await fulfillJSON(route, [conversation]);
    } else if (path.endsWith(`/conversations/${conversationID}`)) {
      if (executionState === "queued") {
        executionPolls += 1;
        if (executionPolls >= 2) executionState = "completed";
      }
      if (previewState === "queued") {
        previewPolls += 1;
        if (previewPolls >= 2) previewState = "ready";
      }
      if (releaseState === "queued") {
        releasePolls += 1;
        if (releasePolls >= 2) releaseState = "ready";
      }
      if (sourcePromotionState === "queued") {
        sourcePromotionPolls += 1;
        if (sourcePromotionPolls >= 2) sourcePromotionState = "ready";
      }
      const detail: ConversationDetailDTO = {
        changeRequests: changeCreated
          ? [
              changeFor(
                planApproved,
                executionState,
                previewState,
                releaseState,
                sourcePromotionState,
              ),
            ]
          : [],
        conversation,
        dataOperations: [],
        messages: questionSent
          ? [userMessage, ...(completed ? [assistantMessage] : [])]
          : [],
        runs: questionSent ? [runFor(completed ? "completed" : "running")] : [],
      };
      await fulfillJSON(route, detail);
    } else if (
      path.endsWith(`/conversations/${conversationID}/changes`) &&
      request.method() === "POST"
    ) {
      changeCreated = true;
      await fulfillJSON(route, changeFor(false, "none"), 201);
    } else if (
      path.endsWith("/changes/e2e-change-request/approve-plan") &&
      request.method() === "POST"
    ) {
      planApproved = true;
      await fulfillJSON(route, changeFor(true, "none"));
    } else if (
      path.endsWith("/changes/e2e-change-request/execute") &&
      request.method() === "POST"
    ) {
      executionState = "queued";
      executionPolls = 0;
      await fulfillJSON(route, changeFor(true, executionState), 202);
    } else if (
      path.endsWith("/changes/e2e-change-request/accept-implementation") &&
      request.method() === "POST"
    ) {
      executionState = "accepted";
      await fulfillJSON(route, changeFor(true, executionState, previewState));
    } else if (
      path.endsWith("/changes/e2e-change-request/publish-pull-request") &&
      request.method() === "POST"
    ) {
      sourcePromotionState = "queued";
      sourcePromotionPolls = 0;
      await fulfillJSON(
        route,
        changeFor(
          true,
          executionState,
          previewState,
          releaseState,
          sourcePromotionState,
        ),
        202,
      );
    } else if (
      path.endsWith("/changes/e2e-change-request/deploy-preview") &&
      request.method() === "POST"
    ) {
      previewState = "queued";
      previewPolls = 0;
      await fulfillJSON(
        route,
        changeFor(true, executionState, previewState),
        202,
      );
    } else if (
      path.endsWith("/changes/e2e-change-request/accept-preview") &&
      request.method() === "POST"
    ) {
      previewState = "accepted";
      await fulfillJSON(route, changeFor(true, executionState, previewState));
    } else if (
      path.endsWith("/changes/e2e-change-request/prepare-release") &&
      request.method() === "POST"
    ) {
      releaseState = "queued";
      releasePolls = 0;
      await fulfillJSON(
        route,
        changeFor(
          true,
          executionState,
          previewState,
          releaseState,
          sourcePromotionState,
        ),
        202,
      );
    } else if (
      path.endsWith("/changes/e2e-change-request/approve-release") &&
      request.method() === "POST"
    ) {
      releaseState = "approved";
      await fulfillJSON(
        route,
        changeFor(
          true,
          executionState,
          previewState,
          releaseState,
          sourcePromotionState,
        ),
      );
    } else if (
      path.endsWith(`/conversations/${conversationID}/messages`) &&
      request.method() === "POST"
    ) {
      questionSent = true;
      await fulfillJSON(
        route,
        { message: userMessage, run: runFor("queued") },
        202,
      );
    } else if (path.endsWith(`/runs/${runID}/events`)) {
      const body = [
        `id: e2e-event-1\nevent: run.started\ndata: ${JSON.stringify(event(1, "run.started", {}))}\n\n`,
        `id: e2e-event-2\nevent: assistant.delta\ndata: ${JSON.stringify(event(2, "assistant.delta", { delta: "Проверяю durable state…" }))}\n\n`,
      ].join("");
      await route.fulfill({
        body,
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream",
        },
        status: 200,
      });
    } else if (path.endsWith(`/runs/${runID}`)) {
      runPolls += 1;
      completed = runPolls >= 2;
      await fulfillJSON(route, runFor(completed ? "completed" : "running"));
    } else {
      await route.abort("failed");
    }
  });
};
