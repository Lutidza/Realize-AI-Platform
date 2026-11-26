/**
 * @file .ai/tools/worker-assignment/src/admission/inspectApiAuditAdmission.service.ts
 * @version 1.2.2
 * @date 2026-11-26
 * @description Проверяет локально подготовленный запрос API и его диспетчер без сетевого вызова.
 * @see documentation/architecture/assignment-adapter/adapter-access-evidence-v1.md
 * @see documentation/specifications/task-management/execution/checkpoints-and-reads.md
 */
import type { AdapterAccessEvidenceV1 } from "@realize/ai-contracts";
import { isDeepStrictEqual as equal } from "node:util";
import { z } from "zod";
import { matchesReadReceipt } from "../exchange/performSingleRead.service";
import { auditMessagesSchema } from "../exchange/singleReadMessages.schemas";
import type { AuditContinuation } from "../exchange/SingleRead.types";
import { RepositoryReadError } from "../../../../../services/ai-control-plane/src/RepositoryRead.error";
import type {
  AdmissionAttempt,
  AuditApiAdapter,
  BoundAssignment,
} from "./AssignmentAdmission.types";
import { createAccessEvidence } from "./createAccessEvidence.mapper";
import { defineRepoReadFileTool } from "./defineRepoReadFileTool.mapper";
import { assessAdapterAdmission } from "./assessAdapterAdmission.validator";
import { AttemptObservations } from "./AttemptObservations.repository";

// Исходный запрос и все продолжения используют один закрытый каталог функций.
const requestSchema = z.strictObject({
  model: z.string().min(1),
  messages: auditMessagesSchema,
  tools: z.tuple([
    z.strictObject({
      type: z.literal("function"),
      function: z.strictObject({
        name: z.literal("repo_read_file"),
        parameters: z
          .object({
            properties: z.object({
              path: z.object({ enum: z.array(z.string()) }),
            }),
          })
          .passthrough(),
      }),
    }),
  ]),
});

async function isDenied(probe: () => Promise<unknown>) {
  try {
    await probe();
    return false;
  } catch (error) {
    return error instanceof RepositoryReadError && error.code === "FORBIDDEN";
  }
}

