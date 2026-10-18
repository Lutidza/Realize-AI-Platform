/**
 * @file .ai/tools/task-workspace/src/cli/runWorkspaceCommand.controller.mjs
 * @version 1.0.3
 * @date 2026-10-15
 * @description Запускает локальные dossier операции через bounded CLI без серверного CRUD или Git.
 * @see documentation/specifications/task-management-execution.md
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WorkspaceFs } from "../filesystem/WorkspaceFs.adapter.mjs";
import {
  readWorkspaceInput,
  workspaceInputPath,
} from "./readWorkspaceInput.adapter.mjs";
import { presentCompactWorkspaceResponse } from "./presentCompactWorkspaceResponse.util.mjs";
import { parseWorkspaceArguments } from "./parseWorkspaceArguments.validator.mjs";
import { WorkspaceError, fail } from "../Workspace.error.mjs";
import { readDossier, readArtifacts } from "../dossier/Dossier.repository.mjs";
import { createDossier } from "../dossier/createDossier.service.mjs";
import { updateDossier } from "../dossier/updateDossier.service.mjs";
import { publishWorkspaceResult } from "../artifacts/publishWorkspaceResult.service.mjs";
import { registerWorkspaceArtifacts } from "../artifacts/registerWorkspaceArtifacts.service.mjs";
import { settleWorkspaceArtifacts } from "../artifacts/settleWorkspaceArtifacts.service.mjs";
import { planWorkspaceCleanup } from "../cleanup/planWorkspaceCleanup.service.mjs";
import { applyWorkspaceCleanup } from "../cleanup/applyWorkspaceCleanup.service.mjs";
import { moveDossier } from "../dossier/moveDossier.service.mjs";
import { canonicalHash } from "../filesystem/canonicalHash.util.mjs";
import { workspaceRoot } from "../workspacePaths.config.mjs";
import { recoverWorkspaceTaskOperation } from "./workspaceRecoveryHandlers.config.mjs";
import {
  readWorkspaceOperationState,
  workspaceOperationReference,
} from "../recovery/WorkspaceOperation.repository.mjs";
import { readWorkspaceRecoveryIndex } from "../recovery/ensureWorkspaceRecoveryIndex.service.mjs";
const help = {
  command: "npm run task:workspace -- <action> [flags]",
  actions: [
    "create",
    "adopt",
    "inspect",
    "status",
    "result",
    "register",
    "settle",
    "plan-cleanup",
    "cleanup",
    "archive",
    "reopen",
    "recover",
  ],
  notes: [
    "adopt требует --category open|active и сохраняет тело legacy TASK",
    "изменения требуют --task и --expected-revision; JSON передаётся через --input файл или --input - (stdin <= 1 MiB)",
    "--compact включает краткий JSON; --output сохраняет назначение пути cleanup плана",
    "cleanup требует --plan; удаление требует явный --apply",
    "recover требует --task и --operation; pending блокирует другие мутации",
    "create/adopt требуют --title; optional повторяемый --required-check и acceptance/delivery-required",
    "документация: .ai/tools/task-workspace/README.md",
  ],
};
/** Выполняет разобранную команду в явно переданном файловом workspace.
 * @param {WorkspaceFs} storage
 * @param {import("./WorkspaceCommand.types").WorkspaceCommandRequest} request
 * @param {import("./WorkspaceCommand.types").WorkspaceCommandPresentationContext} [presentation]
 */
