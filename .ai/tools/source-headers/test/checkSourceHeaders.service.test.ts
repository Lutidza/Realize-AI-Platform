/**
 * @file .ai/tools/source-headers/test/checkSourceHeaders.service.test.ts
 * @version 1.0.0
 * @date 2026-09-08
 * @description Проверяет обязательные шапки и границы списка исходников через публичный сервис.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";

import { checkSourceHeaders } from "../src/checkSourceHeaders.service.ts";

async function createFixture(t: TestContext) {
  const temporary = await mkdtemp(join(tmpdir(), "realize-source-headers-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });
  const root = join(temporary, "repository");
  await mkdir(root);
  const write = async (file: string, content: string | Uint8Array) => {
    const absolutePath = join(root, file);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  };
  return { root, temporary, write };
}

function headerFields(file: string) {
  return [
    `@file ${file}`,
    "@version 1.0.0",
    "@date 2026-09-08",
    "@description Проверяет содержимое исходного файла.",
  ];
}

function jsHeader(file: string) {
  const fields = headerFields(file)
    .map((field) => ` * ${field}`)
    .join("\n");
  return `/**\n${fields}\n */\n`;
}

function assertViolation(
  result: Awaited<ReturnType<typeof checkSourceHeaders>>,
  file: string,
) {
  const violations = result.violations.filter((entry) => entry.file === file);
  assert.ok(violations.length > 0, `Ожидалось нарушение для ${file}`);
  assert.ok(violations.every((entry) => entry.message.trim().length > 0));
  assert.ok(!result.skipped.some((entry) => entry.file === file));
}

test("проверяет только переданные файлы и сохраняет их байты", async (t) => {
  const f = await createFixture(t);
  const file = "src/owned.ts";
  await f.write(file, `${jsHeader(file)}export const value = 1;\n`);
  await f.write("src/unlisted.ts", "export const missingHeader = true;\n");
  const before = await readFile(join(f.root, file));

  const result = await checkSourceHeaders({ root: f.root, files: [file] });

  assert.deepEqual(result, { checked: 1, skipped: [], violations: [] });
  assert.deepEqual(await readFile(join(f.root, file)), before);
});

test("нормализует относительные и абсолютные дубли внутри root", async (t) => {
  const f = await createFixture(t);
  const file = "src/owned.ts";
  await f.write(file, jsHeader(file));

  const result = await checkSourceHeaders({
    root: f.root,
    files: [file, `./${file}`, "src/../src/owned.ts", join(f.root, file)],
  });

  assert.deepEqual(result, { checked: 1, skipped: [], violations: [] });
});

test("пустой список возвращает нарушение без обхода файлов", async (t) => {
  const f = await createFixture(t);
  await f.write("src/unlisted.ts", "export const missingHeader = true;\n");

  const result = await checkSourceHeaders({ root: f.root, files: [] });

  assert.equal(result.checked, 0);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.violations.length, 1);
  assert.ok(result.violations[0].message.trim().length > 0);
});

test("отсутствующий файл и каталог не считаются проверенными исходниками", async (t) => {
  const f = await createFixture(t);
  await mkdir(join(f.root, "src"));

  const result = await checkSourceHeaders({
    root: f.root,
    files: ["src/missing.ts", "src"],
  });

  assert.equal(result.checked, 0);
  assertViolation(result, "src/missing.ts");
  assertViolation(result, "src");
});

test("отклоняет относительный и абсолютный выход за root", async (t) => {
  const f = await createFixture(t);
  const relativeOutside = "../outside.ts";
  const absoluteOutside = join(f.temporary, "other.ts");
  await writeFile(join(f.temporary, "outside.ts"), jsHeader(relativeOutside));
  await writeFile(absoluteOutside, jsHeader(absoluteOutside));

  const result = await checkSourceHeaders({
    root: f.root,
    files: [relativeOutside, absoluteOutside],
  });

  assert.equal(result.checked, 0);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.violations.length, 2);
  assert.ok(
    result.violations.every((entry) => entry.message.trim().length > 0),
  );
});

test("принимает JSDoc с допустимыми прологами и директивами", async (t) => {
  const f = await createFixture(t);
  const cases = [
    { file: "src/plain.ts", prefix: "", suffix: "" },
    {
      file: "scripts/command.mjs",
      prefix:
        "#!/usr/bin/env node\n/* Copyright Fixture; SPDX-License-Identifier: MIT */\n'use strict';\n",
      suffix: "",
    },
    {
      file: "tests/environment.mts",
      prefix: '// @vitest-environment node\n/// <reference types="node" />\n',
      suffix: "",
    },
    { file: "src/client.tsx", prefix: "'use client';\n", suffix: "" },
    { file: "src/server.ts", prefix: '"use server"\n', suffix: "" },
    { file: "src/header-first.tsx", prefix: "", suffix: "'use client';\n" },
    { file: "src/windows.ts", prefix: "\uFEFF", suffix: "" },
  ];
  for (const entry of cases) {
    const content = `${entry.prefix}${jsHeader(entry.file)}${entry.suffix}export const value = 1;\n`;
    await f.write(
      entry.file,
      entry.file === "src/windows.ts"
        ? content.replaceAll("\n", "\r\n")
        : content,
    );
  }

  const result = await checkSourceHeaders({
    root: f.root,
    files: cases.map((entry) => entry.file),
  });

  assert.deepEqual(result, {
    checked: cases.length,
    skipped: [],
    violations: [],
  });
});

test("принимает комментарии CSS, Shell, YAML, nginx, Dockerfile и разметки", async (t) => {
  const f = await createFixture(t);
  const cases = [
    {
      file: "src/styles.css",
      prefix: "/*\n",
      line: " * ",
      end: " */\n",
      code: "body {}\n",
    },
    {
      file: "scripts/run.sh",
      prefix: "#!/usr/bin/env bash\n",
      line: "# ",
      end: "",
      code: "true\n",
    },
    {
      file: "compose.yaml",
      prefix: "",
      line: "# ",
      end: "",
      code: "services: {}\n",
    },
    {
      file: "scripts/nginx.conf",
      prefix: "",
      line: "# ",
      end: "",
      code: "events {}\n",
    },
    {
      file: "Dockerfile",
      prefix: "# syntax=docker/dockerfile:1.7\n\n",
      line: "# ",
      end: "",
      code: "FROM scratch\n",
    },
    {
      file: "src/page.html",
      prefix: "<!--\n",
      line: "",
      end: "-->\n",
      code: "<!doctype html><html></html>\n",
    },
  ];
  for (const entry of cases) {
    const header = headerFields(entry.file)
      .map((field) => `${entry.line}${field}`)
      .join("\n");
    await f.write(
      entry.file,
      `${entry.prefix}${header}\n${entry.end}${entry.code}`,
    );
  }

  const result = await checkSourceHeaders({
    root: f.root,
    files: cases.map((entry) => entry.file),
  });

  assert.deepEqual(result, {
    checked: cases.length,
    skipped: [],
    violations: [],
  });
});

test("рукописные декларации типов требуют обычную шапку", async (t) => {
  const f = await createFixture(t);
  const valid = "src/assets.d.ts";
  const invalid = "src/missing.d.ts";
  await f.write(valid, `${jsHeader(valid)}/// <reference types=\"node\" />\n`);
  await f.write(invalid, "declare const value: string;\n");

  const result = await checkSourceHeaders({
    root: f.root,
    files: [valid, invalid],
  });

  assert.equal(result.violations.length, 1);
  assertViolation(result, invalid);
  assert.deepEqual(result.skipped, []);
});

