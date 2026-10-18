/**
 * @file tests/int/productionTracing.int.spec.ts
 * @version 1.0.0
 * @date 2026-10-18
 * @description Проверяет границы NFT и standalone на искусственных runtime и связанных зависимостях.
 * @see documentation/delivery/01-local-admin-ai.md
 */
// @vitest-environment node

import { createRequire } from "node:module";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Next поставляет NFT без декларации типов; загружается тот же compiled модуль, что и при сборке.
const require = createRequire(import.meta.url);
const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");
const { copyTracedFiles } = require("next/dist/build/utils");

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createTracingFixture() {
  const tasks = join(process.cwd(), ".ai-workspace/tasks");
  await mkdir(tasks, { recursive: true });
  const directory = await mkdtemp(
    join(tasks, "2026-10-18-production-tracing-"),
  );
  temporaryDirectories.push(directory);
  const workspace = join(directory, "workspace");
  const site = join(workspace, "site");
  const shared = join(workspace, "shared");
  const runtime = join(
    directory,
    "fake-home/.local/share/realize-ai-cms/codex/runtime",
  );
  const extra = join(directory, "workspace-extra");
  const runtimeSentinel = "FIXTURE_PRIVATE_RUNTIME_CONTENT";
  const extraSentinel = "FIXTURE_PRIVATE_SIBLING_CONTENT";
  const entries = new Map([
    [join(site, "package.json"), '{"name":"tracing-fixture","private":true}'],
    [
      join(site, "entry.js"),
      `const fs = require("node:fs");
const path = require("node:path");
module.exports.shared = require("fixture-shared");
module.exports.runtime = (name) => fs.readFileSync(path.join(${JSON.stringify(runtime)}, name), "utf8");
module.exports.extra = (name) => fs.readFileSync(path.join(${JSON.stringify(extra)}, name), "utf8");
`,
    ],
    [
      join(shared, "package.json"),
      '{"name":"fixture-shared","main":"index.js"}',
    ],
    [
      join(shared, "index.js"),
      'module.exports = require("node:fs").readFileSync(require("node:path").join(__dirname, "required.txt"), "utf8");\n',
    ],
    [join(shared, "required.txt"), "required-shared-asset"],
    [join(runtime, "session.js"), `module.exports = "${runtimeSentinel}";\n`],
    [join(runtime, "secret.txt"), runtimeSentinel],
    [join(extra, "session.js"), `module.exports = "${extraSentinel}";\n`],
    [join(extra, "secret.txt"), extraSentinel],
  ]);
  for (const [file, contents] of entries) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  const dependency = join(site, "node_modules/fixture-shared");
  await mkdir(dirname(dependency), { recursive: true });
  await symlink(relative(dirname(dependency), shared), dependency, "dir");
  return {
    directory,
    workspace,
    site,
    shared,
    dependency,
    runtime,
    extra,
    entry: join(site, "entry.js"),
    forbiddenFiles: [
      join(runtime, "session.js"),
      join(runtime, "secret.txt"),
      join(extra, "session.js"),
      join(extra, "secret.txt"),
    ],
    sentinels: [runtimeSentinel, extraSentinel],
  };
}

async function observeTrace(
  fixture: Awaited<ReturnType<typeof createTracingFixture>>,
  base: string,
) {
  const reads = new Set<string>();
  const globs = new Set<string>();
  // NFT не предоставляет readdir hook. Штатный log отмечает начало glob до обхода;
  // положительный контроль ниже подтверждает, что этот observer видит оба дерева.
  const logger = vi
    .spyOn(console, "log")
    .mockImplementation((message: unknown) => {
      if (typeof message === "string" && message.startsWith("Globbing "))
        globs.add(message.slice("Globbing ".length));
    });
  try {
    const traced = await nodeFileTrace([fixture.entry], {
      base,
      processCwd: fixture.site,
      log: true,
      async readFile(file: string) {
        const absolute = resolve(file);
        // Наблюдение не фильтрует sentinels: даже unsafe-контроль читает только fixture.
        expect(absolute.startsWith(`${fixture.directory}${sep}`)).toBe(true);
        reads.add(absolute);
        try {
          return await readFile(absolute, "utf8");
        } catch (error) {
          if (
            ["ENOENT", "EISDIR"].includes(
              (error as NodeJS.ErrnoException).code ?? "",
            )
          )
            return null;
          throw error;
        }
      },
    });
    expect([...traced.warnings]).toEqual([]);
    return {
      files: new Set<string>(traced.fileList),
      reads,
      globs,
    };
  } finally {
    logger.mockRestore();
  }
}

