/**
 * @file .ai/tools/worker-assignment/src/preflightAssignment.service.ts
 * @version 1.2.1
 * @date 2026-11-26
 * @description Проверяет каталог и реальный маршрут MCP-чтения на сохранённой привязке до модельного хода.
 */
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createAccessEvidence } from "./admission/createAccessEvidence.mapper";
import type { RepositoryReadPolicy } from "realize-ai-platform/repository-read-policy";
import { assessAdapterAdmission } from "./admission/assessAdapterAdmission.validator";
import { AttemptObservations } from "./admission/AttemptObservations.repository";
import { bindAssignment } from "./bindAssignment.service";
import { openCodexPreflight } from "./openCodexPreflight.adapter";
import { readAssignmentDefinition } from "./readAssignmentDefinition.service";
import { validateAssignmentInventory } from "./validateAssignmentInventory.validator";

const success = z.object({
  isError: z.literal(false).optional(),
  structuredContent: z.object({
    path: z.string(),
    startLine: z.literal(1),
    text: z.string(),
    version: z.object({ sha256: z.string() }),
  }),
});
const denied = z.object({
  isError: z.literal(true),
  structuredContent: z.undefined().optional(),
  content: z
    .array(z.object({ type: z.literal("text"), text: z.string() }))
    .min(1),
});

/** Проверки используют соединение открытой сессии. Отчёт содержит только metadata, без байтов исходников. */
export async function preflightAssignment(
  policy: RepositoryReadPolicy,
  lockPath: string,
  contextId: string,
  openSession = openCodexPreflight,
) {
  if (!contextId) throw new Error("Требуется contextId.");
  const bound = await bindAssignment(policy, lockPath, contextId);
  if (!bound.context) return { ...bound.report, cliVersion: null };
  const { assignmentId, revision, lockSha256, effectiveAccess } = bound.report;
  const identity = { contextId, assignmentId, revision, lockSha256 };
  const attempt = {
    attemptId: randomUUID(),
    bindingKind: "session",
    target: {
      adapterId: "codex",
      providerId: "openai",
      selection: { kind: "profile", id: "static-read-only" },
    },
  } as const;
  const store = new AttemptObservations(attempt.attemptId);
  const evidence = createAccessEvidence(bound.report, attempt.attemptId, {
    ...attempt.target,
    observedVersion: null,
  });
  const { observations, access } = evidence;
  let session: Awaited<ReturnType<typeof openCodexPreflight>> | undefined;
  const blocked = (code: string, reason: string) => {
    const cliVersion = session?.cliVersion ?? null;
    evidence.executor.observedVersion = cliVersion;
    evidence.issues = [{ code, reason }];
    // Команда закрывает сессию. Даже успешные MCP-пробы не дают полномочий на последующую передачу.
    const decision = assessAdapterAdmission(bound.report, attempt, evidence, {
      resolve: store.resolve,
      isCurrent: () => false,
    });
    return {
      ...identity,
      threadId: session?.threadId,
      cliVersion,
      ...decision,
      evidence,
    };
  };
  try {
    const definition = await readAssignmentDefinition(policy, lockPath);
    if (definition.lockSha256 !== lockSha256)
      return blocked("context_mismatch", "Версия привязки изменилась.");
    session = await openSession(policy.root, lockPath, contextId, lockSha256);
    if (
      !validateAssignmentInventory(
        await session.list(),
        effectiveAccess.readPaths,
      )
    )
      return blocked(
        "transport_access_mismatch",
        "Каталог MCP этой сессии расходится с точными правами назначения.",
      );
    access.coverage = "partial";
    access.writePaths = [];
    observations.push(
      store.record("tool-catalog", {
        coverage: "partial",
        routes: null,
        readPaths: effectiveAccess.readPaths,
      }),
    );
    const verifiedPaths: string[] = [];
    for (const path of effectiveAccess.readPaths) {
      const sha = definition.lock.files[path];
      const result = success.safeParse(
        await session.call("repo_read_file", {
          path,
          lineCount: 1,
          expectedSha256: sha,
        }),
      );
      if (
        !result.success ||
        result.data.structuredContent.path !== path ||
        result.data.structuredContent.version.sha256 !== sha
      )
        return blocked(
          "transport_read_mismatch",
          "Не подтверждена версия файла " + path,
        );
      verifiedPaths.push(path);
    }
    access.readPaths = verifiedPaths;
    access.readsPinned = true;
    observations.push(
      store.record("read-probe", {
        readPaths: verifiedPaths,
        readsPinned: true,
      }),
    );
    const adjacent = [lockPath, definition.lock.manifestPath].find(
      (path) => !verifiedPaths.includes(path),
    );
    if (!adjacent)
      return blocked(
        "probe_unavailable",
        "Нет контрольного пути вне области чтения.",
      );
    const outside = denied.safeParse(
      await session.call("repo_read_file", { path: adjacent, lineCount: 1 }),
    );
    if (
      !outside.success ||
      !outside.data.content.some(
        (item) =>
          item.text.includes("path") && item.text.includes("validation"),
      )
    )
      return blocked(
        "transport_access_mismatch",
        "Не подтверждён отказ для пути вне назначения.",
      );
    access.outsideReadDenied = true;
    // Каталог уже исключил запись. Пустые аргументы не содержат адресата и данных для изменения.
    const unknown = denied.safeParse(await session.call("repo_write_file", {}));
    if (
      !unknown.success ||
      !unknown.data.content.some((item) =>
        /unknown tool|tool (?:not found|not available)|unregistered tool|FORBIDDEN/i.test(
          item.text,
        ),
      )
    )
      return blocked(
        "transport_access_mismatch",
        "Отказ для незарегистрированного инструмента не подтверждён.",
      );
    access.writeDenied = true;
    observations.push(
      store.record("denial-probe", {
        outsideReadDenied: true,
        writeDenied: true,
      }),
    );
    return {
      ...blocked(
        "native_tools_unverified",
        "App Server подтвердил права MCP. Полный каталог исполнителя не подтверждён.",
      ),
      mcp: {
        status: "verified",
        tools: ["repo_read_file"],
        readPaths: verifiedPaths,
        writePaths: [],
        outsidePathDenied: adjacent,
        unknownToolDenied: true,
      },
    };
  } catch (error) {
    return blocked(
      "transport_unavailable",
      error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        error.code.startsWith("codex_")
        ? "Сбой соединения Codex: " + error.code
        : "Не удалось подтвердить права через соединение Codex.",
    );
  } finally {
    await session?.close();
  }
}