test("каждое обязательное поле должно присутствовать", async (t) => {
  const f = await createFixture(t);
  const files = ["file", "version", "date", "description"].map(
    (field) => `src/missing-${field}.ts`,
  );
  for (const [index, file] of files.entries()) {
    const lines = headerFields(file).filter(
      (_, fieldIndex) => fieldIndex !== index,
    );
    await f.write(
      file,
      `/**\n${lines.map((field) => ` * ${field}`).join("\n")}\n */\n`,
    );
  }

  const result = await checkSourceHeaders({ root: f.root, files });

  for (const file of files) assertViolation(result, file);
});

test("каждое обязательное поле должно быть непустым", async (t) => {
  const f = await createFixture(t);
  const fields = ["file", "version", "date", "description"];
  const files = fields.map((field) => `src/empty-${field}.ts`);
  for (const [index, file] of files.entries()) {
    const lines = headerFields(file);
    lines[index] = `@${fields[index]}   `;
    await f.write(
      file,
      `/**\n${lines.map((field) => ` * ${field}`).join("\n")}\n */\n`,
    );
  }

  const result = await checkSourceHeaders({ root: f.root, files });

  for (const file of files) assertViolation(result, file);
});

test("поля из разных комментариев не объединяются в шапку", async (t) => {
  const f = await createFixture(t);
  const file = "src/split.ts";
  const fields = headerFields(file);
  await f.write(
    file,
    `/**\n * ${fields[0]}\n * ${fields[1]}\n */\n/**\n * ${fields[2]}\n * ${fields[3]}\n */\n`,
  );

  const result = await checkSourceHeaders({ root: f.root, files: [file] });

  assertViolation(result, file);
});