/** Возвращает метаданные и решение для локального запроса. Сетевого клиента у операции нет. */
export async function inspectApiAuditAdmission(
  bound: BoundAssignment,
  selectedAttempt: AdmissionAttempt,
  adapter: AuditApiAdapter,
  outsidePath: string,
  continuation: AuditContinuation | readonly AuditContinuation[] = [],
) {
  const attempt = structuredClone(selectedAttempt);
  const { effectiveAccess } = bound.report;
  const store = new AttemptObservations(attempt.attemptId);
  let request: ReturnType<AuditApiAdapter["currentRequest"]> = null;
  try {
    request = adapter.currentRequest();
  } catch {
    /* Недоступный получатель даёт binding_unavailable. */
  }
  const body = request?.body;
  const dispatch = request?.dispatch;
  const requestId = request?.id;
  const providerId = request?.providerId;
  const evidence = createAccessEvidence(bound.report, attempt.attemptId, {
    ...attempt.target,
    adapterId: adapter.adapterId,
    observedVersion: adapter.observedVersion,
  });
  const isCurrent = (
    id: string,
    binding: NonNullable<AdapterAccessEvidenceV1["binding"]>,
  ) =>
    !!request &&
    adapter.currentRequest() === request &&
    binding.kind === "request" &&
    id === attempt.attemptId &&
    request.attemptId === id &&
    binding.id === requestId &&
    request.id === requestId &&
    adapter.adapterId === attempt.target.adapterId &&
    request.body === body &&
    request.dispatch === dispatch &&
    request.providerId === providerId &&
    adapter.toolPolicy === "explicit-functions-only";
  const authority = { resolve: store.resolve, isCurrent };
  const finish = () => ({
    ...assessAdapterAdmission(bound.report, attempt, evidence, authority),
    evidence,
  });
  const fail = (code: string, reason: string) => {
    evidence.issues.push({ code, reason });
    return finish();
  };
  if (
    !request ||
    request.attemptId !== attempt.attemptId ||
    !requestId ||
    !body ||
    !providerId ||
    !dispatch
  )
    return fail("binding_unavailable", "Локальный запрос недоступен.");
  evidence.executor.providerId = providerId;
  if (adapter.toolPolicy !== "explicit-functions-only")
    return fail(
      "access_unverified",
      "Полный набор инструментов провайдера неизвестен.",
    );
  try {
    const raw: unknown = JSON.parse(body);
    const result = requestSchema.safeParse(raw);
    if (!result.success)
      return fail(
        "transport_access_mismatch",
        "Формат запроса или набор инструментов не подтверждён.",
      );
    const { model, messages, tools } = result.data;
    evidence.executor.selection = { kind: "model", id: model };
    if (
      messages[0].content !== bound.context.initialInput ||
      dispatch !== bound.context.callTool
    )
      return fail(
        "context_mismatch",
        "Текст назначения или обработчик чтения принадлежат другой привязке.",
      );
    const history = [continuation].flat();
    if (messages.length !== 1 + 2 * history.length)
      return fail(
        "tool_call_mismatch",
        "Число пар сообщений расходится с подтверждённой историей.",
      );
    const callIds = new Set<string>();
    const requestIds = new Set([requestId]);
    for (const [index, read] of history.entries()) {
      const { key, assistant, result: reply } = read;
      if (
        !matchesReadReceipt(bound, read) ||
        key.attemptId !== attempt.attemptId ||
        requestIds.has(key.requestId) ||
        callIds.has(key.toolCallId) ||
        key.toolCallId !== assistant.tool_calls[0].id ||
        key.toolCallId !== reply.tool_call_id ||
        !equal(messages[index * 2 + 1], assistant) ||
        !equal(messages[index * 2 + 2], reply)
      )
        return fail(
          "tool_call_mismatch",
          "Продолжение не соответствует ожидающему вызову.",
        );
      requestIds.add(key.requestId);
      callIds.add(key.toolCallId);
    }
    const paths = tools[0].function.parameters.properties.path.enum;
    if (
      !equal(paths.toSorted(), effectiveAccess.readPaths.toSorted()) ||
      !equal((raw as { tools: unknown }).tools, [defineRepoReadFileTool(paths)])
    )
      return fail(
        "transport_access_mismatch",
        "Схема reader расходится с параметрами или путями назначения.",
      );
    const routes = [{ tool: tools[0].function.name, via: "direct" }] as const;
    const access = evidence.access;
    access.coverage = "complete";
    access.routes = [...routes];
    access.readPaths = paths.toSorted();
    access.writePaths = [...effectiveAccess.writePaths];
    evidence.observations.push(
      store.record("tool-catalog", {
        coverage: access.coverage,
        routes: access.routes,
        readPaths: access.readPaths,
      }),
    );
    evidence.observations.push(
      store.record("dispatch-policy", {
        routes: effectiveAccess.tools.map((tool) => ({ tool, via: "direct" })),
        readPaths: effectiveAccess.readPaths.toSorted(),
        writePaths: effectiveAccess.writePaths,
        readsPinned: effectiveAccess.enforced,
      }),
    );
    const verified: string[] = [];
    for (const path of access.readPaths) {
      const read = await dispatch("repo_read_file", { path, lineCount: 1 });
      if (
        read.path !== path ||
        read.version.sha256 !== bound.context.readPins[path]
      )
        return fail(
          "transport_read_mismatch",
          "Проверка закреплённого файла не прошла.",
        );
      verified.push(path);
    }
    access.readsPinned = true;
    evidence.observations.push(
      store.record("read-probe", { readPaths: verified, readsPinned: true }),
    );
    access.outsideReadDenied = await isDenied(() =>
      dispatch("repo_read_file", { path: outsidePath, lineCount: 1 }),
    );
    access.writeDenied = await isDenied(() => dispatch("repo_write_file", {}));
    evidence.observations.push(
      store.record("denial-probe", {
        outsideReadDenied: access.outsideReadDenied,
        writeDenied: access.writeDenied,
      }),
    );
    evidence.binding = { kind: "request", id: requestId };
    return finish();
  } catch (error) {
    if (error instanceof RepositoryReadError && error.code === "CONFLICT")
      return fail(
        "transport_read_mismatch",
        "Содержимое файла отличается от закреплённой версии.",
      );
    return fail(
      "access_unverified",
      "Не удалось проверить запрос или закреплённые файлы через диспетчер.",
    );
  }
}