export function runWorkspaceCommand(
  storage,
  { action, flags: f },
  presentation = {},
) {
  if (action === "help") return help;
  /** @param {string} value */
  const readInput = (value) => readWorkspaceInput(storage, value);
  if (action === "recover")
    return recoverWorkspaceTaskOperation(storage, f.task, f.operation);
  if (action === "inspect") {
    const state = readWorkspaceOperationState(storage, f.task);
    const index = readWorkspaceRecoveryIndex(storage);
    const recovery = {
      index: index
        ? {
            phase: index.phase,
            cursor: index.cursor,
            total: index.files.length,
          }
        : { phase: "missing" },
      operations: [
        ...(state.pending ? [workspaceOperationReference(state.pending)] : []),
        ...state.legacy.filter((entry) => !entry.completed),
      ],
    };
    let dossier;
    try {
      dossier = readDossier(storage, f.task);
    } catch (error) {
      if (error instanceof WorkspaceError && state.pending)
        return {
          task: null,
          artifacts: null,
          diagnostic: error.code,
          recovery,
        };
      throw error;
    }
    return {
      path: dossier.base,
      bodyHash: dossier.bodyHash,
      documentHash: dossier.documentHash,
      task: dossier.meta,
      legacy: dossier.meta === null,
      artifacts: dossier.meta ? readArtifacts(storage, dossier) : null,
      recovery,
    };
  }
  if (action === "create" || action === "adopt")
    return createDossier(
      storage,
      {
        key: f.task,
        title: f.title,
        category: f.category,
        body: f["body-file"]
          ? storage
              .read(workspaceInputPath(storage, f["body-file"]), 512 * 1024)
              .toString("utf8")
          : undefined,
        requiredChecks: f["required-check"] ?? [],
        acceptanceRequired: !!f["acceptance-required"],
        deliveryRequired: !!f["delivery-required"],
      },
      action === "adopt",
    );
  if (action === "status")
    return updateDossier(
      storage,
      f.task,
      f["expected-revision"],
      readInput(f.input),
    );
  if (action === "result")
    return publishWorkspaceResult(
      storage,
      f.task,
      f["expected-revision"],
      /** @type {import("../artifacts/WorkspaceEvidence.types").PublishWorkspaceResultInput} */ (
        readInput(f.input)
      ),
    );
  if (action === "register")
    return registerWorkspaceArtifacts(
      storage,
      f.task,
      f["expected-revision"],
      /** @type {import("../artifacts/WorkspaceArtifacts.types").WorkspaceArtifactRegistrationInput} */ (
        readInput(f.input)
      ),
    );
  if (action === "settle")
    return settleWorkspaceArtifacts(
      storage,
      f.task,
      f["expected-revision"],
      /** @type {import("../artifacts/WorkspaceArtifacts.types").WorkspaceArtifactSettlementInput} */ (
        readInput(f.input)
      ),
    );
  if (action === "plan-cleanup") {
    const input = /** @type {{paths?: string[]}} */ (
      f.input ? readInput(f.input) : {}
    );
    if (!input || Object.keys(input).some((k) => k !== "paths"))
      fail("invalid_selection");
    const output = planWorkspaceCleanup(
      storage,
      f.task,
      f["expected-revision"],
      input.paths,
      f.output,
    );
    presentation.revision = output.plan.taskRevision;
    return {
      file: output.file,
      requestId: output.plan.requestId,
      paths: output.plan.items.map((i) => i.path),
      estimatedAllocatedBytes: output.allocatedBytes,
      hash: output.plan.hash,
    };
  }
  if (action === "cleanup") {
    const plan =
      /** @type {import("../cleanup/WorkspaceCleanup.types").WorkspaceCleanupPlan} */ (
        storage.json(workspaceInputPath(storage, f.plan))
      );
    const planFile = workspaceInputPath(storage, f.plan);
    const recordPlan = () => {
      presentation.key = plan.localKey;
      presentation.plan = {
        taskRevision: plan.taskRevision,
        file: planFile,
        requestId: plan.requestId,
        hash: plan.hash,
        paths: plan.items.map((item) => item.path),
      };
    };
    if (f.apply) {
      const output = applyWorkspaceCleanup(storage, plan, {
        planPath: planFile,
      });
      recordPlan();
      return output;
    }
    const { hash, ...body } = plan;
    if (
      plan.schemaVersion !== 1 ||
      canonicalHash(body) !== hash ||
      !Array.isArray(plan.items)
    )
      fail("cleanup_plan_invalid");
    recordPlan();
    return {
      mode: "preview",
      requestId: plan.requestId,
      task: plan.localKey,
      paths: plan.items.map((i) => i.path),
      estimatedAllocatedBytes: plan.items.reduce(
        (s, i) => s + i.snapshot.allocatedBytes,
        0,
      ),
    };
  }
  if (action === "archive" || action === "reopen")
    return moveDossier(
      storage,
      f.task,
      f["expected-revision"],
      action === "reopen",
    );
  fail("unknown_action");
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let storage;
  /** @type {import("./WorkspaceCommand.types").WorkspaceCommandRequest | undefined} */
  let request;
  /** @type {import("./WorkspaceCommand.types").WorkspaceCommandPresentationContext} */
  const presentation = {};
  const argv = process.argv.slice(2);
  const compact = argv.includes("--compact");
  try {
    request = parseWorkspaceArguments(argv);
    let output;
    if (request.action === "help") output = help;
    else {
      storage = new WorkspaceFs(workspaceRoot);
      output = runWorkspaceCommand(storage, request, presentation);
    }
    const compactOutput = compact && request.action !== "help";
    process.stdout.write(
      JSON.stringify(
        compactOutput
          ? presentCompactWorkspaceResponse(request, output, null, presentation)
          : output,
        null,
        compactOutput ? undefined : 2,
      ) + "\n",
    );
  } catch (error) {
    const details =
      error instanceof Error
        ? /** @type {import("./WorkspaceCommand.types").WorkspaceCommandError} */ (
            error
          )
        : undefined;
    const code =
      error instanceof WorkspaceError
        ? error.code
        : details?.name === "ZodError"
          ? "invalid_contract"
          : (details?.code ?? "workspace_operation_failed");
    const failure = {
      error: code,
      ...(error instanceof WorkspaceError ? { message: error.message } : {}),
      ...(details?.operation ? { operation: details.operation } : {}),
    };
    process.stderr.write(
      JSON.stringify(
        compact
          ? presentCompactWorkspaceResponse(
              request,
              null,
              failure,
              presentation,
            )
          : failure,
      ) + "\n",
    );
    process.exitCode = 1;
  } finally {
    storage?.close();
  }
}
