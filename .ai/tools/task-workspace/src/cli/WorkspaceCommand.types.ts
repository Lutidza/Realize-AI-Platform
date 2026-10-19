/**
 * @file .ai/tools/task-workspace/src/cli/WorkspaceCommand.types.ts
 * @version 1.3.0
 * @date 2026-10-19
 * @description Связывает проверенное действие CLI с обязательными flags и допустимыми входами.
 * @see documentation/specifications/task-management-execution.md
 */
import type { WorkspaceOperationReference } from "../recovery/WorkspaceOperation.types";
import type {
  TaskListDto,
  TaskPageDto,
  TaskProjectDto,
} from "@realize/payload-task-manager/contracts";

/** Remote management не использует task key и никогда не создаёт локальное досье. */
export type TaskManagerCommandRequest = (
  | { action: "projects"; flags: { after?: string } }
  | { action: "project"; flags: { project: string } }
  | {
      action: "project-create" | "list-create";
      flags: { input: string; "request-id": string };
    }
  | {
      action: "project-update";
      flags: { project: string; input: string; "request-id": string };
    }
  | { action: "lists"; flags: { project: string; after?: string } }
  | { action: "list"; flags: { list: string } }
  | {
      action: "list-update";
      flags: { list: string; input: string; "request-id": string };
    }
) & { flags: { compact?: boolean } };

export type TaskManagerCommandData =
  | TaskProjectDto
  | TaskListDto
  | TaskPageDto<TaskProjectDto>
  | TaskPageDto<TaskListDto>;

export type WorkspaceCommandRequest = (
  | { action: "help"; flags?: never }
  | TaskManagerCommandRequest
  | import("../auth/Auth.types").AuthCommandRequest
  | {
      action: "create";
      flags: {
        task: string;
        title: string;
        category?: "open" | "active";
        "body-file"?: string;
        "required-check"?: string[];
        "acceptance-required"?: boolean;
        "delivery-required"?: boolean;
        project?: string;
        list?: string;
      };
    }
  | {
      action: "adopt";
      flags: {
        task: string;
        title: string;
        category: "open" | "active";
        "body-file"?: string;
        "required-check"?: string[];
        "acceptance-required"?: boolean;
        "delivery-required"?: boolean;
      };
    }
  | { action: "inspect"; flags: { task: string } }
  | {
      action: "sync";
      flags: { task: string; project?: string; list?: string };
    }
  | { action: "recover"; flags: { task: string; operation: string } }
  | {
      action: "status" | "result" | "register" | "settle";
      flags: { task: string; "expected-revision": number; input: string };
    }
  | {
      action: "plan-cleanup";
      flags: {
        task: string;
        "expected-revision": number;
        input?: string;
        output?: string;
      };
    }
  | { action: "cleanup"; flags: { plan: string; apply?: boolean } }
  | {
      action: "archive" | "reopen";
      flags: { task: string; "expected-revision": number };
    }
) & { flags?: { compact?: boolean } };

export type WorkspaceCommandAction = Exclude<
  WorkspaceCommandRequest["action"],
  "help"
>;

/** Машинная диагностика может присутствовать у обычного Error от файлового адаптера. */
export type WorkspaceCommandError = Error & {
  code?: string;
  operation?: WorkspaceOperationReference;
};

/** Ошибка CLI сохраняет безопасное сообщение и полную ссылку на операцию. */
export type WorkspaceCommandFailure = {
  error: string;
  message?: string;
  operation?: WorkspaceOperationReference;
  routing?: import("../remote/RemoteWorkspace.types").RemoteWorkspacePresentation;
};

export type WorkspaceCompactPlan = {
  taskRevision: number | null;
  requestId: string | null;
  file: string | null;
  hash: string | null;
  paths: string[] | null;
};

/** Только сведения, уже прочитанные при выполнении; дополнительных scans presenter не делает. */
export type WorkspaceCommandPresentationContext = {
  key?: string;
  revision?: number;
  plan?: WorkspaceCompactPlan;
  routing?: import("../remote/RemoteWorkspace.types").RemoteWorkspacePresentation;
};

export type WorkspaceCompactResponse = {
  /** Поле присутствует только у management-команд; локальный compact-контракт сохранён. */
  data?:
    | TaskManagerCommandData
    | import("../auth/Auth.types").AuthCommandData
    | null;
  routing:
    | import("../remote/RemoteWorkspace.types").RemoteWorkspacePresentation
    | null;
  status: "completed" | "error";
  action: WorkspaceCommandRequest["action"] | null;
  key: string | null;
  revision: number | null;
  outcome: string | null;
  error: string | null;
  message: string | null;
  reason: string | null;
  result: {
    path: string | null;
    revision: number | null;
    hash: string | null;
    criteriaHash: string | null;
  } | null;
  artifacts:
    | {
        id: string | null;
        revision: number | null;
        hash: string | null;
        path: string | null;
        state: string | null;
      }[]
    | null;
  operation: WorkspaceOperationReference | null;
  recovery: {
    requestedOperationId: string | null;
    index: unknown;
    operations: unknown[] | null;
  } | null;
  plan: WorkspaceCompactPlan | null;
  producer: {
    artifactIds: string[] | null;
    paths: string[] | null;
    settlement: string | null;
    phase: string | null;
  } | null;
  cleanup: {
    status: string | null;
    reason: string | null;
    planPath: string | null;
    paths: string[] | null;
    receipt: {
      requestId: string | null;
      status: string | null;
      paths: string[] | null;
      estimatedAllocatedBytes: number | null;
      completedAt: string | null;
    } | null;
  } | null;
};
