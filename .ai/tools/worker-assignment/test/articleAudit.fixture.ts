/**
 * @file .ai/tools/worker-assignment/test/articleAudit.fixture.ts
 * @version 1.0.0
 * @date 2026-11-25
 * @description Изолирует закреплённые файлы назначения формы и его личное хранилище для тестов.
 */
import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { createRepositoryReadPolicy } from "../../../../services/ai-control-plane/src/repositoryReadPolicy.validator";
import { bindAssignment } from "../src/bindAssignment.service";
import { assignmentLockSchema } from "../src/validateAssignmentDefinition.validator";

const project = fileURLToPath(new URL("../../../../", import.meta.url));
export const lockPath = ".ai/tools/worker-assignment/article-audit.lock.json";
export const view =
  "src/components/admin/documents/ArticleCreateForm.component.tsx";
export const adjacent = "src/components/admin/documents/other.tsx";

/** Реальные пути и байты назначения, личное хранилище и отдельный соседний файл на сценарий. */
export async function articleAuditFixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "realize-bind-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lock = assignmentLockSchema.parse(
    JSON.parse(await readFile(join(project, lockPath), "utf8")),
  );
  for (const path of [
    lockPath,
    lock.manifestPath,
    ...Object.keys(lock.files),
  ]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(join(project, path), join(root, path));
  }
  await writeFile(join(root, adjacent), "export {};\n");
  const policy = await createRepositoryReadPolicy(root, true);
  const bind = (contextId?: string) =>
    bindAssignment(policy, lockPath, contextId);
  const result = await bind();
  assert(result.context);
  const { contextId } = result.context;
  const file = join(
    root,
    ".ai/tools/worker-assignment/runtime/contexts",
    contextId + ".json",
  );
  return { root, lock, policy, bind, result, file, contextId };
}
