/**
 * @file scripts/runtime/audit-dossier-preview/seedAuditDossierPreviewAccount.controller.mjs
 * @version 1.0.0
 * @date 2026-11-26
 * @description Выдаёт существующему оркестратору пилота отдельную учётную запись Payload.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import {
  previewEnvironment,
  readPreviewScope,
  readPrivatePreviewFile,
} from "./auditDossierPreview.config.mjs";

const randomSecret = () => randomBytes(32).toString("hex");
async function readOptionalPrivateFile(path) {
  try {
    return await readPrivatePreviewFile(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  }
}

let payload;
try {
  const scope = await readPreviewScope({ seedAccount: true });
  let secret = await readOptionalPrivateFile(scope.secretFile);
  if (!secret) {
    secret = randomSecret();
    await writeFile(scope.secretFile, secret, { mode: 0o600, flag: "wx" });
  }
  const saved = await readOptionalPrivateFile(scope.loginFile);
  if (saved) {
    const login = JSON.parse(saved);
    assert.equal(
      login.actorId,
      scope.actorId,
      "Учётная запись уже закреплена за другим оркестратором.",
    );
    console.log("Учётная запись предпросмотра уже подготовлена.");
  } else {
    const environment = previewEnvironment(scope, secret);
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, environment);
    const { openBackgroundPayload } =
      await import("@realize/payload-ai-control/server/background-runtime");
    const { default: configuration } = await import(
      pathToFileURL(join(scope.root, "src/payload.config.ts")).href
    );
    payload = await openBackgroundPayload({
      ...(await configuration),
      telemetry: false,
    });
    const actor = await payload.findByID({
      collection: "users",
      id: scope.actorId,
      depth: 0,
      overrideAccess: true,
    });
    assert.ok(
      typeof actor.email === "string" &&
        actor.email.endsWith("@example.invalid"),
      "Ожидался синтетический участник пилота.",
    );
    const password = randomSecret();
    await payload.update({
      collection: "users",
      id: actor.id,
      depth: 0,
      overrideAccess: true,
      data: { password, roles: ["admin"] },
    });
    await writeFile(
      scope.loginFile,
      JSON.stringify(
        { actorId: scope.actorId, email: actor.email, password },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      "Подготовлена отдельная учётная запись для оркестратора пилота.",
    );
  }
} catch {
  console.error("Не удалось подготовить учётную запись в изолированной БД.");
  process.exitCode = 1;
} finally {
  await payload?.destroy();
}
