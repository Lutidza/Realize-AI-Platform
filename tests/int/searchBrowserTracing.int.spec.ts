/**
 * @file tests/int/searchBrowserTracing.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-18
 * @description Проверяет границу tracing, запуск упакованного bundle и cleanup browser-приёмки.
 * @see documentation/architecture/repository-search.md
 */
// @vitest-environment node
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, sep } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { runSearchAcceptanceBrowser } from "../../.ai/tools/agent-search/acceptance/runSearchAcceptanceBrowser.adapter.mjs";
import { readProductionTracingRoot } from "../../scripts/runtime/readProductionTracingRoot.config.mjs";

const mocked = vi.hoisted(() => ({
  snapshot: vi.fn(),
  port: vi.fn(),
  bundle: vi.fn(),
}));
vi.mock(
  "../../.ai/tools/agent-search/acceptance/createSearchAcceptanceSnapshot.adapter.mjs",
  () => ({ createSearchAcceptanceSnapshot: mocked.snapshot }),
);
vi.mock(
  "../../.ai/tools/agent-search/acceptance/createSearchAcceptanceDatabase.adapter.mjs",
  () => ({ reserveAcceptancePort: mocked.port }),
);
vi.mock(
  "../../scripts/runtime/standalone/prepareStandaloneBundle.adapter.mjs",
  () => ({ prepareStandaloneBundle: mocked.bundle }),
);

beforeEach(() => vi.resetAllMocks());

it("browser-приёмка ограничивает tracing общим workspace и удаляет снимок после остановки build", async () => {
  const tasks = join(process.cwd(), ".ai-workspace/tasks");
  await mkdir(tasks, { recursive: true });
  const directory = await mkdtemp(join(tasks, "2026-10-18-browser-tracing-"));
  try {
    const root = join(directory, "workspace");
    const artifacts = join(root, "artifacts");
    const temporaryRoot = join(artifacts, "tmp");
    const nextPackage = join(root, "node_modules/next");
    const manifest = JSON.stringify({ name: "browser-tracing-fixture" });
    await mkdir(temporaryRoot, { recursive: true });
    await mkdir(nextPackage, { recursive: true });
    await writeFile(join(root, "package.json"), manifest);
    await writeFile(
      join(nextPackage, "package.json"),
      JSON.stringify({ name: "next", version: "0.0.0" }),
    );
    mocked.snapshot.mockImplementation(
      async (source: string, temporary: string) => {
        expect(source).toBe(root);
        const site = join(temporary, "site");
        await mkdir(join(site, "node_modules"), { recursive: true });
        await writeFile(join(site, "package.json"), manifest);
        await symlink(nextPackage, join(site, "node_modules/next"));
        return { site, identity: "browser-tracing-fixture" };
      },
    );
    mocked.port.mockResolvedValue(31001);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const sentinel = new Error("Остановка до настоящей сборки");
    const processes = {
      run: vi.fn(
        async (
          name: string,
          binary: string,
          args: string[],
          options: { cwd: string; env: NodeJS.ProcessEnv },
        ) => {
          expect(name).toBe("web-build");
          expect(binary).toBe(process.execPath);
          expect(args).toEqual([
            join(options.cwd, "scripts/runtime/buildProduction.controller.mjs"),
          ]);
          expect(options.cwd.startsWith(`${temporaryRoot}${sep}`)).toBe(true);
          expect(options.cwd.startsWith(`${root}${sep}`)).toBe(true);
          expect(options.env.REALIZE_BUILD_TRACING_ROOT).toBe(root);
          expect(readProductionTracingRoot(options.cwd, options.env)).toBe(
            root,
          );
          throw sentinel;
        },
      ),
      start: vi.fn(),
      stop: vi.fn(),
    };
    await expect(
      runSearchAcceptanceBrowser(processes, root, artifacts, {
        NEXT_PRIVATE_OUTPUT_TRACE_ROOT: "/",
        REALIZE_BUILD_TRACING_ROOT: "/",
      }),
    ).rejects.toBe(sentinel);
    expect(processes.run).toHaveBeenCalledOnce();
    expect(processes.start).not.toHaveBeenCalled();
    expect(await readdir(temporaryRoot)).toEqual([]);
  } finally {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  }
});

it("browser-приёмка запускает каталог общего упаковщика и очищает его при отказе запуска", async () => {
  const directory = await mkdtemp(
    join(process.cwd(), ".ai-workspace/tasks/2026-10-18-browser-package-"),
  );
  const artifacts = join(directory, "artifacts");
  const temporaryRoot = join(artifacts, "tmp");
  const sentinel = new Error("Запуск fixture не состоялся");
  try {
    await mkdir(temporaryRoot, { recursive: true });
    await mkdir(join(artifacts, "reports"));
    mocked.snapshot.mockImplementation(
      async (_root: string, temporary: string) => {
        const site = join(temporary, "site");
        await mkdir(join(site, ".next"), { recursive: true });
        await writeFile(join(site, ".next/realize-search-build.json"), "{}");
        return { site, identity: "fixture" };
      },
    );
    mocked.port.mockResolvedValue(31002);
    mocked.bundle.mockImplementation(async (site: string, output: string) => {
      expect(site).toBe(join(output, "../site"));
      expect(output.startsWith(`${temporaryRoot}${sep}`)).toBe(true);
      expect(output.endsWith(`${sep}bundle`)).toBe(true);
      const appDirectory = join(output, "nested/app");
      await mkdir(appDirectory, { recursive: true });
      return { appDirectory };
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const processes = {
      run: vi.fn().mockResolvedValue(undefined),
      start: vi.fn(
        async (
          _name: string,
          binary: string,
          args: string[],
          options: { cwd: string },
        ) => {
          const output = mocked.bundle.mock.calls[0][1] as string;
          const app = join(output, "nested/app");
          expect(binary).toBe(process.execPath);
          expect(args).toEqual([join(app, "server.js")]);
          expect(options.cwd).toBe(app);
          throw sentinel;
        },
      ),
      stop: vi.fn(),
    };
    await expect(
      runSearchAcceptanceBrowser(processes, directory, artifacts, {}),
    ).rejects.toBe(sentinel);
    expect(mocked.bundle).toHaveBeenCalledOnce();
    expect(processes.start).toHaveBeenCalledOnce();
    expect(await readdir(temporaryRoot)).toEqual([]);
  } finally {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  }
});
