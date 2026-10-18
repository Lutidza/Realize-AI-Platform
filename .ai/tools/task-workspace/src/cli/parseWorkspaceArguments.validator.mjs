/**
 * @file .ai/tools/task-workspace/src/cli/parseWorkspaceArguments.validator.mjs
 * @version 1.0.3
 * @date 2026-10-15
 * @description Ограничивает CLI flags по действию и требует явную revision для mutations.
 * @see documentation/specifications/task-management-execution.md
 */
import { fail } from "../Workspace.error.mjs";
const common = ["task", "expected-revision", "input"];
/** @type {Record<import("./WorkspaceCommand.types").WorkspaceCommandAction, string[]>} */
const actions = {
  create: [
    "task",
    "title",
    "body-file",
    "required-check",
    "acceptance-required",
    "delivery-required",
  ],
  adopt: [
    "task",
    "title",
    "category",
    "required-check",
    "acceptance-required",
    "delivery-required",
  ],
  inspect: ["task"],
  recover: ["task", "operation"],
  status: common,
  result: common,
  register: common,
  settle: common,
  "plan-cleanup": [...common, "output"],
  cleanup: ["plan", "apply"],
  archive: ["task", "expected-revision"],
  reopen: ["task", "expected-revision"],
};
const boolean = new Set([
  "acceptance-required",
  "delivery-required",
  "apply",
  "compact",
]);
/** Проверяет допустимые flags и обязательные поля двенадцати команд CLI.
 * @param {string[]} argv
 * @returns {import("./WorkspaceCommand.types").WorkspaceCommandRequest}
 */
export function parseWorkspaceArguments(argv) {
  const [action, ...rest] = argv;
  if (action === "--help" || action === "help" || action === undefined)
    return { action: "help" };
  if (!Object.hasOwn(actions, action)) fail("unknown_action");
  const actionName =
    /** @type {import("./WorkspaceCommand.types").WorkspaceCommandAction} */ (
      action
    );
  /** @type {Record<string, string | boolean | string[] | number>} */
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const raw = rest[i];
    if (!raw.startsWith("--") || raw.includes("=")) fail("invalid_flag");
    const name = raw.slice(2);
    if (name !== "compact" && !actions[actionName].includes(name))
      fail("unknown_flag");
    if (name !== "required-check" && Object.hasOwn(flags, name))
      fail("duplicate_flag");
    const value = boolean.has(name) ? true : rest[++i];
    if (
      value === undefined ||
      (typeof value === "string" && value.startsWith("--"))
    )
      fail("flag_value_required");
    if (name === "required-check")
      /** @type {string[]} */ (flags[name] ??= []).push(
        /** @type {string} */ (value),
      );
    else flags[name] = value;
  }
  if (action === "cleanup") {
    if (!flags.plan) fail("plan_required");
  } else {
    if (!flags.task) fail("task_required");
    if (!["create", "adopt", "inspect", "recover"].includes(action)) {
      const revision = Number(flags["expected-revision"]);
      if (!Number.isSafeInteger(revision) || revision < 1)
        fail("expected_revision_required");
      flags["expected-revision"] = revision;
    }
  }
  if (action === "recover" && !flags.operation) fail("operation_required");
  if (
    ["status", "result", "register", "settle"].includes(action) &&
    !flags.input
  )
    fail("input_required");
  if (["create", "adopt"].includes(action) && !flags.title)
    fail("title_required");
  if (
    action === "adopt" &&
    !["open", "active"].includes(/** @type {string} */ (flags.category))
  )
    fail("adoption_category_required");
  return /** @type {import("./WorkspaceCommand.types").WorkspaceCommandRequest} */ ({
    action: actionName,
    flags,
  });
}
