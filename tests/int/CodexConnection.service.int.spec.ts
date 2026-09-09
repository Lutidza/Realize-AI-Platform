/**
 * @file tests/int/CodexConnection.service.int.spec.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Проверяет блокировку, refresh CAS и cleanup серверной интеграции Codex без сети.
 */

// @vitest-environment node

import { EventEmitter } from "node:events";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import type { CodexAuthMode } from "@realize/ai-contracts";
import { createCodexAccessTokenCredential } from "@realize/codex-adapter/profile";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodexConnectionService } from "../../packages/payload-ai-plugin/src/integrations/codex/runtime/CodexConnection.service";
import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
} from "../../packages/payload-ai-plugin/src/integrations/credentialVault";

const encryptionKey = Buffer.alloc(32, 29).toString("base64");
const binding = { provider: "codex", connectionKey: "codex:primary" };
const oauth = (token: string) =>
  JSON.stringify({
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens: {
      access_token: token,
      refresh_token: `${token}-refresh`,
      id_token: `${token}-id`,
      account_id: "fixture-account",
    },
  });
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

const fixture = async (
  authMode: CodexAuthMode = "chatgpt",
  environment: Partial<NodeJS.ProcessEnv> = {},
) => {
  const stateRoot = await mkdtemp(
    join(tmpdir(), "realize-codex-runtime-test-"),
  );
  directories.push(stateRoot);
  let row: Record<string, unknown> | undefined = {
    provider: "codex",
    connection_key: "codex:primary",
    enabled: true,
    revision: 1,
    configuration: { authMode },
    credential_envelope:
      authMode === "workloadIdentity"
        ? null
        : encryptIntegrationCredential({
            binding,
            encryptionKey,
            plaintext:
              authMode === "chatgpt"
                ? oauth("fixture-token")
                : authMode === "accessToken"
                  ? createCodexAccessTokenCredential(
                      "fixture-codex-access-token",
                    )
                  : JSON.stringify({
                      auth_mode: "apikey",
                      OPENAI_API_KEY: "fixture-api-key",
                    }),
          }),
  };
  let locked = false;
  const clients: Array<
    EventEmitter & {
      query: ReturnType<typeof vi.fn>;
      release: ReturnType<typeof vi.fn>;
    }
  > = [];
  const pool = {
    connect: vi.fn(async () => {
      const client = Object.assign(new EventEmitter(), {
        query: vi.fn(async (sql: string, values?: unknown[]) => {
          if (sql.includes("pg_try_advisory_lock")) {
            const acquired = !locked;
            if (acquired) locked = true;
            return { rows: [{ locked: acquired }] };
          }
          if (sql.includes("pg_advisory_unlock")) {
            locked = false;
            return { rows: [] };
          }
          if (sql.startsWith("UPDATE")) {
            expect(sql).toContain("revision = $3 AND credential_envelope = $4");
            if (
              row &&
              row.revision === values?.[2] &&
              row.credential_envelope === values?.[3]
            ) {
              row.credential_envelope = values?.[0];
              row.revision = Number(row.revision) + 1;
              return { rowCount: 1 };
            }
            return { rowCount: 0 };
          }
          return { rows: row ? [{ ...row }] : [] };
        }),
        release: vi.fn((destroy?: boolean) => {
          if (destroy) locked = false;
        }),
      });
      clients.push(client);
      return client as unknown as PoolClient;
    }),
  } as unknown as Pick<Pool, "connect">;
  const service = new CodexConnectionService({
    pool,
    stateRoot,
    encryptionKey,
    sourceEnvironment: {
      NODE_ENV: "test",
      HOME: "/fixture-global-home",
      CODEX_HOME: "/fixture-global-codex",
      OPENAI_API_KEY: "fixture-global-key",
      PATH: "/fixture-bin",
      ...environment,
    },
  });
  return {
    clients,
    service,
    stateRoot,
    getRow: () => row,
    setRow: (value: typeof row) => {
      row = value;
    },
    isLocked: () => locked,
  };
};

