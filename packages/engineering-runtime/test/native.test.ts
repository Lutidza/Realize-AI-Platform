/**
 * @file packages/engineering-runtime/test/native.test.ts
 * @version 1.0.1
 * @date 2026-10-28
 * @description Проверяет явную native сборку, loader binding и guards Linux rename/exchange primitives.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { loadEngineeringNative } from "../src/native/engineeringNative.index.ts";
import type {
  LoadEngineeringNativeInput,
  NativeFilesystem,
} from "../src/native/engineeringNative.index.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
let root: string;
let binding: LoadEngineeringNativeInput;
let native: NativeFilesystem;
const hasCode = (code: string) => (error: unknown) =>
  error instanceof Error && "code" in error && error.code === code;

before(() => {
  const cache = join(homedir(), ".cache");
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  root = mkdtempSync(join(cache, "realize-engineering-native-"));
  // Отдельный явный build stage выполняется один раз; live effect ниже не запускает compiler/process.
  binding = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/buildEngineeringNative.mjs", "--output", root],
      { cwd: repository, encoding: "utf8", timeout: 60_000 },
    ),
  );
  native = loadEngineeringNative(binding);
});
after(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function directories(t: TestContext) {
  const base = mkdtempSync(join(root, "case-"));
  const source = join(base, "source");
  const target = join(base, "target");
  mkdirSync(source, { mode: 0o700 });
  mkdirSync(target, { mode: 0o700 });
  const sourceFd = openSync(
    source,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  const targetFd = openSync(
    target,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  t.after(() => {
    closeSync(sourceFd);
    closeSync(targetFd);
  });
  return { source, target, sourceFd, targetFd };
}

test("explicit build yields private NAPI8 artifact and immutable loader binding", () => {
  assert.equal(statSync(binding.path).mode & 0o7777, 0o600);
  const manifest = JSON.parse(
    readFileSync(join(root, "engineeringFilesystem.manifest.json"), "utf8"),
  );
  assert.equal(manifest.napiVersion, 8);
  assert.equal(manifest.sha256, binding.sha256);
  assert.match(manifest.sourceSha256, /^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(native));
  assert.equal(loadEngineeringNative(binding), native);
  assert.throws(
    () => loadEngineeringNative({ ...binding, sha256: "0".repeat(64) }),
    hasCode("CONFLICT"),
  );
});

test("build rejects checkout output and loader never builds a missing artifact", () => {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        ["scripts/buildEngineeringNative.mjs", "--output", repository],
        {
          cwd: repository,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 5000,
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error && "stderr" in error);
      assert.match(String(error.stderr), /вне checkout/);
      return true;
    },
  );
  const missing = join(root, "missing.node");
  assert.throws(
    () => loadEngineeringNative({ path: missing, sha256: binding.sha256 }),
    hasCode("UNSUPPORTED"),
  );
  assert.equal(existsSync(missing), false);
});

test("file and empty directory publication preserve the known staged inode", (t) => {
  const f = directories(t);
  writeFileSync(join(f.source, "file"), "frozen bytes", { mode: 0o600 });
  mkdirSync(join(f.source, "directory"), { mode: 0o700 });
  for (const name of ["file", "directory"]) {
    const before = statSync(join(f.source, name), { bigint: true });
    native.renameNoReplace(f.sourceFd, name, f.targetFd, name);
    const after = statSync(join(f.target, name), { bigint: true });
    assert.equal(after.ino, before.ino);
    assert.equal(after.dev, before.dev);
    assert.equal(existsSync(join(f.source, name)), false);
  }
  assert.equal(readFileSync(join(f.target, "file"), "utf8"), "frozen bytes");
});

test("EEXIST never overwrites an existing file or even an empty directory", (t) => {
  const f = directories(t);
  writeFileSync(join(f.source, "file"), "new", { mode: 0o600 });
  writeFileSync(join(f.target, "file"), "original", { mode: 0o600 });
  mkdirSync(join(f.source, "directory"), { mode: 0o700 });
  mkdirSync(join(f.target, "directory"), { mode: 0o700 });
  for (const name of ["file", "directory"]) {
    const before = statSync(join(f.target, name), { bigint: true });
    assert.throws(
      () => native.renameNoReplace(f.sourceFd, name, f.targetFd, name),
      hasCode("CONFLICT"),
    );
    assert.equal(
      statSync(join(f.target, name), { bigint: true }).ino,
      before.ino,
    );
    assert.ok(existsSync(join(f.source, name)));
  }
  assert.equal(readFileSync(join(f.target, "file"), "utf8"), "original");
});

test("C boundary rejects traversal, embedded NUL, invalid descriptors and symlinks", (t) => {
  const f = directories(t);
  writeFileSync(join(f.source, "file"), "original", { mode: 0o600 });
  for (const name of [
    "",
    ".",
    "..",
    "../file",
    "nested/file",
    "file\0suffix",
    "x".repeat(256),
  ])
    assert.throws(
      () => native.renameNoReplace(f.sourceFd, name, f.targetFd, "destination"),
      hasCode("UNSUPPORTED"),
    );
  assert.throws(() => native.inspectFd(-1), hasCode("UNSUPPORTED"));
  assert.throws(() => native.inspectFd(0.5), hasCode("UNSUPPORTED"));
  symlinkSync("file", join(f.source, "alias"));
  assert.throws(
    () => native.renameNoReplace(f.sourceFd, "alias", f.targetFd, "alias"),
    hasCode("UNSUPPORTED"),
  );
  assert.equal(readFileSync(join(f.source, "file"), "utf8"), "original");
});

test("inspect rejects hardlinks and special mode bits while accepting plain objects", (t) => {
  const f = directories(t);
  const path = join(f.source, "file");
  writeFileSync(path, "plain", { mode: 0o600 });
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  t.after(() => closeSync(fd));
  native.inspectFd(f.sourceFd);
  native.inspectFd(fd);
  linkSync(path, join(f.source, "linked"));
  assert.throws(() => native.inspectFd(fd), hasCode("UNSUPPORTED"));
  rmSync(join(f.source, "linked"));
  chmodSync(path, 0o4600);
  assert.throws(() => native.inspectFd(fd), hasCode("UNSUPPORTED"));
});

test("publication rejects FIFO before opening it for reading", (t) => {
  const f = directories(t);
  const path = join(f.source, "fifo");
  // Только подготовка fixture: live primitive не запускает процессов и не открывает FIFO для I/O.
  execFileSync(
    "/usr/bin/python3",
    ["-c", "import os,sys; os.mkfifo(sys.argv[1], 0o600)", path],
    { timeout: 5000 },
  );
  assert.throws(
    () => native.renameNoReplace(f.sourceFd, "fifo", f.targetFd, "fifo"),
    hasCode("UNSUPPORTED"),
  );
  assert.ok(statSync(path).isFIFO());
  assert.equal(existsSync(join(f.target, "fifo")), false);
});

test("inspect rejects real xattrs and closed descriptors without exposing OS paths", (t) => {
  const f = directories(t);
  const path = join(f.source, "attributes");
  writeFileSync(path, "private fixture", { mode: 0o600 });
  // Подготовка fixture отдельно от live port: Node.js не предоставляет setxattr.
  execFileSync(
    "/usr/bin/python3",
    [
      "-c",
      "import os,sys; os.setxattr(sys.argv[1], 'user.engineering_fixture', b'1')",
      path,
    ],
    { timeout: 5000 },
  );
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    assert.throws(
      () => native.inspectFd(fd),
      (error: unknown) => {
        assert.ok(hasCode("UNSUPPORTED")(error));
        assert.equal((error as Error).message.includes(root), false);
        return true;
      },
    );
  } finally {
    closeSync(fd);
  }
  assert.throws(() => native.inspectFd(fd), hasCode("CONFLICT"));
});

test("loader rejects symlink parents, artifact aliases and changed private mode", (t) => {
  const alias = join(root, "alias.node");
  symlinkSync(binding.path, alias);
  assert.throws(
    () => loadEngineeringNative({ ...binding, path: alias }),
    hasCode("UNSUPPORTED"),
  );
  const parentAlias = join(root, "parent-alias");
  symlinkSync(root, parentAlias);
  assert.throws(
    () =>
      loadEngineeringNative({
        ...binding,
        path: join(parentAlias, "engineeringFilesystem.node"),
      }),
    hasCode("CONFLICT"),
  );
  chmodSync(binding.path, 0o644);
  t.after(() => chmodSync(binding.path, 0o600));
  assert.throws(() => loadEngineeringNative(binding), hasCode("CONFLICT"));
  chmodSync(binding.path, 0o600);
});

test("unsupported foreign mount never receives a copied staged file", (t) => {
  const f = directories(t);
  writeFileSync(join(f.source, "file"), "retained", { mode: 0o600 });
  const foreign = openSync(
    "/proc",
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  t.after(() => closeSync(foreign));
  assert.notEqual(fstatSync(foreign).dev, fstatSync(f.sourceFd).dev);
  assert.throws(
    () =>
      native.renameNoReplace(
        f.sourceFd,
        "file",
        foreign,
        "engineering-native-fixture",
      ),
    hasCode("UNSUPPORTED"),
  );
  assert.equal(readFileSync(join(f.source, "file"), "utf8"), "retained");
});

test("exchange preserves both regular inodes and rejects a stale identity without changing bytes", (t) => {
  const f = directories(t);
  const staged = join(f.source, "file"),
    live = join(f.target, "file");
  writeFileSync(staged, "replacement", { mode: 0o640 });
  writeFileSync(live, "original", { mode: 0o640 });
  const s = statSync(staged, { bigint: true }),
    d = statSync(live, { bigint: true });
  const exchange = (ino = d.ino.toString()) =>
    native.renameExchange!(
      f.sourceFd,
      "file",
      f.targetFd,
      "file",
      s.dev.toString(),
      s.ino.toString(),
      d.dev.toString(),
      ino,
    );
  assert.throws(() => exchange((d.ino + 1n).toString()), hasCode("CONFLICT"));
  assert.equal(readFileSync(live, "utf8"), "original");
  assert.equal(readFileSync(staged, "utf8"), "replacement");
  exchange();
  assert.equal(statSync(live, { bigint: true }).ino, s.ino);
  assert.equal(statSync(staged, { bigint: true }).ino, d.ino);
  assert.equal(readFileSync(live, "utf8"), "replacement");
  assert.equal(readFileSync(staged, "utf8"), "original");
  assert.throws(() => exchange(), hasCode("CONFLICT"));
});

for (const side of ["source", "target"] as const) {
  test(`exchange rejects ${side} xattrs before changing either file`, (t) => {
    const f = directories(t);
    const staged = join(f.source, "file"),
      live = join(f.target, "file");
    writeFileSync(staged, "replacement");
    writeFileSync(live, "original");
    execFileSync(
      "/usr/bin/python3",
      [
        "-c",
        "import os,sys; os.setxattr(sys.argv[1], 'user.engineering_fixture', b'1')",
        join(f[side], "file"),
      ],
      { timeout: 5000 },
    );
    const s = statSync(staged, { bigint: true }),
      d = statSync(live, { bigint: true });
    assert.throws(
      () =>
        native.renameExchange!(
          f.sourceFd,
          "file",
          f.targetFd,
          "file",
          s.dev.toString(),
          s.ino.toString(),
          d.dev.toString(),
          d.ino.toString(),
        ),
      hasCode("UNSUPPORTED"),
    );
    assert.equal(readFileSync(live, "utf8"), "original");
    assert.equal(readFileSync(staged, "utf8"), "replacement");
  });
}

test("rename with an expected source rejects stale inode and destination collisions", (t) => {
  const f = directories(t);
  writeFileSync(join(f.source, "file"), "source");
  writeFileSync(join(f.target, "file"), "destination");
  const s = statSync(join(f.source, "file"), { bigint: true });
  assert.throws(
    () =>
      native.renameNoReplace(
        f.sourceFd,
        "file",
        f.targetFd,
        "new",
        s.dev.toString(),
        (s.ino + 1n).toString(),
      ),
    hasCode("CONFLICT"),
  );
  assert.equal(existsSync(join(f.target, "new")), false);
  assert.throws(
    () =>
      native.renameNoReplace(
        f.sourceFd,
        "file",
        f.targetFd,
        "file",
        s.dev.toString(),
        s.ino.toString(),
      ),
    hasCode("CONFLICT"),
  );
  assert.equal(readFileSync(join(f.source, "file"), "utf8"), "source");
  assert.equal(readFileSync(join(f.target, "file"), "utf8"), "destination");
});
