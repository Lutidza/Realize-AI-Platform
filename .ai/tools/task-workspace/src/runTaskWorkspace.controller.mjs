/**
 * @file .ai/tools/task-workspace/src/runTaskWorkspace.controller.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Запускает локальные dossier операции через bounded CLI без серверного CRUD или Git.
 * @see documentation/specifications/task-management-execution.md
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WorkspaceFs, safeRelative } from "./WorkspaceFs.adapter.mjs";
import { parseWorkspaceArguments } from "./parseWorkspaceArguments.validator.mjs";
import { WorkspaceError, fail } from "./Workspace.error.mjs";
import { readDossier, readArtifacts } from "./Dossier.repository.mjs";
import { createDossier } from "./createDossier.service.mjs";
import { updateDossier } from "./updateDossier.service.mjs";
import { publishWorkspaceResult } from "./publishWorkspaceResult.service.mjs";
import { registerWorkspaceArtifacts } from "./registerWorkspaceArtifact.service.mjs";
import { settleWorkspaceArtifacts } from "./settleWorkspaceArtifact.service.mjs";
import { planWorkspaceCleanup } from "./planWorkspaceCleanup.service.mjs";
import { applyWorkspaceCleanup } from "./applyWorkspaceCleanup.service.mjs";
import { moveDossier } from "./moveDossier.service.mjs";
import { canonicalHash } from "./hashWorkspaceTree.adapter.mjs";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
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
  ],
  notes: [
    "adopt требует --category open|active и сохраняет тело legacy TASK",
    "изменения требуют --task и --expected-revision; JSON передаётся через --input",
    "cleanup требует --plan; удаление требует явный --apply",
    "create/adopt требуют --title; optional повторяемый --required-check и acceptance/delivery-required",
    "документация: .ai/tools/task-workspace/README.md",
  ],
};
function inputPath(storage, value) {
  const relative = path.isAbsolute(value)
    ? path.relative(storage.root, value)
    : value;
  safeRelative(relative);
  if (/(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|dump)$/.test(relative))
    fail("protected_input");
  return relative;
}
export function runWorkspaceCommand(storage, { action, flags: f }) {
  if (action === "help") return help;
  const readInput = () =>
    storage.json(inputPath(storage, f.input), 1024 * 1024);
  const revision = f["expected-revision"];
  if (action === "inspect") {
    const dossier = readDossier(storage, f.task);
    return {
      path: dossier.base,
      bodyHash: dossier.bodyHash,
      documentHash: dossier.documentHash,
      task: dossier.meta,
      legacy: dossier.meta === null,
      artifacts: dossier.meta ? readArtifacts(storage, dossier) : null,
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
              .read(inputPath(storage, f["body-file"]), 512 * 1024)
              .toString("utf8")
          : undefined,
        requiredChecks: f["required-check"] ?? [],
        acceptanceRequired: !!f["acceptance-required"],
        deliveryRequired: !!f["delivery-required"],
      },
      action === "adopt",
    );
  if (action === "status")
    return updateDossier(storage, f.task, revision, readInput());
  if (action === "result")
    return publishWorkspaceResult(storage, f.task, revision, readInput());
  if (action === "register")
    return registerWorkspaceArtifacts(storage, f.task, revision, readInput());
  if (action === "settle")
    return settleWorkspaceArtifacts(storage, f.task, revision, readInput());
  if (action === "plan-cleanup") {
    const input = f.input ? readInput() : {};
    if (!input || Object.keys(input).some((k) => k !== "paths"))
      fail("invalid_selection");
    const output = planWorkspaceCleanup(
      storage,
      f.task,
      revision,
      input.paths,
      f.output,
    );
    return {
      file: output.file,
      requestId: output.plan.requestId,
      paths: output.plan.items.map((i) => i.path),
      estimatedAllocatedBytes: output.allocatedBytes,
      hash: output.plan.hash,
    };
  }
  if (action === "cleanup") {
    const plan = storage.json(inputPath(storage, f.plan));
    if (f.apply) return applyWorkspaceCleanup(storage, plan);
    const { hash, ...body } = plan;
    if (
      plan.schemaVersion !== 1 ||
      canonicalHash(body) !== hash ||
      !Array.isArray(plan.items)
    )
      fail("cleanup_plan_invalid");
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
    return moveDossier(storage, f.task, revision, action === "reopen");
  fail("unknown_action");
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let storage;
  try {
    const request = parseWorkspaceArguments(process.argv.slice(2));
    if (request.action === "help")
      process.stdout.write(JSON.stringify(help, null, 2) + "\n");
    else {
      storage = new WorkspaceFs(root);
      process.stdout.write(
        JSON.stringify(runWorkspaceCommand(storage, request), null, 2) + "\n",
      );
    }
  } catch (error) {
    const code =
      error instanceof WorkspaceError
        ? error.code
        : error.name === "ZodError"
          ? "invalid_contract"
          : (error.code ?? "workspace_operation_failed");
    process.stderr.write(
      JSON.stringify({
        error: code,
        ...(error instanceof WorkspaceError ? { message: error.message } : {}),
      }) + "\n",
    );
    process.exitCode = 1;
  } finally {
    storage?.close();
  }
}
