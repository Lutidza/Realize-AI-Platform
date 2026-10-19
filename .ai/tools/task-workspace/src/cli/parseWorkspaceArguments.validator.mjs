/**
 * @file .ai/tools/task-workspace/src/cli/parseWorkspaceArguments.validator.mjs
 * @version 1.3.0
 * @date 2026-10-19
 * @description Ограничивает CLI flags по действию и требует явную revision для mutations.
 * @see documentation/specifications/task-management-execution.md
 */
import { fail } from "../Workspace.error.mjs";
import { z } from "zod";
const publicId = z.uuid();
const common = ["task", "expected-revision", "input"];
/** @type {Record<import("./WorkspaceCommand.types").WorkspaceCommandAction, string[]>} */
const actions = {
  login: ["url", "name", "no-browser"],
  logout: ["url"],
  "auth-status": ["url"],
  create: [
    "task",
    "title",
    "body-file",
    "required-check",
    "acceptance-required",
    "delivery-required",
    "project",
    "list",
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
  sync: ["task", "project", "list"],
  projects: ["after"],
  project: ["project"],
  "project-create": ["input", "request-id"],
  "project-update": ["project", "input", "request-id"],
  lists: ["project", "after"],
  list: ["list"],
  "list-create": ["input", "request-id"],
  "list-update": ["list", "input", "request-id"],
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
  "no-browser",
]);
/** Проверяет допустимые flags, идентификаторы и обязательные поля CLI до любых запросов.
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
  for (const name of ["project", "list", "request-id"]) {
    if (flags[name] !== undefined) {
      const parsed = publicId.safeParse(flags[name]);
      if (!parsed.success) fail(`${name.replaceAll("-", "_")}_invalid`);
      flags[name] = parsed.data.toLowerCase();
    }
  }
  if (
    flags.after !== undefined &&
    (typeof flags.after !== "string" ||
      !flags.after.length ||
      flags.after.length > 256)
  )
    fail("after_invalid");
  const management = [
    "projects",
    "project",
    "project-create",
    "project-update",
    "lists",
    "list",
    "list-create",
    "list-update",
  ].includes(action);
  const auth = ["login", "logout", "auth-status"].includes(action);
  if (auth) {
    if (
      flags.name !== undefined &&
      (typeof flags.name !== "string" ||
        !flags.name.trim() ||
        flags.name.trim().length > 100)
    )
      fail("auth_name_invalid");
  } else if (management) {
    if (
      ["project", "project-update", "lists"].includes(action) &&
      !flags.project
    )
      fail("project_required");
    if (["list", "list-update"].includes(action) && !flags.list)
      fail("list_required");
    if (action.endsWith("-create") || action.endsWith("-update")) {
      if (!flags.input) fail("input_required");
      if (!flags["request-id"]) fail("request_id_required");
    }
  } else if (action === "cleanup") {
    if (!flags.plan) fail("plan_required");
  } else {
    if (!flags.task) fail("task_required");
    if (!["create", "adopt", "inspect", "sync", "recover"].includes(action)) {
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