test("комментарий первого API не считается второй шапкой файла", async (t) => {
  const f = await createFixture(t);
  const file = "src/public-api.ts";
  await f.write(
    file,
    `${jsHeader(file)}/** @description Возвращает публичное значение. */\nexport function value() { return 1; }\n`,
  );

  const result = await checkSourceHeaders({ root: f.root, files: [file] });

  assert.deepEqual(result, { checked: 1, skipped: [], violations: [] });
});

test("описание допускает упоминания тегов и переносы строк", async (t) => {
  const f = await createFixture(t);
  const descriptions = [
    "@description Проверяет поле @file в шапке.",
    "@description\n * Проверяет поле @file\n * и остальные обязательные поля.",
  ];
  const files = descriptions.map((_, index) => `src/description-${index}.ts`);
  for (const [index, file] of files.entries()) {
    await f.write(
      file,
      jsHeader(file).replace(
        "@description Проверяет содержимое исходного файла.",
        descriptions[index],
      ),
    );
  }

  const result = await checkSourceHeaders({ root: f.root, files });

  assert.deepEqual(result, { checked: 2, skipped: [], violations: [] });
});

test("шапка должна предшествовать коду и не может быть строковым литералом", async (t) => {
  const f = await createFixture(t);
  const cases = [
    {
      file: "src/late.ts",
      content: `export const value = 1;\n${jsHeader("src/late.ts")}`,
    },
    {
      file: "src/string.ts",
      content: `const text = ${JSON.stringify(jsHeader("src/string.ts"))};\n`,
    },
  ];
  for (const entry of cases) await f.write(entry.file, entry.content);

  const result = await checkSourceHeaders({
    root: f.root,
    files: cases.map((entry) => entry.file),
  });

  for (const entry of cases) assertViolation(result, entry.file);
});

test("TS и JS требуют JSDoc вместо обычного блочного комментария", async (t) => {
  const f = await createFixture(t);
  const file = "src/plain-comment.js";
  await f.write(file, jsHeader(file).replace("/**", "/*"));

  const result = await checkSourceHeaders({ root: f.root, files: [file] });

  assertViolation(result, file);
});

test("@file должен совпадать с путём от корня репозитория", async (t) => {
  const f = await createFixture(t);
  const file = "src/renamed.ts";
  await f.write(file, jsHeader("src/previous.ts"));

  const result = await checkSourceHeaders({ root: f.root, files: [file] });

  assertViolation(result, file);
});

test("версия имеет три числовые части без ведущих нулей и даты", async (t) => {
  const f = await createFixture(t);
  const versions = [
    "2026-09-08",
    "1.0",
    "01.0.0",
    "1.02.0",
    "1.0.03",
    "1.0.0-beta",
    "1.0.0 - 2026-09-08",
  ];
  const files = versions.map((_, index) => `src/version-${index}.ts`);
  for (const [index, file] of files.entries()) {
    await f.write(
      file,
      jsHeader(file).replace("@version 1.0.0", `@version ${versions[index]}`),
    );
  }

  const result = await checkSourceHeaders({ root: f.root, files });

  for (const file of files) assertViolation(result, file);
});

test("дата должна быть календарно корректной в формате YYYY-MM-DD", async (t) => {
  const f = await createFixture(t);
  const dates = [
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-09-00",
    "2026-9-8",
  ];
  const files = dates.map((_, index) => `src/date-${index}.ts`);
  for (const [index, file] of files.entries()) {
    await f.write(
      file,
      jsHeader(file).replace("@date 2026-09-08", `@date ${dates[index]}`),
    );
  }

  const result = await checkSourceHeaders({ root: f.root, files });

  for (const file of files) assertViolation(result, file);
});

