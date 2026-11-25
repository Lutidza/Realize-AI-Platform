/**
 * @file scripts/runtime/audit-dossier-preview/auditDossierPreview.config.mjs
 * @version 1.0.0
 * @date 2026-11-26
 * @description Ограничивает контур предпросмотра досье собственным сокетом и синтетической сессией Payload.
 * @see documentation/specifications/task-management/execution/article-audit-publication.md
 */
import assert from "node:assert/strict";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const previewAddress = "127.0.0.1";
export const previewPort = 3210;
export const previewOrigin = `http://${previewAddress}:${previewPort}`;
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export async function readPreviewScope({ seedAccount = false } = {}) {
  const root = await realpath(
    fileURLToPath(new URL("../../../", import.meta.url)),
  );
  const state = join(root, ".data/audit-dossier-preview");
  assert.equal(
    await realpath(state),
    state,
    "Ожидался отдельный каталог предпросмотра.",
  );
  const manifestPath = join(state, "manifest.json");
  assert.equal(await realpath(manifestPath), manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.database?.host, join(state, "socket"));
  assert.equal(manifest.database?.port, 55439);
  assert.equal(manifest.database?.name, "realize_checkpoint_pilot");
  if (!seedAccount)
    assert.equal(manifest.database?.webUser, "realize_dossier_web");
  assert.match(manifest.taskId, uuid);
  assert.match(manifest.decisionId, uuid);
  assert.match(manifest.orchestratorId, /^[1-9]\d*$/);

  const database = {
    ...manifest.database,
    user: seedAccount ? "realize_checkpoint_runner" : manifest.database.webUser,
  };
  const cluster = join(state, "pgdata");
  assert.equal(await realpath(cluster), cluster);
  const [, dataDirectory, startTime, port, socketDirectory] = (
    await readFile(join(cluster, "postmaster.pid"), "utf8")
  ).split("\n");
  assert.equal(dataDirectory, cluster);
  assert.equal(Number(port), database.port);
  assert.equal(socketDirectory, database.host);
  assert.equal(await realpath(database.host), database.host);
  const socket = await lstat(join(database.host, `.s.PGSQL.${database.port}`));
  assert.ok(socket.isSocket() && socket.uid === process.getuid());
  const uri = new URL(
    `postgresql://${database.user}@localhost:${database.port}/${database.name}`,
  );
  uri.searchParams.set("host", database.host);
  const client = new pg.Client({
    connectionString: uri.href,
    connectionTimeoutMillis: 3000,
    statement_timeout: 3000,
  });
  try {
    await client.connect();
    const {
      rows: [identity],
    } = await client.query(`
      SELECT current_database() AS database, current_user AS actor,
        inet_server_addr() IS NULL AS private_socket,
        floor(extract(epoch from pg_postmaster_start_time()))::integer AS started,
        (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS privileged
    `);
    assert.equal(identity.started, Number(startTime));
    assert.equal(identity.database, database.name);
    assert.equal(identity.actor, database.user);
    assert.equal(identity.private_socket, true);
    if (!seedAccount) assert.equal(identity.privileged, false);
  } finally {
    await client.end();
  }

  return {
    root,
    state,
    uri: uri.href,
    actorId: manifest.orchestratorId,
    taskId: manifest.taskId,
    decisionId: manifest.decisionId,
    loginFile: join(state, `preview-login-${manifest.orchestratorId}.json`),
    secretFile: join(state, "web-session-secret"),
  };
}

export async function readPrivatePreviewFile(path) {
  const info = await lstat(path);
  assert.ok(
    info.isFile() &&
      info.uid === process.getuid() &&
      (info.mode & 0o777) === 0o600,
    "Ожидался private файл предпросмотра с режимом 0600.",
  );
  assert.equal(await realpath(path), resolve(path));
  return readFile(path, "utf8");
}

/** Единственный набор окружения для тестового Payload и web. Рабочие переменные сюда не наследуются. */
export function previewEnvironment(scope, secret) {
  assert.match(secret, /^[\da-f]{64}$/);
  return {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    LANG: "C.UTF-8",
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URI: scope.uri,
    DATABASE_URL: scope.uri,
    PAYLOAD_DB_PUSH: "false",
    PAYLOAD_DROP_DATABASE: "false",
    PAYLOAD_SECRET: secret,
    PAYLOAD_PUBLIC_SERVER_URL: previewOrigin,
    PAYLOAD_PUBLIC_SITE_URL: previewOrigin,
    NEXT_PUBLIC_SERVER_URL: previewOrigin,
    REALIZE_BUILD_TRACING_ROOT: scope.root,
    REALIZE_AI_RUNTIME_ISOLATED: "true",
    REALIZE_AUDIT_DOSSIER_PREVIEW: "true",
    REALIZE_AUDIT_DOSSIER_TASK_ID: scope.taskId,
    REALIZE_AUDIT_DOSSIER_DECISION_ID: scope.decisionId,
    REALIZE_AI_WORKSPACE_ROOT: join(scope.state, "workspace"),
    REALIZE_CODEX_STATE_ROOT: join(scope.state, "codex"),
    MEDIA_PRIVATE_STORAGE_DIR: join(scope.state, "media"),
  };
}