describe("CodexConnectionService", () => {
  it("арендует PAT без native auth и не обновляет vault при dispose", async () => {
    const test = await fixture("accessToken");
    const envelope = test.getRow()?.credential_envelope;
    const lease = await test.service.acquire();
    expect(lease.environment.CODEX_ACCESS_TOKEN).toBe(
      "fixture-codex-access-token",
    );
    await expect(stat(join(lease.home, "auth.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await lease.dispose();
    expect(lease.environment.CODEX_ACCESS_TOKEN).toBeUndefined();
    expect(test.getRow()?.credential_envelope).toBe(envelope);
    expect(test.getRow()?.revision).toBe(1);
    expect(test.isLocked()).toBe(false);
  });

  it("WIF требует server configuration, не требует envelope и запрещает чтение token directory", async () => {
    const tokenDirectory = await mkdtemp(
      join(tmpdir(), "realize-wif-runtime-test-"),
    );
    directories.push(tokenDirectory);
    const tokenFile = join(tokenDirectory, "identity-token");
    await writeFile(tokenFile, "fixture-identity", { mode: 0o600 });
    const test = await fixture("workloadIdentity", {
      REALIZE_CODEX_FEDERATION_RULE_ID: "idpm_fixture",
      REALIZE_CODEX_IDENTITY_TOKEN_FILE: tokenFile,
      CODEX_ACCESS_TOKEN: "fixture-unselected",
    });
    const lease = await test.service.acquire();
    expect(lease.environment).toMatchObject({
      OPENAI_FEDERATION_RULE_ID: "idpm_fixture",
      OPENAI_IDENTITY_TOKEN_FILE: tokenFile,
    });
    expect(lease.environment.CODEX_ACCESS_TOKEN).toBeUndefined();
    const config = await readFile(join(lease.home, "config.toml"), "utf8");
    expect(config).toContain(`${JSON.stringify(tokenDirectory)} = "deny"`);
    expect(config).toContain('default_permissions = "realize_wif_readonly"');
    expect(config).not.toContain("idpm_fixture");
    expect(config).not.toContain(tokenFile);
    await expect(stat(join(lease.home, "auth.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await lease.dispose();
    expect(test.getRow()?.credential_envelope).toBeNull();
    expect(test.getRow()?.revision).toBe(1);
    expect(test.isLocked()).toBe(false);
  });

  it("не подбирает ambient WIF и освобождает lock при отсутствии CMS WIF settings", async () => {
    const test = await fixture("workloadIdentity", {
      OPENAI_FEDERATION_RULE_ID: "idpm_unselected",
      OPENAI_IDENTITY_TOKEN_FILE: "/fixture-unselected",
    });
    await expect(test.service.acquire()).rejects.toThrow();
    expect(test.isLocked()).toBe(false);
  });

  it("использует выбранный API credential, отдельный home и private permissions", async () => {
    const test = await fixture("apiKey");
    const lease = await test.service.acquire();
    expect(lease.environment).toMatchObject({
      CODEX_HOME: join(test.stateRoot, "runtime"),
      HOME: "/fixture-global-home",
      PATH: "/fixture-bin",
    });
    expect(lease.environment.OPENAI_API_KEY).toBeUndefined();
    expect((await stat(lease.home)).mode & 0o777).toBe(0o700);
    expect((await stat(join(lease.home, "auth.json"))).mode & 0o777).toBe(
      0o600,
    );
    expect(await readFile(join(lease.home, "config.toml"), "utf8")).toContain(
      'forced_login_method = "api"',
    );
    await mkdir(join(lease.home, "sessions"));
    await writeFile(join(lease.home, "sessions", "fixture-thread"), "fixture");
    await lease.dispose();
    await lease.dispose();
    await expect(stat(join(lease.home, "auth.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(
      await readFile(join(lease.home, "sessions", "fixture-thread"), "utf8"),
    ).toBe("fixture");
    expect(test.isLocked()).toBe(false);
    expect(test.clients[0].release).toHaveBeenCalledTimes(1);
  });

  it("сохраняет обновлённый native OAuth credential через CAS и использует его в следующем turn", async () => {
    const test = await fixture();
    const first = await test.service.acquire();
    await writeFile(join(first.home, "auth.json"), oauth("fixture-rotated"));
    await first.dispose();
    expect(test.getRow()?.revision).toBe(2);
    const plaintext = decryptIntegrationCredential({
      binding,
      encryptionKey,
      envelope: String(test.getRow()?.credential_envelope),
    });
    expect(JSON.parse(plaintext).tokens.access_token).toBe("fixture-rotated");
    const second = await test.service.acquire();
    expect(second.home).toBe(first.home);
    expect(
      JSON.parse(await readFile(join(second.home, "auth.json"), "utf8")).tokens
        .access_token,
    ).toBe("fixture-rotated");
    await second.dispose();
  });

  it("отказывает конкурентному запуску без удаления credential активной аренды", async () => {
    const test = await fixture();
    const active = await test.service.acquire();
    await expect(test.service.acquire()).rejects.toThrow("занята");
    expect(test.isLocked()).toBe(true);
    expect(await readFile(join(active.home, "auth.json"), "utf8")).toBe(
      oauth("fixture-token"),
    );
    await active.dispose();
  });

  it.each(["absent", "disabled", "wrong-provider", "invalid-credential"])(
    "закрывает lock и не использует global auth: %s",
    async (state) => {
      const test = await fixture();
      if (state === "absent") test.setRow(undefined);
      if (state === "disabled") test.getRow()!.enabled = false;
      if (state === "wrong-provider") test.getRow()!.provider = "github";
      if (state === "invalid-credential")
        test.getRow()!.credential_envelope = "fixture-invalid-envelope";
      await expect(test.service.acquire()).rejects.toThrow();
      expect(test.isLocked()).toBe(false);
      expect(test.clients[0].release).toHaveBeenCalledTimes(1);
      await expect(
        stat(join(test.stateRoot, "runtime", "auth.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("не восстанавливает удалённое или заменённое подключение при token refresh", async () => {
    const test = await fixture();
    const lease = await test.service.acquire();
    await writeFile(join(lease.home, "auth.json"), oauth("fixture-rotated"));
    test.setRow(undefined);
    await lease.dispose();
    expect(test.getRow()).toBeUndefined();
    await expect(stat(join(lease.home, "auth.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("разрешает явно запрошенную проверку disabled connection", async () => {
    const test = await fixture();
    test.getRow()!.enabled = false;
    const lease = await test.service.acquire({ allowDisabled: true });
    expect(lease.authMode).toBe("chatgpt");
    await lease.dispose();
  });

  it("прерывает процесс при потере DB session и очищает credential", async () => {
    const test = await fixture();
    const lease = await test.service.acquire();
    test.clients[0].emit("error", new Error("fixture driver detail"));
    expect(lease.signal.aborted).toBe(true);
    await expect(lease.dispose()).rejects.toThrow("Не удалось сохранить");
    expect(test.clients[0].release).toHaveBeenCalledWith(true);
    await expect(stat(join(lease.home, "auth.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("удаляет credential и освобождает lock даже при недопустимом refreshed JSON", async () => {
    const test = await fixture();
    const lease = await test.service.acquire();
    await writeFile(join(lease.home, "auth.json"), "invalid fixture JSON");
    await expect(lease.dispose()).rejects.toThrow("Не удалось сохранить");
    expect(test.isLocked()).toBe(false);
    await expect(stat(join(lease.home, "auth.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
