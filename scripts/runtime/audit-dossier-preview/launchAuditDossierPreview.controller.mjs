/**
 * @file scripts/runtime/audit-dossier-preview/launchAuditDossierPreview.controller.mjs
 * @version 1.1.0
 * @date 2026-11-26
 * @description Запускает локальный Next в process scope предпросмотра с отдельным output и PostgreSQL.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { createSearchAcceptanceSnapshot } from "../../../.ai/tools/agent-search/acceptance/createSearchAcceptanceSnapshot.adapter.mjs";
import {
  previewAddress,
  previewEnvironment,
  previewOrigin,
  previewPort,
  readPreviewScope,
  readPrivatePreviewFile,
} from "./auditDossierPreview.config.mjs";

const abort = new AbortController();
let workspace, output, child;
function stop(signal) {
  abort.abort();
  child?.kill(signal);
}

async function adjustSnapshotConfig(path, marker, value) {
  const source = await readFile(path, "utf8");
  assert.equal(source.split(marker).length, 2);
  await writeFile(path, source.replace(marker, marker + "\n" + value));
}
const interrupt = () => stop("SIGINT");
const terminate = () => stop("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);

try {
  const scope = await readPreviewScope();
  const secret = await readPrivatePreviewFile(scope.secretFile);
  workspace = await mkdtemp(join(scope.state, "web-source-"));
  output = await mkdtemp("/tmp/realize-audit-dossier-next-");
  const { site } = await createSearchAcceptanceSnapshot(scope.root, workspace, {
    readinessMarker: false,
  });
  // Неизвестный ресурс тестовой карточки должен получить 404, без рендера витрины по slug.
  await rename(join(site, "src/app/(app)"), join(workspace, "storefront"));
  const taskEndpoint = join(
    site,
    "src/app/(system-admin)/api/task-manager/[...path]",
  );
  await mkdir(taskEndpoint, { recursive: true });
  await copyFile(
    new URL("./previewTaskManager.route.ts", import.meta.url),
    join(taskEndpoint, "route.ts"),
  );
  const distName = ".next-audit-dossier-preview";
  const dist = join(output, "next");
  await mkdir(dist, { mode: 0o700 });
  await symlink(join(site, "node_modules"), join(dist, "node_modules"), "dir");
  await symlink(dist, join(site, distName), "dir");
  await Promise.all(
    ["workspace", "codex", "media"].map((name) =>
      mkdir(join(output, name), { mode: 0o700 }),
    ),
  );
  const loginSource = new URL("./login/", import.meta.url);
  const publicLogin = join(site, "public/audit-dossier-login");
  const loginEndpoint = join(site, "src/app/(system-admin)/api/users/login");
  await mkdir(publicLogin);
  await mkdir(loginEndpoint, { recursive: true });
  for (const name of ["index.html", "style.css", "login.js"])
    await copyFile(new URL(name, loginSource), join(publicLogin, name));
  await copyFile(
    new URL("previewLogin.route.ts", loginSource),
    join(loginEndpoint, "route.ts"),
  );
  // В копии вход не загружает React-дерево редактора Payload. Сессии по-прежнему выдаёт Payload.
  await adjustSnapshotConfig(
    join(site, "next.config.ts"),
    "const nextConfig: NextConfig = {",
    "  async rewrites() { return { beforeFiles: [{ source: '/admin/login', destination: '/audit-dossier-login/index.html' }] }; },",
  );
  await adjustSnapshotConfig(
    join(site, "next.config.ts"),
    "  experimental: {",
    "    devMemoryThresholdRestart: false,",
  );
  await adjustSnapshotConfig(
    join(site, "src/plugins/index.ts"),
    "    canManageIntegrations: ({ req }) =>",
    '      process.env.REALIZE_AUDIT_DOSSIER_PREVIEW !== "true" &&',
  );
  await adjustSnapshotConfig(
    join(site, "src/payload.config.ts"),
    "export default buildConfig({",
    // Ошибки ORM могут включать параметры строки users. HTTP-статусы остаются в журнале Next.
    "  telemetry: false,\n  logger: { options: { level: 'silent' } },",
  );
  abort.signal.throwIfAborted();

  child = spawn(
    process.execPath,
    [
      join(scope.root, "node_modules/next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      previewAddress,
      "--port",
      String(previewPort),
    ],
    {
      cwd: site,
      stdio: "inherit",
      env: {
        ...previewEnvironment(scope, secret),
        REALIZE_NEXT_DIST_DIR: distName,
        REALIZE_AI_WORKSPACE_ROOT: join(output, "workspace"),
        REALIZE_CODEX_STATE_ROOT: join(output, "codex"),
        MEDIA_PRIVATE_STORAGE_DIR: join(output, "media"),
        REALIZE_BUILD_LOW_MEMORY: "true",
        NODE_OPTIONS: "--max-old-space-size=1792",
        NEXT_WEBPACK_PARALLELISM: "1",
      },
    },
  );
  console.log(`Изолированный Next для предпросмотра досье: ${previewOrigin}`);
  const code = await new Promise((done) => {
    child.once("error", () => done(1));
    child.once("close", (exitCode) => done(exitCode ?? 1));
  });
  if (!abort.signal.aborted) process.exitCode = code || 1;
} catch {
  if (!abort.signal.aborted) {
    console.error("Не удалось запустить изолированный предпросмотр досье.");
    process.exitCode = 1;
  }
} finally {
  if (workspace) await rm(workspace, { recursive: true, force: true });
  if (output) await rm(output, { recursive: true, force: true });
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);
}
