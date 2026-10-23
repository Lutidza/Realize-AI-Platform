// @vitest-environment node
/**
 * @file tests/int/execution-output-sanitizer.int.spec.ts
 * @version 1.1.2
 * @date 2026-10-22
 * @description Проверяет безопасную диагностику worker и allowlisted окружение общего исполнителя проверок.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizeExecutionOutput } from "../../services/ai-execution-worker/src/sanitizeExecutionOutput.util";
import { createExecutionCheckEnvironment } from "../../services/ai-execution-worker/src/createExecutionCheckEnvironment.config";

const providerToken = (suffix: string) =>
  ["sk", "proj", "synthetic".repeat(6) + suffix].join("-");

afterEach(() => vi.unstubAllEnvs());

describe("Безопасный вывод исполнителя", () => {
  it("маскирует известные ключи, JWT и Authorization, сохраняя понятный отказ scope", () => {
    const tokens = [
      providerToken("one"),
      ["ghp", "synthetic".repeat(6)].join("_"),
      ["github", "pat", "synthetic".repeat(6)].join("_"),
      ["sk", "live", "synthetic".repeat(6)].join("_"),
      [
        "eyJmaXh0dXJlIjp0cnVlfQ",
        "c3ludGhldGljLXBheWxvYWQ",
        "c3ludGhldGljLXNpZw",
      ].join("."),
    ];
    const bearer = "opaque-fixture-bearer";
    const basic = Buffer.from("fixture:synthetic-password").toString("base64");
    const reason =
      "Нельзя изменить src/plugins/index.ts: путь не входит в утверждённый scope.";
    const cleaned = sanitizeExecutionOutput(
      `${reason}\n${tokens.join("\n")}\nAuthorization: Bearer ${bearer}\nBasic ${basic}`,
      [],
    );
    expect(cleaned).toContain(reason);
    for (const token of [...tokens, bearer, basic])
      expect(cleaned).not.toContain(token);
    expect(cleaned).toContain("Authorization: Bearer [redacted-token]");
  });

  it("скрывает URL credentials и подписанные параметры, оставляя адрес диагностируемого сервиса", () => {
    const uri = new URL("postgresql://localhost:5432/fixture_database");
    uri.username = "fixture-user";
    uri.password = "fixture-private-password";
    uri.searchParams.set("access_token", "fixture-access-value");
    uri.searchParams.set("X-Amz-Signature", "fixture-signature-value");
    uri.searchParams.set("sslmode", "require");
    const cleaned = sanitizeExecutionOutput(
      `Соединение отклонено: ${uri.href}`,
      [],
    );
    expect(cleaned).toContain(
      "postgresql://[redacted-credentials]@localhost:5432/fixture_database",
    );
    expect(cleaned).toContain("sslmode=require");
    for (const value of [
      "fixture-user",
      "fixture-private-password",
      "fixture-access-value",
      "fixture-signature-value",
    ]) {
      expect(cleaned).not.toContain(value);
    }
  });

  it("удаляет PEM и значения секретных полей JSON/окружения до ограничения длины", () => {
    const begin = ["-----BEGIN", "OPENSSH PRIVATE KEY-----"].join(" ");
    const end = ["-----END", "OPENSSH PRIVATE KEY-----"].join(" ");
    const keyBody = "synthetic-private-material".repeat(300);
    const raw = `${begin}\n${keyBody}\n${end}\n{"refresh_token":"fixture-refresh", "password": "fixture-password"}\nPAYLOAD_SECRET='fixture-config-secret'\nФайл src/components/card.tsx отсутствует.`;
    const cleaned = sanitizeExecutionOutput(raw, []);
    expect(cleaned).toContain("[redacted-private-key]");
    expect(cleaned).toContain("Файл src/components/card.tsx отсутствует.");
    for (const value of [
      keyBody,
      "fixture-refresh",
      "fixture-password",
      "fixture-config-secret",
    ]) {
      expect(cleaned).not.toContain(value);
    }
    expect(sanitizeExecutionOutput(`${begin}\n${keyBody}`, [])).toBe(
      "[redacted-private-key]",
    );
  });

  it("сохраняет head4000/tail8000 и игнорирует пустые roots при замене вложенных путей", () => {
    expect(
      sanitizeExecutionOutput("Ошибка /fixture/root/worktree/src/card.tsx", [
        "",
        " ",
        "/fixture/root",
        "/fixture/root/worktree",
      ]),
    ).toBe("Ошибка [workspace]/src/card.tsx");
    const raw = "HEAD:" + "x".repeat(10_000) + ":TAIL";
    const summary = sanitizeExecutionOutput(raw, []);
    const check = sanitizeExecutionOutput(raw, [], "check");
    expect(summary.length).toBe(4_000);
    expect(summary.startsWith("HEAD:")).toBe(true);
    expect(check.length).toBe(8_000);
    expect(check.endsWith(":TAIL")).toBe(true);
    expect(
      sanitizeExecutionOutput(
        "x".repeat(3_989) + " " + providerToken("boundary"),
        [],
      ),
    ).not.toContain("sk-proj");
  });

  it("сохраняет runtime isolation и не наследует provider, Git или Node credentials", () => {
    vi.stubEnv("OPENAI_API_KEY", "fixture-provider-value");
    vi.stubEnv("CODEX_HOME", "/fixture-private-profile");
    vi.stubEnv("NODE_OPTIONS", "--inspect=1234");
    vi.stubEnv("REALIZE_GIT_CONTEXT_FILE", "/fixture-authority.json");
    for (const command of ["npm run build", "npm run typecheck"]) {
      const environment = createExecutionCheckEnvironment({
        command,
        environment: {
          REALIZE_AI_RUNTIME_ISOLATED: "false",
          TURBO_TASKS_AVAILABLE_PARALLELISM: "100",
        },
      });
      expect(environment.REALIZE_AI_RUNTIME_ISOLATED).toBe("true");
      expect(environment.NODE_ENV).toBe(
        command === "npm run build" ? "production" : "test",
      );
      if (command === "npm run build")
        expect(environment.TURBO_TASKS_AVAILABLE_PARALLELISM).toBe("2");
      for (const name of [
        "OPENAI_API_KEY",
        "CODEX_HOME",
        "NODE_OPTIONS",
        "REALIZE_GIT_CONTEXT_FILE",
      ])
        expect(environment).not.toHaveProperty(name);
    }
  });

  it.each([undefined, "false", "true"])(
    "включает build без БД независимо от override %s",
    (flag) => {
      vi.stubEnv("REALIZE_BUILD_WITHOUT_DATABASE", "false");
      const environment = createExecutionCheckEnvironment({
        command: "npm run build",
        environment: { REALIZE_BUILD_WITHOUT_DATABASE: flag },
      });
      expect(environment.REALIZE_BUILD_WITHOUT_DATABASE).toBe("true");
      expect(environment.TURBO_TASKS_AVAILABLE_PARALLELISM).toBe("2");
    },
  );

  it("позволяет server caller удалить унаследованную переменную и исключает Git authority override", () => {
    vi.stubEnv("DATABASE_URI", "fixture-database-value");
    const environment = createExecutionCheckEnvironment({
      command: "npm run typecheck",
      environment: {
        DATABASE_URI: undefined,
        REALIZE_GIT_CONTEXT_FILE: "/fixture-authority.json",
      },
    });
    expect(environment).not.toHaveProperty("DATABASE_URI");
    expect(environment).not.toHaveProperty("REALIZE_GIT_CONTEXT_FILE");
  });

  it.each([
    "node scripts/security/check-secrets.mjs",
    "npm run format:check",
    "npm run lint",
    "npm run payload:migrate:status",
    "npm run test:e2e",
    "npm run test:int",
    "npm run typecheck",
  ])("не переносит build без БД в %s", (command) => {
    vi.stubEnv("REALIZE_BUILD_WITHOUT_DATABASE", "true");
    for (const flag of [undefined, "false", "true"]) {
      const environment = createExecutionCheckEnvironment({
        command,
        environment: { REALIZE_BUILD_WITHOUT_DATABASE: flag },
      });
      expect(environment.REALIZE_BUILD_WITHOUT_DATABASE).toBeUndefined();
      expect(environment.REALIZE_AI_RUNTIME_ISOLATED).toBe("true");
      expect(environment.NODE_ENV).toBe("test");
    }
  });
});