describe("production tracing: границы filesystem", () => {
  it("не читает и не копирует runtime, сохраняя shared dependency за symlink", async () => {
    const fixture = await createTracingFixture();

    // Расширенный контроль воспроизводит over-tracing, оставаясь внутри искусственного дерева.
    const unsafe = await observeTrace(fixture, fixture.directory);
    for (const file of fixture.forbiddenFiles)
      expect(unsafe.files.has(relative(fixture.directory, file))).toBe(true);
    for (const directory of [fixture.runtime, fixture.extra]) {
      expect(unsafe.reads.has(join(directory, "session.js"))).toBe(true);
      expect(
        [...unsafe.globs].some((glob) => glob.startsWith(`${directory}/`)),
      ).toBe(true);
    }

    const bounded = await observeTrace(fixture, fixture.workspace);
    for (const file of fixture.forbiddenFiles) {
      expect(bounded.files.has(relative(fixture.workspace, file))).toBe(false);
      expect(bounded.reads.has(file)).toBe(false);
    }
    for (const directory of [fixture.runtime, fixture.extra]) {
      expect(
        [...bounded.reads].some((file) =>
          file.startsWith(`${directory}${sep}`),
        ),
      ).toBe(false);
      expect(
        [...bounded.globs].some((glob) => glob.startsWith(`${directory}/`)),
      ).toBe(false);
    }
    for (const file of bounded.files)
      expect(
        resolve(fixture.workspace, file).startsWith(
          `${fixture.workspace}${sep}`,
        ),
      ).toBe(true);
    for (const file of [
      fixture.dependency,
      join(fixture.shared, "index.js"),
      join(fixture.shared, "package.json"),
      join(fixture.shared, "required.txt"),
    ])
      expect(bounded.files.has(relative(fixture.workspace, file))).toBe(true);
    expect(bounded.reads.has(join(fixture.shared, "index.js"))).toBe(true);

    const dist = join(fixture.site, ".next");
    await mkdir(dist);
    const manifest = {
      version: 1,
      files: [...bounded.files].map((file) =>
        relative(dist, resolve(fixture.workspace, file)),
      ),
    };
    await writeFile(
      join(dist, "next-server.js.nft.json"),
      JSON.stringify(manifest),
    );
    // Штатный copier читает настоящий NFT manifest; сборка приложения и сервер не запускаются.
    await copyTracedFiles(
      fixture.site,
      dist,
      [],
      [],
      fixture.workspace,
      { output: "standalone", distDir: ".next" },
      { version: 3, sortedMiddleware: [], middleware: {}, functions: {} },
      false,
      false,
      new Set(),
    );

    const standalone = join(fixture.directory, "standalone");
    await rename(join(dist, "standalone"), standalone);
    // Оригинал больше не доступен по прежнему пути: абсолютная ссылка не даст ложного успеха.
    await rename(
      fixture.workspace,
      join(fixture.directory, "unavailable-workspace"),
    );
    const copiedDependency = join(
      standalone,
      "site/node_modules/fixture-shared",
    );
    expect(await readlink(copiedDependency)).toBe("../../shared");
    expect(await realpath(copiedDependency)).toBe(join(standalone, "shared"));
    const copiedRequire = createRequire(join(standalone, "site/entry.js"));
    expect(copiedRequire("fixture-shared")).toBe("required-shared-asset");
    for (const file of await readdir(standalone, { recursive: true })) {
      expect(file).not.toContain("fake-home");
      expect(file).not.toContain("workspace-extra");
      const copied = join(standalone, file);
      if (!(await lstat(copied)).isFile()) continue;
      const contents = await readFile(copied, "utf8");
      for (const sentinel of fixture.sentinels)
        expect(contents).not.toContain(sentinel);
    }
  });
});
