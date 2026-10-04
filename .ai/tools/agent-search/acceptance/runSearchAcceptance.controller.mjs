/**
 * @file .ai/tools/agent-search/acceptance/runSearchAcceptance.controller.mjs
 * @version 1.1.0
 * @date 2026-09-30
 * @description Проверяет installed evidence и изолированные сценарии последовательно; без обязательного потребителя full acceptance остаётся incomplete.
 * @see documentation/architecture/repository-search.md
 */
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import nextEnvironment from "@next/env";
import { readInstalledSearchAcceptance } from "./readInstalledSearchAcceptance.adapter.mjs";
import { SearchAcceptanceProcess } from "./SearchAcceptanceProcess.adapter.mjs";
import { createSearchAcceptanceDatabase } from "./createSearchAcceptanceDatabase.adapter.mjs";
import { runSearchAcceptanceBrowser } from "./runSearchAcceptanceBrowser.adapter.mjs";
import {
  assertNodeReport,
  assertVitestReport,
  assertBenchmarkReport,
  assertPlaywrightReport,
} from "./assertSearchAcceptanceReport.validator.mjs";
import {
  searchAcceptanceEnvironment,
  SEARCH_ACCEPTANCE_LIMITS as limits,
  SEARCH_ACCEPTANCE_SUITES as suites,
} from "./searchAcceptance.config.mjs";

const isolated = process.argv.length === 3 && process.argv[2] === "--isolated";
if (process.argv.length > 2 && !isolated)
  throw new Error(
    "check:search проверяет installed consumers; --isolated запускает только явно помеченную fixture проверку.",
  );
process.umask(0o077);
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const tasks = join(root, ".ai-workspace/tasks");
await mkdir(tasks, { recursive: true });
const artifacts = await mkdtemp(
  join(tasks, `${new Date().toISOString().slice(0, 10)}-search-acceptance-`),
);
for (const name of ["logs", "reports", "tmp"])
  await mkdir(join(artifacts, name));
await writeFile(join(artifacts, "empty.env"), "");
const env = {
  ...searchAcceptanceEnvironment(artifacts),
  PAYLOAD_SECRET: randomBytes(32).toString("hex"),
  REALIZE_INTEGRATIONS_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};
const abort = new AbortController();
const interrupt = () => abort.abort();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, interrupt);
const processes = new SearchAcceptanceProcess(
  join(artifacts, "logs"),
  env,
  abort.signal,
);
processes.secrets.add(env.PAYLOAD_SECRET);
processes.secrets.add(env.REALIZE_INTEGRATIONS_ENCRYPTION_KEY);
const report = {
  version: 1,
  scope: isolated ? "isolated" : "installed-and-isolated",
  outcome: "failed",
  startedAt: new Date().toISOString(),
  phases: {},
  cleanup: false,
};
let database;
console.log(`Приёмка поиска: ${artifacts}`);

