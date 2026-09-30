/**
 * @file .ai/tools/agent-search/acceptance/runSearchAcceptance.controller.mjs
 * @version 1.0.0
 * @date 2026-09-29
 * @description Выполняет полную приёмку поиска в собственных процессах и БД; сохраняет отчёты и закрывает fixture инфраструктуру.
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

if (process.argv.length > 2)
  throw new Error(
    "npm run check:search запускает полную приёмку без частичных режимов.",
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
      ["--test", "--test-reporter=tap", ...files],
      { cwd: root },
    );
    return assertNodeReport(output, 90);
  });
  for (const name of ["repository", "delivery"])
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
  report.outcome = "passed";
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
  `Приёмка ${report.outcome === "passed" ? "пройдена" : "не пройдена"}: ${join(artifacts, "reports/acceptance.json")}`,
);
if (report.outcome !== "passed") process.exitCode = 1;
