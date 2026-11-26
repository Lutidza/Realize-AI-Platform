/**
 * @file .ai/tools/worker-assignment/test/prepareAssignment.test.ts
 * @version 1.1.2
 * @date 2026-11-26
 * @description Проверяет подготовку статического назначения на изолированных файлах без исполнителя.
 */
import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { prepareAssignment } from "../src/prepareAssignment.service";
import {
  createTemporaryAssignment,
  requiredSources,
  rulePath,
} from "./temporaryAssignment.fixture";

test("полные тексты собираются без запуска; ready требует независимых подтверждений этой привязки", async (t) => {
  const { policy, lockPath } = await createTemporaryAssignment(t);
  const preview = await prepareAssignment(policy, lockPath);
  assert.equal(preview.packageComplete, true);
  assert.equal(preview.status, "blocked");
  assert.deepEqual(
    preview.issues.map((x) => x.code),
    ["context_not_delivered", "adapter_unbound"],
  );
  assert.equal(
    preview.sources?.find((source) => source.path === rulePath)?.text,
    "Обязательное правило\n",
  );
});

test("отсутствующее или изменённое правило не попадает в подготовленный пакет", async (t) => {
  const { root, policy, lockPath } = await createTemporaryAssignment(t);
  const path = join(root, rulePath);
  await rm(path);
  const missing = await prepareAssignment(policy, lockPath);
  assert.equal(missing.packageComplete, false);
  assert(
    missing.issues.some(
      (issue) => issue.path === rulePath && issue.code === "NOT_FOUND",
    ),
  );
  await writeFile(path, "Другая версия\n");
  const changed = await prepareAssignment(policy, lockPath);
  assert.equal(changed.status, "blocked");
  assert(
    changed.issues.some(
      (issue) => issue.path === rulePath && issue.code === "CONFLICT",
    ),
  );
  assert(changed.sources);
  assert(!changed.sources.some((source) => source.path === rulePath));
});

test("запись в назначении блокирует подготовку", async (t) => {
  const { policy, lockPath } = await createTemporaryAssignment(t, {
    writePaths: ["src/route.ts"],
  });
  const preview = await prepareAssignment(policy, lockPath);
  assert.equal(preview.packageComplete, false);
  assert(
    preview.issues.some(
      (issue) =>
        issue.code === "INVALID_INPUT" &&
        issue.reason.includes("permissions.writePaths"),
    ),
    JSON.stringify(preview.issues),
  );
});

for (const { name, paths } of [
  {
    name: "один файл без маршрута",
    paths: [
      ".ai/tools/worker-assignment/src/adapters/openAiAuditRequest.adapter.ts",
    ],
  },
  {
    name: "файлы из разных каталогов",
    paths: ["src/admin/view.ts", "src/documents/view.ts"],
  },
]) {
  test(`reviewScope.paths: ${name}`, async (t) => {
    const { policy, lockPath } = await createTemporaryAssignment(t, {
      reviewScope: { paths },
    });
    const preview = await prepareAssignment(policy, lockPath);
    assert.equal(preview.packageComplete, true, JSON.stringify(preview.issues));
    assert.deepEqual(
      preview.reviewFiles?.map((file) => file.path).sort(),
      paths.toSorted(),
    );
    assert.deepEqual(
      preview.sources?.map((file) => file.path).sort(),
      requiredSources.toSorted(),
    );
  });
}
