/**
 * @file .ai/tools/agent-search/acceptance/runSearchAcceptanceBrowser.adapter.mjs
 * @version 1.1.0
 * @date 2026-09-30
 * @description Запускает и закрывает отдельный Next для browser приёмки, подтверждая identity source snapshot.
 * @see documentation/architecture/repository-search.md
 */
import { cp, readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, parse } from "node:path";
import { tmpdir } from "node:os";
import { createSearchAcceptanceSnapshot } from "./createSearchAcceptanceSnapshot.adapter.mjs";
import { reserveAcceptancePort } from "./createSearchAcceptanceDatabase.adapter.mjs";
import { SEARCH_ACCEPTANCE_LIMITS as limits } from "./searchAcceptance.config.mjs";

export async function runSearchAcceptanceBrowser(
  processes,
  root,
  artifacts,
  fixtureEnv,
) {
  const temporary = await mkdtemp(join(tmpdir(), "realize-search-browser-"));
  try {
    console.log("Подготовка browser: отдельная копия приложения и Next");
    const { site, identity } = await createSearchAcceptanceSnapshot(
      root,
      temporary,
    );
    const port = await reserveAcceptancePort();
    const origin = `http://127.0.0.1:${port}`;
    const webEnvironment = {
      ...fixtureEnv,
      NODE_ENV: "production",
      NODE_OPTIONS: `--no-deprecation --max-old-space-size=${limits.nextHeapMiB}`,
      NEXT_WEBPACK_PARALLELISM: "1",
      REALIZE_BUILD_LOW_MEMORY: "true",
      // Dependency symlinks snapshot ведут к реальной установке: общий tracing root удерживает copy внутри standalone.
      NEXT_PRIVATE_OUTPUT_TRACE_ROOT: parse(site).root,
      PAYLOAD_PUBLIC_SERVER_URL: origin,
      NEXT_PUBLIC_SERVER_URL: origin,
    };
    console.log("Подготовка browser: typegen, TypeScript и production-сборка");
    await processes.run(
      "web-build",
      process.execPath,
      [join(site, "scripts/runtime/buildProduction.controller.mjs")],
      { cwd: site, env: webEnvironment, timeoutMs: 1200000 },
    );
    await writeFile(
      join(artifacts, "reports/browser-build.json"),
      await readFile(join(site, ".next/realize-search-build.json")),
    );
    // Next сохраняет путь приложения внутри standalone относительно tracing root.
    const { relativeAppDir } = JSON.parse(
      await readFile(join(site, ".next/required-server-files.json"), "utf8"),
    );
    if (
      typeof relativeAppDir !== "string" ||
      isAbsolute(relativeAppDir) ||
      relativeAppDir.split(/[\\/]/).includes("..")
    )
      throw new Error("Fixture standalone path выходит за границы сборки.");
    const runtimeSite = join(site, ".next/standalone", relativeAppDir);
    for (const asset of ["public", ".next/static"])
      await cp(join(site, asset), join(runtimeSite, asset), {
        recursive: true,
      });
    const startWeb = (name) =>
      processes.start(
        name,
        process.execPath,
        [join(runtimeSite, "server.js")],
        {
          cwd: runtimeSite,
          env: { ...webEnvironment, HOSTNAME: "127.0.0.1", PORT: String(port) },
          timeoutMs: 600000,
        },
      );
    const prepare = async (web, name) => {
      let ready = false;
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        processes.signal?.throwIfAborted();
        if (web.child.exitCode !== null || web.child.signalCode !== null)
          throw new Error(`Fixture Next завершился; см. ${name}.log`);
        try {
          const response = await fetch(`${origin}/api/search-acceptance`, {
            signal: AbortSignal.timeout(3000),
          });
          if (response.ok && (await response.json()).fixture === identity) {
            ready = true;
            break;
          }
        } catch {
          /* Приложение ещё запускается; внешний listener не принимается без identity. */
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!ready)
        throw new Error(
          `Fixture Next не подтвердил readiness; см. ${name}.log`,
        );
      // Начальная загрузка Payload API/Admin относится к подготовке, не к таймауту пользовательского сценария.
      for (const path of [
        "/api/realize-ai/search-observations",
        "/admin/login",
      ]) {
        console.log(`Подготовка browser: загрузка ${path}`);
        processes.signal?.throwIfAborted();
        const response = await fetch(`${origin}${path}`, {
          signal: AbortSignal.any([
            AbortSignal.timeout(180000),
            ...(processes.signal ? [processes.signal] : []),
          ]),
        }).catch((cause) => {
          throw new Error(
            `Fixture Next: не удалось подготовить ${path}; см. ${name}.log`,
            { cause },
          );
        });
        await response.body?.cancel();
        if (response.status >= 500)
          throw new Error(
            `Fixture Next: ошибка подготовки ${path}; см. ${name}.log`,
          );
      }
    };
    const web = await startWeb("web");
    try {
      await prepare(web, "web");
      console.log("Проверка browser: доставка CLI/MCP и Admin UI");
      await processes.run(
        "browser",
        process.execPath,
        [
          "--import=tsx/esm",
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          "tests/e2e/support/searchAcceptance.config.ts",
        ],
        {
          cwd: root,
          env: {
            ...fixtureEnv,
            NODE_OPTIONS: `--no-deprecation --max-old-space-size=${limits.browserHeapMiB}`,
            SEARCH_ACCEPTANCE_BROWSER: "true",
            SEARCH_ACCEPTANCE_BROWSER_URL: origin,
          },
        },
      );
    } finally {
      await processes.stop(web);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
