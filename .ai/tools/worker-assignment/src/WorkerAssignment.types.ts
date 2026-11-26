/**
 * @file .ai/tools/worker-assignment/src/WorkerAssignment.types.ts
 * @version 1.3.0
 * @date 2026-11-26
 * @description Описывает проверенные материалы и причины результата локальной подготовки.
 */
import type { readRepositoryLines } from "../../../../services/ai-control-plane/src/readRepositoryLines.service";

export type AssignmentMaterial = {
  path: string;
  sha256: string;
  bytes: number;
  text?: string;
};

export type PreparationIssue = {
  code: string;
  reason: string;
  path?: string;
};

/** Одно подтверждение от доверенного адаптера для подготовленного контекста этой привязки. */
export type AssignmentContextIdentity = {
  contextId: string;
  assignmentId: string;
  revision: number;
  lockSha256: string;
};

export type AssignmentContextEvidence = AssignmentContextIdentity & {
  delivered: { path: string; sha256: string; bytes: number }[];
  effectiveAccess: {
    enforced: boolean;
    tools: string[];
    readPaths: string[];
    writePaths: string[];
  };
};

/** Причины отказа доступны оркестратору; доступ к инструментам получает только успешная привязка. */
export type AssignmentBindResult =
  | {
      report: Partial<Omit<AssignmentContextIdentity, "contextId">> & {
        contextId: string | null;
        status: "blocked";
        issues: readonly PreparationIssue[];
        effectiveAccess: null;
      };
      context?: never;
    }
  | {
      report: AssignmentContextEvidence & {
        status: "ready";
        issues: readonly PreparationIssue[];
        reason: string;
      };
      context: Readonly<{
        contextId: string;
        initialInput: string;
        /** Только файлы ревью в порядке манифеста; readPins также включает обязательные инструкции. */
        scopePins: Readonly<Record<string, string>>;
        readPins: Readonly<Record<string, string>>;
        callTool: (
          name: string,
          args: unknown,
        ) => ReturnType<typeof readRepositoryLines>;
      }>;
    };
