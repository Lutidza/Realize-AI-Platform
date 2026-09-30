/**
 * @file .ai/tools/agent-search/test/searchOutput.test.mjs
 * @version 1.0.1
 * @date 2026-09-26
 * @description Проверяет компактную выдачу, лимиты и завершение процесса поиска.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import {
  createSearchFixture,
  FIXTURE_NEEDLE,
} from "./createSearchFixture.adapter.mjs";

test("литеральный поиск, regexp, регистр и коды результата различаются", (t) => {
  const { run, write } = createSearchFixture(t);
  write("src/literal.ts", "value[0]\nvalue0\nVALUE[0]\n--flag\n");
  const args = ["--mode=special", "--path=src/literal.ts", "--reason=audit"];
  const literal = run([...args, "value[0]"]);
  assert.equal(literal.status, 0);
  assert.equal(literal.stdout.trim(), "src/literal.ts:1:1:value[0]");
  assert.match(run([...args, "--regex", "value[0]"]).stdout, /:2:1:value0/u);
  assert.equal(
    run([...args, "-i", "value[0]"])
      .stdout.trim()
      .split("\n").length,
    2,
  );
  assert.match(run([...args, "--", "--flag"]).stdout, /:4:1:--flag/u);
  assert.equal(run([...args, "absent"]).status, 1);
  assert.equal(run([...args, "--regex", "["]).status, 2);
});

test("длинная Unicode строка сохраняет совпадение, байтовые координаты и отметку сокращения", (t) => {
  const { run, write } = createSearchFixture(t);
  write(
    "src/long.ts",
    `${"Ж".repeat(1500)}${FIXTURE_NEEDLE}${"🙂".repeat(1000)}\n`,
  );
  const result = run([
    "--mode=special",
    "--path=src/long.ts",
    "--reason=audit",
    FIXTURE_NEEDLE,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /:1:3001:…/u);
  assert.ok(result.stdout.includes(FIXTURE_NEEDLE));
  assert.ok(result.stdout.trimEnd().endsWith("…"));
  assert.doesNotMatch(result.stdout, /�/u);
  assert.ok(Buffer.byteLength(result.stdout) < 1200);
});

test("пустая выборка кандидатов не скрывает ошибку regexp", (t) => {
  const { run, write } = createSearchFixture(t);
  write("src/.gitignore", "ignored/\n");
  write("src/ignored/file.ts");
  for (const output of ["files", "matches"]) {
    const empty = run([
      "--within=src/ignored",
      `--output=${output}`,
      "--regex",
      "valid.*query",
    ]);
    assert.equal(empty.status, 1, empty.stderr);
    const result = run([
      "--within=src/ignored",
      `--output=${output}`,
      "--regex",
      "[",
    ]);
    assert.equal(result.status, 2, result.stderr);
    assert.doesNotMatch(result.stdout, /Совпадений нет/u);
  }
});

test("ограничения количества и UTF-8 байтов соблюдаются на большой выдаче", (t) => {
  const { run, write } = createSearchFixture(t);
  write("src/many.ts", `${FIXTURE_NEEDLE} ${"я".repeat(80)}\n`.repeat(10000));
  const args = [
    "--mode=special",
    "--path=src/many.ts",
    "--reason=audit",
    FIXTURE_NEEDLE,
  ];
  const limited = run([...args, "--limit=3"]);
  assert.equal(limited.status, 0, limited.stderr);
  assert.equal(limited.stdout.trim().split("\n").length, 4);
  assert.match(limited.stdout, /Выдача неполная/u);
  const bytes = run([...args, "--max-bytes=700"]);
  assert.equal(bytes.status, 0);
  assert.ok(Buffer.byteLength(bytes.stdout) <= 700);
  assert.match(bytes.stdout, /лимит байтов/u);
  assert.doesNotMatch(bytes.stdout, /�/u);
});

test("точное число результатов не помечается как усечение", (t) => {
  const { run, write } = createSearchFixture(t);
  write("src/exact.ts", `${FIXTURE_NEEDLE}\n`.repeat(3));
  const result = run([
    "--mode=special",
    "--path=src/exact.ts",
    "--reason=audit",
    "--limit=3",
    FIXTURE_NEEDLE,
  ]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim().split("\n").length, 3);
  assert.doesNotMatch(result.stdout, /неполная/u);
});

test("чрезмерно длинный JSON frame останавливает поиск с явной ошибкой", (t) => {
  const { run, write } = createSearchFixture(t);
  write("src/huge.ts", `${FIXTURE_NEEDLE}${"x".repeat(1200000)}\n`);
  const args = [
    "--mode=special",
    "--path=src/huge.ts",
    "--reason=audit",
    FIXTURE_NEEDLE,
  ];
  const result = run(args);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /1 MiB/u);
  const files = run([...args, "--output=files"]);
  assert.equal(files.status, 0);
  assert.equal(files.stdout.trim(), "src/huge.ts");
});

// Управляемый локальный процесс проверяет lifecycle; остальные тесты используют настоящий rg.
function fakeRipgrep(fixture, body) {
  const pidFile = path.join(fixture.root, "process.pid");
  const pidsFile = path.join(fixture.root, "processes.txt");
  const executable = fixture.write(
    "fake-bin/rg",
    `#!${process.execPath}\nimport { writeFileSync, appendFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nappendFileSync(${JSON.stringify(pidsFile)}, String(process.pid) + '\\n');\nprocess.on('SIGTERM', () => {});\n${body}\nsetInterval(() => {}, 1000);\n`,
  );
  chmodSync(executable, 0o755);
  return {
    env: {
      ...process.env,
      PATH: `${path.dirname(executable)}${path.delimiter}${process.env.PATH}`,
    },
    pidFile,
    pidsFile,
  };
}

test("достигнув лимита, CLI дожидается закрытия даже игнорирующего SIGTERM процесса", (t) => {
  const fixture = createSearchFixture(t);
  const { env, pidFile } = fakeRipgrep(
    fixture,
    "process.stdout.write('src/one.ts\\0src/two.ts\\0');",
  );
  const result = fixture.run(["--output=paths", "--limit=1"], {
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /неполная/u);
  assert.throws(() => process.kill(Number(readFileSync(pidFile, "utf8")), 0), {
    code: "ESRCH",
  });
});

test("лимит выдачи закрывает оба активных процесса", (t) => {
  const fixture = createSearchFixture(t);
  const { env, pidsFile } = fakeRipgrep(
    fixture,
    `
if (process.argv.includes('--files')) {
  process.stdout.write(Array.from({length: 64}, (_, i) => 'src/file' + i + '.ts\\0').join(''));
} else {
  process.stdout.write('src/one.ts\\0src/two.ts\\0');
}`,
  );
  const result = fixture.run(["--output=files", "--limit=1", FIXTURE_NEEDLE], {
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /неполная/u);
  const pids = readFileSync(pidsFile, "utf8").trim().split("\n");
  assert.equal(pids.length, 2);
  for (const pid of pids)
    assert.throws(() => process.kill(Number(pid), 0), { code: "ESRCH" });
});

test("общий таймаут закрывает одновременно перечисление и поиск содержимого", (t) => {
  const fixture = createSearchFixture(t);
  const { env, pidsFile } = fakeRipgrep(
    fixture,
    `
if (process.argv.includes('--files')) {
  process.stdout.write(Array.from({length: 64}, (_, i) => 'src/file' + i + '.ts\\0').join(''));
}`,
  );
  const result = fixture.run(["--timeout-ms=1000", FIXTURE_NEEDLE], { env });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /лимит времени/u);
  const pids = readFileSync(pidsFile, "utf8").trim().split("\n");
  assert.equal(pids.length, 2);
  for (const pid of pids)
    assert.throws(() => process.kill(Number(pid), 0), { code: "ESRCH" });
});

test("таймаут завершает процесс и не объявляет отсутствие совпадений", (t) => {
  const fixture = createSearchFixture(t);
  const { env, pidFile } = fakeRipgrep(fixture, "");
  const result = fixture.run(["--timeout-ms=500", FIXTURE_NEEDLE], { env });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /лимит времени/u);
  assert.doesNotMatch(result.stdout, /Совпадений нет/u);
  assert.throws(() => process.kill(Number(readFileSync(pidFile, "utf8")), 0), {
    code: "ESRCH",
  });
});

test("отмена CLI завершает его дочерний процесс и возвращает 130", async (t) => {
  const fixture = createSearchFixture(t);
  const { env, pidFile } = fakeRipgrep(fixture, "");
  const child = spawn(process.execPath, [fixture.cli, FIXTURE_NEEDLE], {
    cwd: fixture.root,
    env,
    stdio: "ignore",
  });
  const closed = once(child, "close");
  try {
    for (let attempt = 0; attempt < 100 && !existsSync(pidFile); attempt++) {
      await delay(20);
    }
    assert.ok(
      existsSync(pidFile),
      "Дочерний процесс должен запуститься до отмены",
    );
    child.kill("SIGINT");
    const [code] = await closed;
    assert.equal(code, 130);
    assert.throws(
      () => process.kill(Number(readFileSync(pidFile, "utf8")), 0),
      { code: "ESRCH" },
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
    await closed;
  }
});

test("отсутствующий rg является ошибкой, а не пустым результатом", (t) => {
  const fixture = createSearchFixture(t);
  const result = fixture.run([FIXTURE_NEEDLE], {
    env: { ...process.env, PATH: fixture.workspace },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /rg.*не установлен/u);
  assert.equal(result.stdout, "");
});
