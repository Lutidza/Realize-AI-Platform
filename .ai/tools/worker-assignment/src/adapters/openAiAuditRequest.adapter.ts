/**
 * @file .ai/tools/worker-assignment/src/adapters/openAiAuditRequest.adapter.ts
 * @version 1.2.3
 * @date 2026-11-26
 * @description Готовит HTTP-запрос аудита, проверяет допуск V1 и связывает отправку с проверенными байтами.
 * @see documentation/architecture/assignment-adapter/openai-chat-completions.md
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import { randomUUID } from "node:crypto";
import {
  openAiChatPolicy,
  resolveOpenAiChatPolicy,
} from "realize-ai-platform/model-providers/openai-chat-completions-policy";
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import type {
  BoundAssignment,
  AdmissionAttempt,
} from "../admission/AssignmentAdmission.types";
import type { AuditContinuation } from "../exchange/SingleRead.types";
import { defineRepoReadFileTool } from "../admission/defineRepoReadFileTool.mapper";
import { inspectApiAuditAdmission } from "../admission/inspectApiAuditAdmission.service";
import { bindAssignment } from "../bindAssignment.service";
import type { ApiAuditSelection } from "./ApiAuditSelection.types";

/** Получатель и обработчик принадлежат адаптеру. Выбор модели приходит от оркестратора. */
export async function prepareOpenAiAudit(
  policy: RepositoryReadPolicy,
  selection: ApiAuditSelection,
) {
  const { lockPath, contextId, model } = selection;
  if (!contextId || !model) throw new Error("Требуются contextId и модель.");
  const bound = await bindAssignment(policy, lockPath, contextId);
  if (!bound.context) return { report: bound.report, request: undefined };
  const { providerId, adapterId } = openAiChatPolicy;
  const attempt = {
    attemptId: randomUUID(),
    bindingKind: "request",
    target: {
      adapterId,
      providerId,
      selection: { kind: "model", id: model },
    },
  } as const;
  return admitOpenAiAuditRequest(bound, attempt, lockPath);
}

/** Заново проверяет всю передаваемую историю и связывает запрос с диспетчером этой попытки. */
export async function admitOpenAiAuditRequest(
  bound: BoundAssignment,
  attempt: AdmissionAttempt,
  lockPath: string,
  continuation: AuditContinuation | readonly AuditContinuation[] = [],
) {
  const { providerId, adapterId, endpoint, method } = openAiChatPolicy;
  const model = attempt.target.selection.id;
  const user = { role: "user", content: bound.context.initialInput };
  const history = [continuation].flat();
  const request = Object.freeze({
    id: randomUUID(),
    attemptId: attempt.attemptId,
    providerId,
    endpoint,
    method,
    model,
    body: JSON.stringify({
      model,
      messages: [
        user,
        ...history.flatMap((read) => [read.assistant, read.result]),
      ],
      tools: [defineRepoReadFileTool(bound.report.effectiveAccess.readPaths)],
    }),
    dispatch: bound.context.callTool,
  });
  const providerPolicy = resolveOpenAiChatPolicy(request);
  const decision = await inspectApiAuditAdmission(
    bound,
    attempt,
    {
      adapterId,
      observedVersion: null,
      toolPolicy: providerPolicy?.toolPolicy ?? "unknown",
      currentRequest: () => request,
    },
    lockPath,
    history,
  );
  const report = { ...decision, providerPolicy };
  if (decision.status === "blocked") return { report };
  return { report, request, bound, attempt };
}

/** Проверяет рабочий адаптер локально и отдаёт только метаданные попытки. */
export async function preflightOpenAiAudit(
  policy: RepositoryReadPolicy,
  selection: ApiAuditSelection,
) {
  return (await prepareOpenAiAudit(policy, selection)).report;
}

/** При явно порученной отправке заново открывает контекст и проверяет собственную попытку. */
export async function submitOpenAiAuditRequest(
  policy: RepositoryReadPolicy,
  selection: ApiAuditSelection,
  apiKey: string,
) {
  const prepared = await prepareOpenAiAudit(policy, selection);
  if (!prepared.request) return { report: prepared.report };
  if (!apiKey.trim())
    throw new Error("Для отправки требуется учётная запись OpenAI API.");
  const { endpoint, method, body, dispatch } = prepared.request;
  const response = await fetch(endpoint, {
    method,
    body,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
  });
  return { report: prepared.report, response, dispatch };
}
