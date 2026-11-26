/**
 * @file .ai/tools/worker-assignment/src/validateAssignmentDefinition.validator.ts
 * @version 1.1.0
 * @date 2026-11-26
 * @description Проверяет контракт назначения, его идентичность и область относительно файла привязки.
 */
import { z } from "zod";
import { RepositoryReadError } from "../../../../services/ai-control-plane/src/RepositoryRead.error";
import { parseRepositoryPath } from "../../../../services/ai-control-plane/src/repositoryReadPolicy.validator";

const label = z.string().trim().min(1).max(2048);
const labels = z.array(label).min(1).max(64);
const filePath = z.string().min(1).max(2048);
const filePaths = z.array(filePath).min(1).max(64);
const identity = {
  id: label,
  revision: z.number().int().positive(),
  baseCommit: z.string().regex(/^[a-f0-9]{40}$/),
};
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reviewScopeSchema = z.union([
  z.strictObject({ paths: filePaths }),
  z.strictObject({ route: filePath, directory: filePath, files: filePaths }),
]);

export const assignmentLockSchema = z.strictObject({
  ...identity,
  manifestPath: filePath,
  manifestSha256: digest,
  files: z.record(filePath, digest),
});

const assignmentSchema = z.strictObject({
  ...identity,
  assignedBy: label,
  returnsTo: label,
  mission: label,
  ownerLayer: label,
  role: filePath,
  roleReason: label,
  mode: z.literal("static-read-only"),
  requiredSources: filePaths,
  reviewScope: reviewScopeSchema,
  permissions: z.strictObject({
    read: z.tuple([z.literal("requiredSources"), z.literal("reviewScope")]),
    writePaths: z.tuple([]),
    tools: z.tuple([z.literal("repo_read_file")]),
    output: z.literal("reply-to-orchestrator"),
  }),
  checks: labels,
  expectedOutput: labels,
  stopCondition: label,
});

function resolveReviewPaths(scope: z.infer<typeof reviewScopeSchema>) {
  if ("paths" in scope)
    return scope.paths.map((path) => parseRepositoryPath(path));
  const directory = parseRepositoryPath(scope.directory.replace(/\/$/, ""));
  return [
    parseRepositoryPath(scope.route),
    ...scope.files.map((file) => directory + "/" + parseRepositoryPath(file)),
  ];
}

/** Сверяет область и полномочия до чтения любого из заявленных файлов назначения. */
export function validateAssignmentDefinition(
  definition: unknown,
  lock: z.infer<typeof assignmentLockSchema>,
) {
  const checked = assignmentSchema.safeParse(definition);
  if (!checked.success)
    throw new RepositoryReadError(
      "INVALID_INPUT",
      `Поле назначения не поддерживается в режиме статического аудита: ${checked.error.issues[0].path.join(".")}.`,
    );
  const assignment = checked.data;
  if (
    assignment.id !== lock.id ||
    assignment.revision !== lock.revision ||
    assignment.baseCommit !== lock.baseCommit
  )
    throw new RepositoryReadError(
      "INVALID_INPUT",
      "Идентификатор, ревизия или исходный коммит расходятся с файлом привязки.",
    );
  if (!assignment.requiredSources.includes(assignment.role))
    throw new RepositoryReadError(
      "INVALID_INPUT",
      "Роль должна входить в обязательные источники.",
    );
  const scope = resolveReviewPaths(assignment.reviewScope);
  const paths = new Set([...assignment.requiredSources, ...scope]);
  if (
    paths.size !== assignment.requiredSources.length + scope.length ||
    paths.size !== Object.keys(lock.files).length ||
    [...paths].some((path) => !Object.hasOwn(lock.files, path))
  )
    throw new RepositoryReadError(
      "INVALID_INPUT",
      "Перечень закреплённых файлов должен в точности покрывать источники и область без повторов.",
    );
  return { assignment, scope };
}