const save = async (name, value) =>
  writeFile(
    join(artifacts, "reports", `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
const phase = async (name, action) => {
  console.log(`Проверка: ${name}`);
  const started = performance.now();
  const result = await action();
  report.phases[name] = { ...result, durationMs: performance.now() - started };
  console.log(`Пройдено: ${name}`);
};
const readReport = async (name) => {
  const path = join(artifacts, "reports", `${name}.json`);
  if ((await stat(path)).size > limits.logBytes)
    throw new Error(`${name}: отчёт слишком велик`);
  const text = processes.redact(await readFile(path, "utf8"));
  await writeFile(path, text);
  return JSON.parse(text);
};
const testSuite = async (name, fixtureEnv = {}) => {
  try {
    await processes.run(
      name,
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "--config",
        "vitest.config.mts",
        "--maxWorkers=1",
        "--no-file-parallelism",
        "--pool=forks",
        ...suites[name].files,
        "--reporter=json",
        `--outputFile=${join(artifacts, "reports", `${name}.json`)}`,
      ],
      { cwd: root, env: fixtureEnv },
    );
  } finally {
    // Включая неуспешный отчёт: credential из вложенной ошибки не остаётся в артефактах.
    await readReport(name).catch(() => undefined);
  }
  return assertVitestReport(await readReport(name), suites[name]);
};
const migrate = async (name, kind) => {
  const uri = await database.create(kind);
  const fixtureEnv = {
    DATABASE_URI: uri,
    DATABASE_URL: uri,
    [kind === "mcp" ? "MCP_TEST_DATABASE_URI" : "SEARCH_TEST_DATABASE_URI"]:
      uri,
  };
  await processes.run(
    `${name}-migrate`,
    process.execPath,
    ["node_modules/payload/bin.js", "migrate"],
    { cwd: root, env: { ...fixtureEnv, NODE_ENV: "production" } },
  );
  return fixtureEnv;
};

try {
  if (!isolated) {
    // Только read-only диагностика рабочей БД. Секреты не наследуются fixture процессами.
    nextEnvironment.loadEnvConfig(root, false, {
      info: () => undefined,
      error: () => undefined,
    });
    const installed = await readInstalledSearchAcceptance(
      root,
      process.env.SEARCH_ACCEPTANCE_INSTALLED_EVIDENCE,
      async (ids) => {
        const pool = new Pool({
          connectionString:
            process.env.DATABASE_URI ?? process.env.DATABASE_URL,
          max: 1,
          connectionTimeoutMillis: 3000,
          query_timeout: 5000,
          options:
            "-c default_transaction_read_only=on -c statement_timeout=5000",
        });
        pool.on("error", () => {});
        try {
          return (
            await pool.query(
              "SELECT event FROM realize_ai_search_observations WHERE event->>'eventID'=ANY($1::text[]) LIMIT 112",
              [ids],
            )
          ).rows.map((row) => row.event);
        } finally {
          await pool.end();
        }
      },
    );
    await save("installed", installed);
    report.phases.installed = installed;
    if (installed.outcome !== "passed") {
      report.outcome = "incomplete";
      throw new Error(
        `Приёмка установленной версии не завершена: ${installed.reason}. Требуются: ${installed.missing.join(", ")}.`,
      );
    }
  }
  await processes.run("runtime", "npm", ["run", "--silent", "verify:runtime"], {
    cwd: root,
  });
  await phase("cli", async () => {
    const directory = ".ai/tools/agent-search/test";
    const files = (await readdir(join(root, directory)))
      .filter((file) => file.endsWith(".test.mjs"))
      .sort()
      .map((file) => `${directory}/${file}`);
    const output = await processes.run(
      "cli",
      process.execPath,
      ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files],
      { cwd: root },
    );
    return assertNodeReport(output, 90);
  });
  for (const name of ["repository", "delivery", "consumers"])
    await phase(name, () => testSuite(name));
  // Benchmark выполняется до БД/Next: их фоновая нагрузка не смешивается с замерами адаптеров.
  for (const [name, file, args] of [
    ["navigation", "runRepositoryNavigation.controller.mjs", ["--navigation"]],
    ["imports", "runImportResolution.controller.mjs", []],
  ]) {
    await phase(name, async () => {
      const text = await processes.run(
        name,
        process.execPath,
        [
          "--import=tsx/esm",
          `.ai/tools/agent-search/benchmark/${file}`,
          ...args,
          `--runs=${limits.runs}`,
        ],
        { cwd: root },
      );
      const benchmark = JSON.parse(text);
      await save(name, benchmark);
      return {
        ...assertBenchmarkReport(benchmark, name),
        measurements: benchmark.summary,
      };
    });
  }
  database = await createSearchAcceptanceDatabase(
    processes,
    join(artifacts, "tmp"),
    {
      service: process.env.SEARCH_ACCEPTANCE_DATABASE_URI,
      bin: process.env.SEARCH_ACCEPTANCE_PG_BIN,
    },
  );
  report.postgres = database.version;
  for (const name of ["managed", "observations", "management"])
    await phase(name, async () =>
      testSuite(
        name,
        await migrate(name, name === "managed" ? "mcp" : "search"),
      ),
    );
  await phase("browser", async () => {
    const fixtureEnv = await migrate("browser", "search");
    try {
      await runSearchAcceptanceBrowser(processes, root, artifacts, fixtureEnv);
    } finally {
      await readReport("browser").catch(() => undefined);
    }
    return assertPlaywrightReport(await readReport("browser"));
  });
  report.outcome = isolated ? "isolated_passed" : "passed";
} catch (error) {
  report.error = processes.redact(error.message);
  console.error(report.error);
} finally {
  try {
    await database?.close();
  } catch (error) {
    report.outcome = "failed";
    report.cleanupError = processes.redact(error.message);
  } finally {
    await processes.close();
    await rm(join(artifacts, "tmp"), { recursive: true, force: true });
    report.cleanup = !report.cleanupError && processes.children.size === 0;
    report.finishedAt = new Date().toISOString();
    await save("acceptance", report);
    for (const signal of ["SIGINT", "SIGTERM"])
      process.removeListener(signal, interrupt);
  }
}
console.log(
  `${report.outcome === "isolated_passed" ? "Изолированные проверки пройдены; установленная система и ChatGPT не проверены" : report.outcome === "passed" ? "Приёмка пройдена" : report.outcome === "incomplete" ? "Приёмка не завершена" : "Приёмка не пройдена"}: ${join(artifacts, "reports/acceptance.json")}`,
);
if (!["passed", "isolated_passed"].includes(report.outcome))
  process.exitCode = 1;
