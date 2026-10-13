/**
 * @file .ai/tools/task-workspace/src/parseWorkspaceArguments.validator.mjs
 * @version 1.0.0
 * @date 2026-10-13
 * @description Ограничивает CLI flags по действию и требует явную revision для mutations.
 * @see documentation/specifications/task-management-execution.md
 */
import { fail } from "./Workspace.error.mjs";
const common = ["task", "expected-revision", "input"];
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
  status: common,
  result: common,
  register: common,
  settle: common,
  "plan-cleanup": [...common, "output"],
  cleanup: ["plan", "apply"],
  archive: ["task", "expected-revision"],
  reopen: ["task", "expected-revision"],
};
const boolean = new Set(["acceptance-required", "delivery-required", "apply"]);
export function parseWorkspaceArguments(argv) {
  const [action, ...rest] = argv;
  if (action === "--help" || action === "help" || action === undefined)
    return { action: "help" };
  if (!actions[action]) fail("unknown_action");
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const raw = rest[i];
    if (!raw.startsWith("--") || raw.includes("=")) fail("invalid_flag");
    const name = raw.slice(2);
    if (!actions[action].includes(name)) fail("unknown_flag");
    if (name !== "required-check" && Object.hasOwn(flags, name))
      fail("duplicate_flag");
    const value = boolean.has(name) ? true : rest[++i];
    if (
      value === undefined ||
      (typeof value === "string" && value.startsWith("--"))
    )
      fail("flag_value_required");
    if (name === "required-check") (flags[name] ??= []).push(value);
    else flags[name] = value;
  }
  if (action === "cleanup") {
    if (!flags.plan) fail("plan_required");
  } else {
    if (!flags.task) fail("task_required");
    if (!["create", "adopt", "inspect"].includes(action)) {
      const revision = Number(flags["expected-revision"]);
      if (!Number.isSafeInteger(revision) || revision < 1)
        fail("expected_revision_required");
      flags["expected-revision"] = revision;
    }
  }
  if (
    ["status", "result", "register", "settle"].includes(action) &&
    !flags.input
  )
    fail("input_required");
  if (["create", "adopt"].includes(action) && !flags.title)
    fail("title_required");
  if (action === "adopt" && !["open", "active"].includes(flags.category))
    fail("adoption_category_required");
  return { action, flags };
}
