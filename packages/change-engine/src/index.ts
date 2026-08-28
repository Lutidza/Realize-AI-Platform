/**
 * @file packages/change-engine/src/index.ts
 * @version 2026-08-28
 * @description Экспортирует политики plan, execution, preview, source promotion и release approval.
 */

import { createHash } from "node:crypto";

import type { ChangeRequestType, ChangeRiskLevel } from "@realize/ai-contracts";
import { buildDataOperationProtocolInstructions } from "./dataOperationProtocol";

/** Raised when an assistant answer is not concrete enough to approve safely. */
export class ChangePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChangePlanError";
  }
}

/** Deterministic structured projection derived from one assistant plan. */
export type DerivedChangePlan = {
  affectedPaths: string[];
  checks: string[];
  normalizedIntent: string;
  planHash: string;
  riskLevel: ChangeRiskLevel;
  scopeHash: string;
  title: string;
  type: ChangeRequestType;
};

const PROJECT_PATH =
  /(?:^|[\s(`'"\[])((?:\.ai|\.codex|documentation|packages|scripts|services|src|tests)\/[A-Za-z0-9@_./()[\]-]+)/gm;
const NPM_CHECK = /\bnpm run [a-z0-9:_-]+\b/gi;
const DEFAULT_CODE_CHECKS = [
  "node scripts/security/check-secrets.mjs",
  "npm run lint",
  "npm run typecheck",
  "npm run test:int",
  "npm run build",
] as const;

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const uniqueSorted = (values: string[]): string[] =>
  [...new Set(values)].sort();

const cleanPath = (value: string): string =>
  value.replace(/[),:;.!?\]}'"]+$/g, "");

const extractAffectedPaths = (plan: string): string[] => {
  const matches = [...plan.matchAll(PROJECT_PATH)].map((match) =>
    cleanPath(match[1] || ""),
  );
  return uniqueSorted(
    matches.filter(
      (path) =>
        path.length > 2 &&
        path.length <= 240 &&
        !path.includes("..") &&
        !path.startsWith("/"),
    ),
  ).slice(0, 100);
};

const classify = (
  plan: string,
  paths: string[],
): { riskLevel: ChangeRiskLevel; type: ChangeRequestType } => {
  const normalized = plan.toLocaleLowerCase("ru");
  if (
    paths.some((path) => path.startsWith("src/migrations/")) ||
    /\b(schema|migration|миграц|схем[аы]|collection)\b/u.test(normalized)
  ) {
    return { riskLevel: "R3", type: "SCHEMA_CHANGE" };
  }
  if (paths.every((path) => path.startsWith("documentation/"))) {
    return { riskLevel: "R3", type: "AGENCY_ENGINEERING_REQUEST" };
  }
  return { riskLevel: "R3", type: "CODE_CHANGE" };
};

/** Derives the immutable approval card fields from a persisted assistant plan. */
export const deriveChangePlan = (input: {
  originalRequest: string;
  plan: string;
}): DerivedChangePlan => {
  const plan = input.plan.trim();
  const originalRequest = input.originalRequest.trim();
  if (plan.length < 40) {
    throw new ChangePlanError(
      "План слишком короткий. Попросите ассистента перечислить шаги, пути и проверки.",
    );
  }

  const affectedPaths = extractAffectedPaths(plan);
  if (affectedPaths.length === 0) {
    throw new ChangePlanError(
      "В ответе нет точных путей проекта. Попросите ассистента подготовить план с affected paths.",
    );
  }

  const detectedChecks = plan
    .match(NPM_CHECK)
    ?.map((value) => value.toLocaleLowerCase("en-US"));
  const classification = classify(plan, affectedPaths);
  const checks = uniqueSorted([
    ...DEFAULT_CODE_CHECKS,
    ...(classification.type === "SCHEMA_CHANGE"
      ? ["npm run payload:migrate:status"]
      : []),
    ...(detectedChecks || []),
  ]);
  const normalizedIntent = originalRequest.replace(/\s+/g, " ").slice(0, 500);
  const title = (normalizedIntent || "Изменение из AI-диалога").slice(0, 120);
  const scope = JSON.stringify({ affectedPaths, checks });

  return {
    ...classification,
    affectedPaths,
    checks,
    normalizedIntent,
    planHash: sha256(plan),
    scopeHash: sha256(scope),
    title,
  };
};

/** Hashes every security-relevant field bound by a plan decision. */
export const createPlanApprovalBinding = (input: {
  actorID: string;
  actorRoles: string[];
  changeRequestID: string;
  decision: "approved" | "rejected";
  expiresAt: string;
  planHash: string;
  scopeHash: string;
  version: number;
}): string =>
  sha256(
    JSON.stringify([
      input.changeRequestID,
      input.version,
      input.planHash,
      input.scopeHash,
      input.decision,
      input.actorID,
      [...input.actorRoles].sort(),
      input.expiresAt,
    ]),
  );

/** Effective capability matrix enforced by the first browser-chat slice. */
export const READ_ONLY_CAPABILITIES = Object.freeze({
  approvePlan: true,
  changeCode: false,
  changeTheme: false,
  deployPreview: false,
  deployProduction: false,
  mutateCatalog: false,
  mutateContent: false,
  readCMS: false,
  readProject: true,
  createChangeRequest: true,
  rollback: false,
});

/** Produces provider-independent developer instructions for a read-only run. */
export const buildReadOnlyDeveloperInstructions = (): string => {
  return [
    "You are the read-only Realize E-Commerce project assistant.",
    "Answer in Russian unless the user explicitly requests another language.",
    "You may inspect files inside the supplied repository root.",
    "Never modify files, Git state, databases, external services, or configuration.",
    "Do not use MCP servers, web search, network tools, package installation, or sub-agents.",
    "If the user asks for a change, explain or propose a plan but do not execute it.",
    "A change plan must name exact repository paths, risks, and verification commands so an admin can review it.",
    "Cite relevant repository paths in the final answer and state uncertainty honestly.",
    "Do not reveal secrets, environment values, hidden reasoning, or raw customer data.",
    buildDataOperationProtocolInstructions(),
  ].join("\n");
};

export * from "./dataOperationPolicy";
export * from "./dataOperationProtocol";
export * from "./executionCapability";
export * from "./executionPolicy";
export * from "./previewPolicy";
export * from "./releasePolicy";
export * from "./sourcePromotionPolicy";
