/**
 * @file .ai/tools/worker-assignment/src/runAssignmentCommand.controller.ts
 * @version 1.3.0
 * @date 2026-11-25
 * @description Выводит проверенный состав назначения или его полный пакет без запуска исполнителя.
 */
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { createRepositoryReadPolicy } from "../../../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { preflightOpenAiAudit } from "./adapters/openAiAuditRequest.adapter";
import { prepareAssignment } from "./prepareAssignment.service";
import { preflightAssignment } from "./preflightAssignment.service";
import { bindAssignment } from "./bindAssignment.service";

const usage =
  "npm run --silent ai:assignment -- prepare [--bundle] [--lock <путь от корня>]\n" +
  "npm run --silent ai:assignment -- bind [--context <contextId>] [--lock <путь от корня>]\n" +
  "npm run --silent ai:assignment -- preflight --context <contextId> [--lock <путь от корня>]\n" +
  "npm run --silent ai:assignment -- preflight-api --context <contextId> --model <модель> [--lock <путь от корня>]";
const articleAuditLock = ".ai/tools/worker-assignment/article-audit.lock.json";

async function runAssignmentCommand(): Promise<number> {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        bundle: { type: "boolean" },
        context: { type: "string" },
        lock: { type: "string" },
        model: { type: "string" },
        help: { type: "boolean" },
      },
    });
  } catch {
    console.error(usage);
    return 1;
  }
  const { positionals, values } = args;
  if (values.help) {
    console.log(usage);
    return 0;
  }
  const [command] = positionals;
  if (
    positionals.length !== 1 ||
    !["prepare", "bind", "preflight", "preflight-api"].includes(command) ||
    (command === "preflight-api"
      ? !values.model || !values.context
      : values.model !== undefined) ||
    (command === "prepare" && values.context !== undefined) ||
    (command !== "prepare" && values.bundle) ||
    (command === "preflight" && !values.context)
  ) {
    console.error(usage);
    return 1;
  }
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const policy = await createRepositoryReadPolicy(root, true);
  const lock = values.lock ?? articleAuditLock;
  if (command === "preflight-api" && values.context && values.model) {
    const result = await preflightOpenAiAudit(policy, {
      lockPath: lock,
      contextId: values.context,
      model: values.model,
    });
    console.log(JSON.stringify(result, null, 2));
    return result.status === "ready" ? 0 : 2;
  }
  if (command === "preflight" && values.context) {
    const result = await preflightAssignment(policy, lock, values.context);
    console.log(JSON.stringify(result, null, 2));
    return result.status === "blocked" ? 2 : 0;
  }
  const report =
    command === "bind"
      ? (await bindAssignment(policy, lock, values.context)).report
      : await prepareAssignment(policy, lock);
  console.log(
    JSON.stringify(
      report,
      (key, value) => (key === "text" && !values.bundle ? undefined : value),
      2,
    ),
  );
  return report.status === "ready" ? 0 : 2;
}

try {
  process.exitCode = await runAssignmentCommand();
} catch {
  console.error("Не удалось подготовить назначение из рабочей копии проекта.");
  process.exitCode = 1;
}
