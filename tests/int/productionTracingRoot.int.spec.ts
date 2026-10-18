/**
 * @file tests/int/productionTracingRoot.int.spec.ts
 * @version 1.0.1
 * @date 2026-10-18
 * @description Проверяет границу tracing, общие зависимости снимка и отказ пересечения с runtime Codex.
 * @see documentation/delivery/01-local-admin-ai.md
 */
// @vitest-environment node
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, parse } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import loadConfig from "next/dist/server/config";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { readProductionTracingRoot } from "../../scripts/runtime/readProductionTracingRoot.config.mjs";

let directory: string;
let root: string;
let site: string;
const packageName = "tracing-boundary-fixture";

beforeEach(async () => {
  const tasks = join(process.cwd(), ".ai-workspace/tasks");
  await mkdir(tasks, { recursive: true });
  directory = await mkdtemp(join(tasks, "2026-10-18-tracing-root-"));
  root = join(directory, "workspace");
  site = join(root, "snapshot/site");
  for (const path of [root, site]) {
    await mkdir(join(path, "node_modules"), { recursive: true });
    await writeFile(
      join(path, "package.json"),
      JSON.stringify({ name: packageName }),
    );
  }
  await mkdir(join(root, "node_modules/next"));
  await writeFile(
    join(root, "node_modules/next/package.json"),
    JSON.stringify({ name: "next", version: "0.0.0" }),
  );
  await symlink(
    join(root, "node_modules/next"),
    join(site, "node_modules/next"),
  );
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("граница production tracing", () => {
  it("обычный проект игнорирует унаследованный private root '/'", () => {
    expect(
      readProductionTracingRoot(root, { NEXT_PRIVATE_OUTPUT_TRACE_ROOT: "/" }),
    ).toBe(root);
  });

  it("вложенный снимок сохраняет shared Next только при явном корне исходного проекта", async () => {
    expect(() => readProductionTracingRoot(site, {})).toThrow(
      "Общие зависимости Next",
    );
    const alias = join(directory, "workspace-alias");
    await symlink(root, alias);
    expect(
      readProductionTracingRoot(site, { REALIZE_BUILD_TRACING_ROOT: alias }),
    ).toBe(root);
  });

  it("отклоняет системные корни, относительный путь и совпадение только строкового префикса", async () => {
    for (const path of [parse(root).root, homedir(), "."])
      expect(() =>
        readProductionTracingRoot(site, { REALIZE_BUILD_TRACING_ROOT: path }),
      ).toThrow();
    const sibling = join(directory, "workspace-extra");
    await mkdir(sibling);
    expect(() =>
      readProductionTracingRoot(sibling, { REALIZE_BUILD_TRACING_ROOT: root }),
    ).toThrow("содержать source snapshot");
  });

  it("отклоняет другой проект в качестве общего корня", async () => {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "different-project" }),
    );
    expect(() =>
      readProductionTracingRoot(site, { REALIZE_BUILD_TRACING_ROOT: root }),
    ).toThrow("тому же проекту");
  });

  it("отклоняет runtime внутри root, его ancestor и внешний symlink в ещё не созданное хранилище", async () => {
    const alias = join(directory, "state-link");
    await symlink(root, alias);
    for (const state of [
      join(root, "codex"),
      directory,
      join(alias, "future/codex"),
    ])
      expect(() =>
        readProductionTracingRoot(site, {
          REALIZE_BUILD_TRACING_ROOT: root,
          REALIZE_CODEX_STATE_ROOT: state,
        }),
      ).toThrow("Хранилище Codex");
    expect(
      readProductionTracingRoot(site, {
        REALIZE_BUILD_TRACING_ROOT: root,
        REALIZE_CODEX_STATE_ROOT: join(directory, "external-state"),
      }),
    ).toBe(root);
  });

  it("Next сохраняет явную границу реального config даже при private root '/'", async () => {
    vi.stubEnv("NEXT_PRIVATE_OUTPUT_TRACE_ROOT", "/");
    vi.stubEnv("REALIZE_BUILD_TRACING_ROOT", process.cwd());
    vi.stubEnv(
      "REALIZE_CODEX_STATE_ROOT",
      join(tmpdir(), "realize-tracing-config-fixture"),
    );
    const { default: config } = await import("../../next.config");
    // Next читает .env до customConfig: loader получает только изолированный fixture.
    const resolved = await loadConfig(PHASE_PRODUCTION_BUILD, root, {
      customConfig: config,
      silent: true,
    });
    expect(resolved.outputFileTracingRoot).toBe(process.cwd());
    expect(resolved.outputFileTracingIncludes?.["/*"]).toEqual(
      expect.arrayContaining([
        "./node_modules/sharp/**/*",
        "./node_modules/payload/package.json",
        "./node_modules/payload/dist/index.js",
      ]),
    );
  });
});
