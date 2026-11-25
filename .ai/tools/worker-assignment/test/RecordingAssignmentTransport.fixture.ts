/**
 * @file .ai/tools/worker-assignment/test/RecordingAssignmentTransport.fixture.ts
 * @version 2.0.0
 * @date 2026-11-25
 * @description Принимает запросы в памяти и воспроизводит явную последовательность тестовых событий.
 */
import type { AdapterAccessEvidenceV1 } from "@realize/ai-contracts";
import type {
  AccessBinding,
  AdmissionAttempt,
  BoundAssignment,
} from "../src/admission/AssignmentAdmission.types";
import { AttemptObservations } from "../src/admission/AttemptObservations.repository";
import type {
  AssignmentEvent,
  AssignmentToolReply,
  AssignmentToolRequest,
  AssignmentTransport,
} from "../src/AssignmentTransport.types";

export const fixtureTarget = {
  adapterId: "codex",
  providerId: "openai",
  selection: { kind: "profile", id: "static-read-only" },
} as const;

export const testTurn = {
  threadId: "test-thread",
  turnId: "test-turn",
} as const;

/** Транспорт тестов в памяти. Данные получателя копируются на границе вызова. */
export class RecordingAssignmentTransport implements AssignmentTransport {
  offeredTools?: readonly string[];
  input?: string;
  closed = false;
  private currentAttempt?: string;
  readonly replies: { callId: string; result: AssignmentToolReply }[] = [];

  constructor(
    private readonly script: readonly AssignmentEvent[],
    private readonly effectiveTools?: readonly string[],
    private readonly observed: {
      coverage?: "mcp";
      readPaths?: string[];
      writePaths?: string[];
      expireOnSend?: boolean;
    } = {},
  ) {}

  async open(report: BoundAssignment["report"], attempt: AdmissionAttempt) {
    const {
      assignmentId,
      revision,
      contextId,
      lockSha256,
      delivered,
      effectiveAccess,
    } = report;
    this.offeredTools = [...effectiveAccess.tools];
    this.currentAttempt = attempt.attemptId;
    const store = new AttemptObservations(attempt.attemptId);
    const coverage = this.observed.coverage === "mcp" ? "partial" : "complete";
    const routes = (this.effectiveTools ?? this.offeredTools).map((tool) => ({
      tool,
      via: "direct" as const,
    }));
    const readPaths = (
      this.observed.readPaths ?? effectiveAccess.readPaths
    ).toSorted();
    const writePaths = this.observed.writePaths ?? [];
    const evidence: AdapterAccessEvidenceV1 = {
      schemaVersion: 1,
      assignmentId,
      revision,
      contextId,
      lockSha256,
      attemptId: attempt.attemptId,
      executor: { ...fixtureTarget, observedVersion: null },
      preparedSources: delivered,
      access: {
        coverage,
        routes,
        readPaths,
        writePaths,
        readsPinned: true,
        outsideReadDenied: true,
        writeDenied: true,
      },
      observations: [
        store.record("tool-catalog", { coverage, routes, readPaths }),
        store.record("dispatch-policy", {
          routes,
          readPaths,
          writePaths,
          readsPinned: true,
        }),
        store.record("read-probe", { readPaths, readsPinned: true }),
        store.record("denial-probe", {
          outsideReadDenied: true,
          writeDenied: true,
        }),
      ],
      binding: { kind: "session", id: testTurn.threadId },
      issues:
        coverage === "partial"
          ? [
              {
                code: "native_tools_unverified",
                reason: "Проверена только область MCP.",
              },
            ]
          : [],
    };
    return {
      threadId: testTurn.threadId,
      evidence,
      authority: { resolve: store.resolve, isCurrent: this.isCurrent },
    };
  }
  private isCurrent = (attemptId: string, binding: AccessBinding) =>
    !this.closed &&
    this.currentAttempt === attemptId &&
    binding.kind === "session" &&
    binding.id === testTurn.threadId;
  async startTurn(
    threadId: string,
    initialInput: string,
    attemptId: string,
    binding: AccessBinding,
  ) {
    if (this.observed.expireOnSend) this.currentAttempt = undefined;
    if (binding.id !== threadId || !this.isCurrent(attemptId, binding))
      return null;
    this.input = initialInput;
    return { threadId, turnId: testTurn.turnId };
  }
  async *events() {
    for (const event of this.script) yield structuredClone(event);
  }
  async reply(request: AssignmentToolRequest, result: AssignmentToolReply) {
    this.replies.push({
      callId: request.callId,
      result: structuredClone(result),
    });
  }
  async close() {
    this.closed = true;
  }
}
