/**
 * @file .ai/tools/agent-search/acceptance/createSearchAcceptanceDatabase.adapter.mjs
 * @version 1.0.0
 * @date 2026-09-29
 * @description Создаёт только новые fixture databases и собственный PostgreSQL, не используя env рабочей БД.
 * @see documentation/architecture/repository-search.md
 */
import { mkdir, open, realpath, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { Client } from "pg";

/** Explicit CI service должен быть изолированным сервисом workflow; ambient DATABASE_URI игнорируется. */
export function validateAcceptanceDatabaseService(value, ci) {
  const url = new URL(value);
  if (
    ci !== true ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "5432" ||
    url.pathname !== "/realize_ci" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Разрешён только явно заданный PostgreSQL service realize_ci в CI.",
    );
  return url;
}
export async function reserveAcceptancePort() {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
export async function createSearchAcceptanceDatabase(
  processes,
  directory,
  { service, bin } = {},
) {
  const nonce = randomBytes(8).toString("hex");
  const names = new Set();
  let postgres, uri, expectedCluster, control;
  try {
    if (service) {
      uri = validateAcceptanceDatabaseService(
        service,
        processes.env.CI === "true",
      );
      processes.secrets.add(uri.href);
      processes.secrets.add(decodeURIComponent(uri.password));
    } else {
      if (process.platform !== "linux" || process.getuid?.() === 0)
        throw new Error(
          "Native PostgreSQL требует Linux и обычного пользователя; CI может использовать отдельный service.",
        );
      const binaries = bin
        ? await realpath(bin)
        : (await processes.run("pg-bin", "pg_config", ["--bindir"])).trim();
      const password = randomBytes(32).toString("base64url");
      processes.secrets.add(password);
      const data = resolve(directory, "postgres-data");
      await mkdir(data, { mode: 0o700 });
      // initdb открывает pwfile через fopen; Linux FIFO передаёт пароль в памяти, без argv или обычного файла.
      const passwordPipe = join(directory, "postgres-password.pipe");
      await processes.run("pg-password-pipe", "mkfifo", [
        "--mode=600",
        passwordPipe,
      ]);
      const pipe = await open(
        passwordPipe,
        constants.O_RDWR | constants.O_NONBLOCK,
      );
      try {
        await pipe.writeFile(`${password}\n`);
        await processes.run("initdb", join(binaries, "initdb"), [
          "-D",
          data,
          "--username=realize_acceptance",
          "--auth-host=scram-sha-256",
          "--auth-local=reject",
          "--encoding=UTF8",
          "--no-locale",
          `--pwfile=${passwordPipe}`,
        ]);
      } finally {
        await pipe.close();
        await unlink(passwordPipe);
      }
      const port = await reserveAcceptancePort();
      expectedCluster = `search-acceptance-${nonce}`;
      postgres = await processes.start(
        "postgres",
        join(binaries, "postgres"),
        [
          "-D",
          data,
          "-h",
          "127.0.0.1",
          "-p",
          String(port),
          "-c",
          "unix_socket_directories=",
          "-c",
          `cluster_name=${expectedCluster}`,
        ],
        { timeoutMs: 1800000 },
      );
      uri = new URL(
        `postgresql://realize_acceptance:${password}@127.0.0.1:${port}/postgres`,
      );
    }
    const connect = async () => {
      const client = new Client({
        connectionString: uri.href,
        connectionTimeoutMillis: 1000,
        query_timeout: 10000,
      });
      client.on("error", () => {}); // Ошибка разрыва соединения возвращается вызывающему query; shutdown не роняет runner.
      try {
        await client.connect();
        return client;
      } catch (error) {
        await client.end();
        throw error;
      }
    };
    for (let attempt = 0; attempt < 80; attempt++) {
      processes.signal?.throwIfAborted();
      if (postgres && postgres.child.exitCode !== null)
        throw new Error("Fixture PostgreSQL завершился до readiness.");
      try {
        control = await connect();
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (!control) throw new Error("Fixture PostgreSQL не готов.");
    if (
      expectedCluster &&
      (await control.query("SELECT current_setting('cluster_name') AS name"))
        .rows[0].name !== expectedCluster
    )
      throw new Error("Подключение не относится к созданному fixture cluster.");
    const version = (await control.query("SHOW server_version")).rows[0]
      .server_version;
    let closed = false;
    return {
      version,
      async create(kind) {
        if (closed) throw new Error("Fixture PostgreSQL уже закрыт.");
        if (!["mcp", "search"].includes(kind))
          throw new Error("Неизвестный тип fixture database.");
        const name = `realize_${kind}_fixture_${nonce}${names.size}`;
        await control.query(`CREATE DATABASE "${name}"`);
        names.add(name);
        const database = new URL(uri);
        database.pathname = `/${name}`;
        processes.secrets.add(database.href);
        return database.href;
      },
      async close() {
        if (closed) return;
        closed = true;
        const errors = [];
        try {
          for (const name of names) {
            try {
              await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);
            } catch (error) {
              errors.push(error);
            }
          }
        } finally {
          try {
            await control.end();
          } finally {
            if (postgres) await processes.stop(postgres, "SIGINT");
          }
        }
        if (errors.length)
          throw new AggregateError(
            errors,
            "Не удалось удалить все fixture databases.",
          );
      },
    };
  } catch (error) {
    await control?.end();
    if (postgres) await processes.stop(postgres, "SIGINT");
    throw error;
  }
}