test("принимает нулевую версию и корректную историческую високосную дату", async (t) => {
  const f = await createFixture(t);
  const file = "src/existing.ts";
  await f.write(
    file,
    jsHeader(file)
      .replace("@version 1.0.0", "@version 0.0.0")
      .replace("@date 2026-09-08", "@date 2000-02-29"),
  );

  const result = await checkSourceHeaders({ root: f.root, files: [file] });

  assert.deepEqual(result, { checked: 1, skipped: [], violations: [] });
});

test("описание должно содержать русский текст", async (t) => {
  const f = await createFixture(t);
  const file = "src/english-description.ts";
  await f.write(
    file,
    jsHeader(file).replace(
      "Проверяет содержимое исходного файла.",
      "Checks the source file.",
    ),
  );

  const result = await checkSourceHeaders({ root: f.root, files: [file] });

  assertViolation(result, file);
});

test("исключает JSON, Markdown и известные бинарные форматы с объяснением", async (t) => {
  const f = await createFixture(t);
  const files = ["package.json", "README.md", "public/photo.png"];
  await f.write(files[0], "{}\n");
  await f.write(files[1], "# Документация\n");
  await f.write(files[2], new Uint8Array([137, 80, 78, 71, 0, 255]));

  const result = await checkSourceHeaders({ root: f.root, files });

  assert.equal(result.checked, 0);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(
    result.skipped.map((entry) => entry.file).sort(),
    [...files].sort(),
  );
  assert.ok(result.skipped.every((entry) => entry.reason.trim().length > 0));
});

test("исключает точные generated-файлы, сохраняя проверку соседнего custom.scss", async (t) => {
  const f = await createFixture(t);
  const generatedFiles = [
    "src/payload-types.ts",
    "next-env.d.ts",
    "src/app/(payload)/admin/importMap.js",
    "src/app/(payload)/layout.tsx",
    "src/app/(payload)/admin/[[...segments]]/page.tsx",
    "src/app/(payload)/admin/[[...segments]]/not-found.tsx",
    "src/app/(payload)/api/[...slug]/route.ts",
    "src/app/(payload)/api/graphql/route.ts",
    "src/app/(payload)/api/graphql-playground/route.ts",
  ];
  for (const file of generatedFiles) await f.write(file, "export {};\n");
  const handwritten = "src/app/(payload)/custom.scss";
  await f.write(handwritten, ".visually-hidden { position: absolute; }\n");

  const result = await checkSourceHeaders({
    root: f.root,
    files: [...generatedFiles, handwritten],
  });

  assert.deepEqual(
    result.skipped.map((entry) => entry.file).sort(),
    [...generatedFiles].sort(),
  );
  assert.ok(result.skipped.every((entry) => entry.reason.trim().length > 0));
  assert.equal(result.violations.length, 1);
  assertViolation(result, handwritten);
});

test("исключает зависимости и результаты сборки по точным границам каталогов", async (t) => {
  const f = await createFixture(t);
  const skippedFiles = [
    "node_modules/vendor/index.js",
    ".next/server/app.js",
    ".ai/tools/agent-monitor/dist/assets/index.js",
  ];
  const ownedFiles = [
    "src/node_modules-copy/index.js",
    ".ai/tools/agent-monitor/dist-copy/index.js",
  ];
  for (const file of [...skippedFiles, ...ownedFiles]) {
    await f.write(file, "export {};\n");
  }

  const result = await checkSourceHeaders({
    root: f.root,
    files: [...skippedFiles, ...ownedFiles],
  });

  assert.deepEqual(
    result.skipped.map((entry) => entry.file).sort(),
    [...skippedFiles].sort(),
  );
  assert.ok(result.skipped.every((entry) => entry.reason.trim().length > 0));
  for (const file of ownedFiles) assertViolation(result, file);
});

test("произвольный generated-маркер не даёт исключения собственному исходнику", async (t) => {
  const f = await createFixture(t);
  const file = "src/generated-name.ts";
  await f.write(
    file,
    "/* This file was automatically generated. DO NOT EDIT. */\nexport {};\n",
  );

  const result = await checkSourceHeaders({ root: f.root, files: [file] });

  assertViolation(result, file);
});

test("неизвестный текстовый формат требует явной ручной проверки", async (t) => {
  const f = await createFixture(t);
  const files = ["src/unknown.custom-format", "notes.txt", "constructor"];
  for (const file of files) await f.write(file, jsHeader(file));

  const result = await checkSourceHeaders({ root: f.root, files });

  for (const file of files) assertViolation(result, file);
});
