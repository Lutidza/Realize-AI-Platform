/**
 * @file .ai/tools/worker-assignment/src/exchange/openSingleReadExchange.service.ts
 * @version 1.0.1
 * @date 2026-11-26
 * @description Ведёт одну попытку из двух допущенных запросов через предоставленный транспорт.
 * @see documentation/architecture/assignment-adapter/single-read.md
 */
import { isDeepStrictEqual as equal } from "node:util";
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { RepositoryReadError } from "../../../../../services/ai-control-plane/src/RepositoryRead.error";
import {
  admitOpenAiAuditRequest,
  prepareOpenAiAudit,
} from "../adapters/openAiAuditRequest.adapter";
import type { ApiAuditSelection } from "../adapters/ApiAuditSelection.types";
import { bindAssignment } from "../bindAssignment.service";
import { performSingleRead } from "./performSingleRead.service";
import {
  callResponseSchema,
  reportResponseSchema,
} from "./singleReadMessages.schemas";
import type { AuditCallKey, SingleReadTransport } from "./SingleRead.types";

const blocked = (code: string, reason: string) => ({
  status: "blocked" as const,
  issues: [{ code, reason }],
});

/** Отправляет только байты допущенного запроса. Ошибка транспорта после входа в send не допускает повтор. */
async function exchange(
  transport: SingleReadTransport,
  request: { attemptId: string; id: string; body: string },
) {
  const { attemptId, id: requestId, body } = request;
  try {
    const reply = await transport.send({ attemptId, requestId, body });
    if (reply.attemptId !== attemptId || reply.requestId !== requestId)
      return blocked(
        "request_mismatch",
        "Ответ не принадлежит ожидаемому запросу попытки.",
      );
    return { status: "replied" as const, body: reply.body };
  } catch {
    return {
      status: "delivery_unknown" as const,
      issues: [
        {
          code: "delivery_unknown",
          reason: "Нет подтверждения доставки запроса.",
        },
      ],
    };
  }
}

/** Обрабатывает единственный ответ исходного запроса. finish принимает только ключ зарегистрированного результата. */
export async function openSingleReadExchange(
  policy: RepositoryReadPolicy,
  selection: ApiAuditSelection,
  transport: SingleReadTransport,
) {
  const { lockPath, contextId } = selection;
  const initial = await prepareOpenAiAudit(policy, selection);
  if (!initial.request) return initial.report;
  const { attempt, request, bound } = initial;
  const { assignmentId, revision, lockSha256 } = bound.report;
  const identity = {
    assignmentId,
    revision,
    lockSha256,
    contextId,
    attemptId: attempt.attemptId,
    executor: attempt.target,
    policyRevision: initial.report.providerPolicy!.revision,
    sourceRequestId: request.id,
  };
  const first = await exchange(transport, request);
  if (first.status !== "replied")
    return { ...identity, requestId: request.id, ...first };
  const parsed = callResponseSchema.safeParse(first.body);
  if (!parsed.success)
    return {
      ...identity,
      ...blocked("tool_call_invalid", "Ожидался один вызов функции."),
    };
  let read;
  try {
    read = await performSingleRead(
      bound,
      attempt.attemptId,
      request.id,
      parsed.data.choices[0].message,
    );
  } catch (error) {
    return {
      ...identity,
      ...blocked(
        error instanceof RepositoryReadError ? error.code : "INVALID_INPUT",
        "Чтение не подтверждено.",
      ),
    };
  }

  const { operation } = read;
  let continuation: typeof read.continuation | undefined = read.continuation;
  let conflicted = false;
  const mismatch = () => ({
    ...identity,
    operation,
    ...blocked(
      "tool_call_mismatch",
      "Результат не принадлежит ожидающему вызову.",
    ),
  });

  async function deliver() {
    const saved = continuation;
    continuation = undefined;
    if (!saved || conflicted) return mismatch();
    const fresh = await bindAssignment(policy, lockPath, contextId);
    if (!fresh.context)
      return {
        ...identity,
        operation,
        status: "blocked" as const,
        issues: fresh.report.issues,
      };
    if (
      fresh.report.lockSha256 !== lockSha256 ||
      fresh.report.assignmentId !== assignmentId ||
      fresh.report.revision !== revision ||
      fresh.context.initialInput !== bound.context.initialInput
    )
      return {
        ...identity,
        operation,
        ...blocked("context_mismatch", "Привязка или пакет изменились."),
      };
    const next = await admitOpenAiAuditRequest(fresh, attempt, lockPath, saved);
    if (!next.request)
      return {
        ...identity,
        operation,
        status: "blocked" as const,
        issues: next.report.issues,
      };
    if (next.report.providerPolicy?.revision !== identity.policyRevision)
      return {
        ...identity,
        operation,
        ...blocked("access_unverified", "Ревизия политики изменилась."),
      };
    if (operation.receipt) {
      try {
        await fresh.context.callTool("repo_read_file", {
          path: operation.receipt.path,
          lineCount: 1,
          expectedSha256: operation.receipt.sha256,
        });
      } catch (error) {
        return {
          ...identity,
          operation,
          ...blocked(
            error instanceof RepositoryReadError
              ? error.code
              : "access_unverified",
            "Передача закреплённой версии не подтверждена.",
          ),
        };
      }
    }
    if (conflicted) return mismatch();
    const destination = { ...identity, operation, requestId: next.request.id };
    const reply = await exchange(transport, next.request);
    if (reply.status !== "replied") return { ...destination, ...reply };
    if (conflicted) return mismatch();
    const final = reportResponseSchema.safeParse(reply.body);
    if (!final.success)
      return {
        ...destination,
        ...blocked(
          "result_missing",
          "Ожидалось финальное сообщение без открытых вызовов.",
        ),
      };
    return {
      ...destination,
      status: "received" as const,
      issues: [],
      output: final.data.choices[0].message.content,
    };
  }

  // До первого await резервируем передачу за одним обработчиком. Повтор получает тот же исход.
  let delivery: ReturnType<typeof deliver> | undefined;
  const finish = (key: AuditCallKey) => {
    if (!equal(key, operation.key)) {
      conflicted = true;
      continuation = undefined;
      return Promise.resolve(structuredClone(mismatch()));
    }
    delivery ??= deliver();
    return delivery.then((result) => structuredClone(result));
  };
  return {
    ...structuredClone(identity),
    status: "pending" as const,
    operation: structuredClone(operation),
    finish,
  };
}
