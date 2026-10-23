/**
 * @file tests/int/projectRuntime.int.spec.ts
 * @version 1.1.0
 * @date 2026-10-23
 * @description Проверяет native npm guard, фактическую пару Node/npm и согласованность проектных pins.
 */
// @vitest-environment node
import { execFile } from "node:child_process";
import {
  copyFile,
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import {
  projectRoot,
  readProjectRuntime,
} from "../../scripts/runtime/readProjectRuntime.config.mjs";
import { verifyProjectRuntimePins } from "../../scripts/runtime/verifyProjectRuntimePins.service.mjs";

const execute = promisify(execFile);
const expected = readProjectRuntime();
const npmCLI =
  process.env.npm_execpath ??
  join(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
const temporary: string[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "realize-runtime-"));
  temporary.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

it("rejects a range or mismatched packageManager at the canonical source", async () => {
  const root = await directory();
  for (const manifest of [
    {
      engines: { ...expected, node: `${expected.node.split(".")[0]}.x` },
      packageManager: `npm@${expected.npm}`,
    },
    { engines: expected, packageManager: "npm@0.0.0" },
  ]) {
    await writeFile(join(root, "package.json"), JSON.stringify(manifest));
    expect(() => readProjectRuntime(root)).toThrow("точные согласованные");
  }
});

it.each(["runtime", "packageManager"] as const)(
  "npm rejects a mismatched %s before the project command runs",
  async (field) => {
    const root = await directory();
    const source = JSON.parse(
      await readFile(join(projectRoot, "package.json"), "utf8"),
    );
    source.devEngines[field].version = "0.0.0";
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "runtime-guard-fixture",
        private: true,
        devEngines: source.devEngines,
        scripts: {
          probe:
            "node -e \"require('node:fs').writeFileSync('executed', 'yes')\"",
        },
      }),
    );
    await expect(
      execute(process.execPath, [npmCLI, "run", "probe"], {
        cwd: root,
        env: { ...process.env, npm_config_cache: join(root, "cache") },
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("EBADDEVENGINES"),
    });
    await expect(access(join(root, "executed"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  },
);

it("checks real npm even when its user agent claims the expected version", async () => {
  const root = await directory();
  const fakeNpm = join(root, "bin/npm-cli.js");
  await mkdir(join(root, "bin"));
  await writeFile(fakeNpm, "// fixture npm entry");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "npm", version: "0.0.0" }),
  );
  await expect(
    execute(
      process.execPath,
      [
        join(projectRoot, "scripts/runtime/verify-runtime.mjs"),
        "--runtime-only",
      ],
      {
        env: {
          ...process.env,
          npm_execpath: fakeNpm,
          npm_config_user_agent: `npm/${expected.npm}`,
        },
      },
    ),
  ).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining("запущен 0.0.0"),
  });
});

it("detects a stale agent package, lockfile, CI pin and Docker pin", async () => {
  const root = await directory();
  const manifest = {
    engines: expected,
    packageManager: `npm@${expected.npm}`,
    devEngines: {
      runtime: { name: "node", version: expected.node, onFail: "error" },
      packageManager: { name: "npm", version: expected.npm, onFail: "error" },
    },
  };
  const files: Record<string, string> = {
    "package.json": JSON.stringify(manifest),
    "package-lock.json": JSON.stringify({ packages: { "": manifest } }),
    ".nvmrc": expected.node,
    ".node-version": expected.node,
    ".ai/tools/fixture/package.json": JSON.stringify(manifest),
    ".ai/tools/fixture/package-lock.json": JSON.stringify({
      packages: { "": manifest },
    }),
    Dockerfile: `ARG NODE_IMAGE=node:${expected.node}-bookworm\nRUN npm install --global npm@${expected.npm}`,
    ".github/workflows/ci.yml": `uses: actions/setup-node@fixture\nnode-version: ${expected.node}\nrun: npm install --global npm@${expected.npm}`,
  };
  await mkdir(join(root, "packages"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  expect(() => verifyProjectRuntimePins(root, expected)).not.toThrow();
  for (const path of [
    ".ai/tools/fixture/package.json",
    ".ai/tools/fixture/package-lock.json",
    ".github/workflows/ci.yml",
    "Dockerfile",
    ".nvmrc",
  ]) {
    await writeFile(
      join(root, path),
      files[path].replaceAll(expected.node, "0.0.0"),
    );
    expect(() => verifyProjectRuntimePins(root, expected)).toThrow(path);
    await writeFile(join(root, path), files[path]);
  }
});

it("runs the partial Docker verification with only the declared COPY inputs", async () => {
  const root = await directory();
  await mkdir(join(root, "scripts/runtime"), { recursive: true });
  const docker = await readFile(join(projectRoot, "Dockerfile"), "utf8");
  for (const path of [
    "package.json",
    "scripts/runtime/verify-runtime.mjs",
    "scripts/runtime/readProjectRuntime.config.mjs",
    "scripts/runtime/verifyProjectRuntimePins.service.mjs",
  ]) {
    expect(docker).toContain(path);
    await copyFile(join(projectRoot, path), join(root, path));
  }
  const result = await execute(
    process.execPath,
    [join(root, "scripts/runtime/verify-runtime.mjs"), "--runtime-only"],
    { env: { ...process.env, npm_execpath: npmCLI } },
  );
  expect(result.stdout).toContain("runtime: OK");
});
