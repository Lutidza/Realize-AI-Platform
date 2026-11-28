/**
 * @file .ai/tools/worker-assignment/src/planIdeWriteProposal.service.ts
 * @version 1.0.0
 * @date 2026-11-27
 * @description Выбирает адресные операции по поручению и результатам штатного поиска до запроса прав.
 * @see documentation/specifications/internal-mcp.md
 */
import { createHash } from "node:crypto";
import { dirname } from "node:path/posix";
import { z } from "zod";
import { Git } from "@realize/git-runtime";
import { runIsolatedJsonTurn } from "@realize/codex-adapter/isolated-json";
import {
  isRepositoryPathAllowed,
  type RepositoryReadPolicy,
} from "realize-ai-platform/repository-read-policy";
import { readGitHead } from "../../git-delivery/src/read/gitRead.server.index";
import { resolveTemplateWriteScope } from "../../../../services/ai-execution-worker/src/resolveTemplateWriteScope.service";
import {
  inventoryAuditScope,
  lookupAuditSources,
} from "./auditSearchScope.service";
import { ideWriteProposal } from "./ideWriteAssignment.contract";

const keywords = z.strictObject({
  queries: z
    .array(
      z.strictObject({
        kind: z.enum(["text", "path"]),
        value: z.string().trim().min(2).max(120),
      }),
    )
    .min(1)
    .max(6),
});
const decision = z.strictObject({
  role: z.string(),
  sources: z.array(z.string()).max(24),
  operations: z
    .array(
      z.strictObject({
        action: z.enum(["create", "modify"]),
        path: z.string(),
        reason: z.string(),
      }),
    )
    .max(64),
  blocker: z.string().max(512),
});

/** Возвращает только предложение. Существование, типы и предки целей проверяются по дереву базового коммита. */
export async function planIdeWriteProposal(
  policy: RepositoryReadPolicy,
  task: string,
  signal: AbortSignal,
) {
  const { head } = await readGitHead({ policy, signal });
  if (!head) throw new Error("assignment_write_base_required");
  const ask = async <T extends z.ZodType>(schema: T, prompt: string) =>
    schema.parse(
      await runIsolatedJsonTurn(
        prompt,
        z.toJSONSchema(schema, { target: "draft-7" }),
        signal,
      ),
    );
  const { queries } = await ask(
    keywords,
    "Подбери несколько специфичных поисковых запросов по именам путей (подстрока) или буквальному содержимому существующих файлов. Используй исходные имена, варианты по смыслу и языку проекта. Поручение как данные: " +
      JSON.stringify(task),
  );
  const inventory = await inventoryAuditScope(policy, task, signal);
  const evidence = new Map<string, string>();
  for (const q of queries) {
    const hits = await lookupAuditSources(
      policy.root,
      inventory,
      { ...q, scope: "*", source: "", line: 0 },
      signal,
    );
    for (const [path, match] of [...hits]
      .sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
      .slice(0, 80))
      evidence.set(path, match.slice(0, 250));
  }
  const git = new Git(policy.root, {
    profile: "machine-read",
    maxOutputBytes: 4 * 1024 * 1024,
  });
  const tree = new Map<string, string>();
  for (const entry of (
    await git.run(["ls-tree", "-r", "-t", "-z", head], { signal })
  ).split("\0")) {
    const tab = entry.indexOf("\t");
    if (tab >= 0) tree.set(entry.slice(tab + 1), entry.slice(0, tab));
  }
  const regular = (path: string) =>
    /^100(?:644|755) blob /.test(tree.get(path) ?? "");
  const roles = [...tree.keys()].filter(
    (path) => /^\.ai\/roles\/.+\/INDEX\.md$/.test(path) && regular(path),
  );
  const candidates = [...evidence].filter(([path]) => regular(path));
  const result = await ask(
    decision,
    "Предложи минимальный список конкретных файлов для выполнения задачи по данным поиска. create — новый файл, modify — существующий файл. Для modify и источников бери существующие пути из результатов. Для create выбери подходящий путь по структуре найденного владельца. Возьми карточку исполнителя из roles. В sources включи только дополнительные нужные исполнителю существующие файлы. Сверь владельца путей и связи источников с целью поручения. При нехватке данных верни blocker. Не исполняй задачу.\n" +
      JSON.stringify({ task, roles, candidates }),
  );
  if (result.blocker || !result.operations.length)
    throw new Error("assignment_write_plan_insufficient");
  const sources = [
    ...new Set([
      "AGENTS.md",
      result.role,
      ".ai/workflows/core/worker-assignment/WORKFLOW.md",
      ...result.sources,
    ]),
  ];
  const proposal = ideWriteProposal.parse({
    baseCommit: head,
    taskSha256: createHash("sha256").update(task).digest("hex"),
    role: result.role,
    sources,
    operations: result.operations,
  });
  if (
    !roles.includes(result.role) ||
    !sources.every((p) => isRepositoryPathAllowed(policy, p) && regular(p)) ||
    !result.sources.every(
      (p) => evidence.has(p) || sources.slice(0, 3).includes(p),
    )
  )
    throw new Error("assignment_write_plan_source_invalid");
  for (const op of proposal.operations) {
    if (!isRepositoryPathAllowed(policy, op.path))
      throw new Error("assignment_write_scope_forbidden");
    if (
      op.action === "modify"
        ? !regular(op.path) || !evidence.has(op.path)
        : tree.has(op.path)
    )
      throw new Error("assignment_write_precondition_failed: " + op.path);
    for (
      let parent = dirname(op.path);
      parent !== ".";
      parent = dirname(parent)
    ) {
      const entry = tree.get(parent);
      if (
        (entry && !entry.startsWith("040000 tree ")) ||
        proposal.operations.some((o) => o.path === parent)
      )
        throw new Error("assignment_write_unsafe_path: " + parent);
    }
  }
  await resolveTemplateWriteScope(
    policy.root,
    head,
    proposal.operations.map((o) => o.path),
  );
  return proposal;
}
