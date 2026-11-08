/**
 * @file packages/engineering-runtime/test/contracts.test.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Проверяет strict команды, ресурсные пределы, пути и canonical hashes инженерного протокола.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { canonicalEngineeringJson } from "../src/contracts/canonicalEngineeringJson.util.ts";
import { ENGINEERING_BOUNDS } from "../src/contracts/engineeringBounds.constants.ts";
import {
  cancelCommandSchema,
  engineeringCommandSchemas,
  eventsCommandSchema,
  fileActionSchema,
  planCommandSchema,
  prepareContentCommandSchema,
} from "../src/contracts/engineeringCommands.schemas.ts";
import {
  engineeringPathSchema,
  engineeringSha256Schema,
  engineeringTimestampSchema,
} from "../src/contracts/engineeringPrimitives.schemas.ts";
import {
  hashEngineeringValue,
  sha256Bytes,
} from "../src/contracts/hashEngineeringValue.util.ts";

const targetId = "00000000-0000-4000-8000-000000000001";
const requestId = "00000000-0000-4000-8000-000000000002";
const operationId = "00000000-0000-4000-8000-000000000003";
const planId = "00000000-0000-4000-8000-000000000004";
const contentRef = "00000000-0000-4000-8000-000000000005";
const hash = "a".repeat(64);
const createFile = {
  kind: "create_file",
  path: "src/Компонент.ts",
  artifactKind: "source",
  contentRef,
};
const plan = {
  schemaVersion: 1,
  targetId,
  requestId,
  intent: { kind: "file_batch", actions: [createFile] },
  taskRefs: [],
};

test("all nine command schemas accept protocol bodies and reject unknown fields", () => {
  const commands = {
    prepareContent: {
      schemaVersion: 1,
      targetId,
      requestId,
      mediaType: "text/plain",
      bytes: "YWJj",
      sha256: hash,
    },
    plan,
    preview: { schemaVersion: 1, operationId, planId, after: null, limit: 100 },
    apply: {
      schemaVersion: 1,
      operationId,
      planId,
      planHash: hash,
      requestId,
      expectedRevision: 0,
    },
    get: { schemaVersion: 1, operationId },
    cancel: {
      schemaVersion: 1,
      operationId,
      requestId,
      expectedRevision: 1,
      reason: "Отмена пользователем",
    },
    inspectRecovery: { schemaVersion: 1, operationId },
    recover: {
      schemaVersion: 1,
      operationId,
      recoveryPlanId: planId,
      recoveryPlanHash: hash,
      requestId,
      expectedRevision: 2,
      action: "retain_partial",
    },
    events: { schemaVersion: 1, targetId, after: null, limit: 500 },
  };
  for (const name of Object.keys(commands) as (keyof typeof commands)[]) {
    const schema = engineeringCommandSchemas[name];
    assert.deepEqual(schema.parse(commands[name]), commands[name], name);
    assert.equal(
      schema.safeParse({ ...commands[name], authorized: true }).success,
      false,
      name,
    );
    assert.equal(
      schema.safeParse({ ...commands[name], schemaVersion: 2 }).success,
      false,
      name,
    );
  }
});

test("file action discriminators and every nested object remain strict", () => {
  for (const action of [
    createFile,
    { kind: "edit_file", path: "a.txt", expectedSha256: hash, contentRef },
    {
      kind: "create_directory",
      path: "a",
      purpose: "Исходники",
      folderPolicyId: "source",
    },
    { kind: "move", from: "a", to: "b", expectedVersion: hash },
    { kind: "remove", path: "a", expectedVersion: hash },
  ]) {
    assert.equal(fileActionSchema.safeParse(action).success, true);
    assert.equal(
      fileActionSchema.safeParse({ ...action, recursive: true }).success,
      false,
    );
  }
  assert.equal(
    fileActionSchema.safeParse({ ...createFile, kind: "shell" }).success,
    false,
  );
  assert.equal(
    planCommandSchema.safeParse({
      ...plan,
      intent: { ...plan.intent, force: true },
    }).success,
    false,
  );
  assert.equal(
    planCommandSchema.safeParse({
      ...plan,
      intent: { ...plan.intent, actions: [{ ...createFile, force: true }] },
    }).success,
    false,
  );
  assert.equal(
    fileActionSchema.safeParse({
      kind: "remove",
      path: "a",
      expectedVersion: { hash },
    }).success,
    false,
  );
});

test("relative POSIX paths preserve names and reject traversal or ambiguous roots", () => {
  for (const path of [
    "src/Компонент.ts",
    ".ai/rules/owner.md",
    "Case/e\u0301.txt",
    "a b/c",
  ]) {
    assert.equal(engineeringPathSchema.parse(path), path);
  }
  for (const path of [
    "",
    "/tmp/file",
    "//server/file",
    "a/",
    "a//b",
    ".",
    "..",
    "a/../b",
    "./a",
    "a/./b",
    "a\\b",
    "a\0b",
    "C:/file",
    "C:file",
    "a".repeat(256),
    "я".repeat(128),
    Array(33).fill("a").join("/"),
    Array(6).fill("a".repeat(200)).join("/"),
  ]) {
    assert.equal(
      engineeringPathSchema.safeParse(path).success,
      false,
      JSON.stringify(path),
    );
  }
});

test("UUIDs, UTC timestamps, lowercase hashes and revisions use exact protocol formats", () => {
  assert.equal(
    planCommandSchema.safeParse({ ...plan, targetId: "project-one" }).success,
    false,
  );
  assert.equal(
    planCommandSchema.safeParse({ ...plan, taskRefs: ["TASK-64"] }).success,
    false,
  );
  assert.equal(
    engineeringTimestampSchema.safeParse("2026-10-26T12:30:00.000Z").success,
    true,
  );
  for (const timestamp of [
    "2026-10-26",
    "2026-10-26T12:30:00+00:00",
    "2026-02-30T12:30:00Z",
    "2026-10-26T12:30:00",
  ]) {
    assert.equal(
      engineeringTimestampSchema.safeParse(timestamp).success,
      false,
    );
  }
  for (const invalid of ["A".repeat(64), "a".repeat(63), "g".repeat(64)]) {
    assert.equal(engineeringSha256Schema.safeParse(invalid).success, false);
  }
  for (const revision of [
    -1,
    0.5,
    Infinity,
    NaN,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.equal(
      cancelCommandSchema.safeParse({
        schemaVersion: 1,
        operationId,
        requestId,
        expectedRevision: revision,
        reason: "Stop",
      }).success,
      false,
    );
  }
});

test("action/task/page/reason and total command budgets are enforced", () => {
  assert.equal(
    planCommandSchema.safeParse({
      ...plan,
      intent: { kind: "file_batch", actions: Array(64).fill(createFile) },
      taskRefs: Array(64).fill(targetId),
    }).success,
    true,
  );
  assert.equal(
    planCommandSchema.safeParse({
      ...plan,
      intent: { kind: "file_batch", actions: [] },
    }).success,
    false,
  );
  assert.equal(
    planCommandSchema.safeParse({
      ...plan,
      intent: { kind: "file_batch", actions: Array(65).fill(createFile) },
    }).success,
    false,
  );
  assert.equal(
    planCommandSchema.safeParse({ ...plan, taskRefs: Array(65).fill(targetId) })
      .success,
    false,
  );
  for (const limit of [0, -1, 501, 0.5, Infinity]) {
    assert.equal(
      eventsCommandSchema.safeParse({
        schemaVersion: 1,
        targetId,
        after: null,
        limit,
      }).success,
      false,
    );
  }
  assert.equal(
    eventsCommandSchema.safeParse({
      schemaVersion: 1,
      targetId,
      after: undefined,
      limit: 100,
    }).success,
    false,
  );
  assert.equal(
    eventsCommandSchema.safeParse({ schemaVersion: 1, targetId, after: null })
      .success,
    false,
  );
  assert.equal(
    eventsCommandSchema.safeParse({
      schemaVersion: 1,
      targetId,
      after: "x".repeat(2049),
      limit: 100,
    }).success,
    false,
  );
  const cancel = {
    schemaVersion: 1,
    operationId,
    requestId,
    expectedRevision: 0,
    reason: "я".repeat(1024),
  };
  assert.equal(cancelCommandSchema.safeParse(cancel).success, true);
  assert.equal(
    cancelCommandSchema.safeParse({ ...cancel, reason: `${cancel.reason}x` })
      .success,
    false,
  );
  const largeAction = {
    kind: "create_directory",
    path: "p".repeat(200),
    purpose: "x".repeat(2048),
    folderPolicyId: "source",
  };
  assert.equal(fileActionSchema.safeParse(largeAction).success, true);
  assert.equal(
    planCommandSchema.safeParse({
      ...plan,
      intent: { kind: "file_batch", actions: Array(64).fill(largeAction) },
    }).success,
    false,
  );
});

test("generate params are bounded plain JSON before recipe-specific validation", () => {
  const generate = (params: unknown) => ({
    ...plan,
    intent: { kind: "generate", recipeId: "types", params },
  });
  assert.equal(
    planCommandSchema.safeParse(
      generate({ enabled: true, names: ["a", null, 12] }),
    ).success,
    true,
  );
  let deep: unknown = null;
  for (let index = 0; index < 18; index += 1) deep = { child: deep };
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const params of [
    [],
    null,
    { value: undefined },
    { value: NaN },
    { value: new Date() },
    { value: "a".repeat(8193) },
    { value: Array(257).fill(0) },
    Object.fromEntries(
      Array.from({ length: 129 }, (_, index) => [`key${index}`, 0]),
    ),
    deep,
    cycle,
    { values: Array.from({ length: 256 }, () => Array(10).fill(0)) },
    { values: Array(16).fill("x".repeat(3000)) },
  ]) {
    assert.equal(planCommandSchema.safeParse(generate(params)).success, false);
  }
});

test("content transport accepts canonical base64 with a separate decoded blob budget", () => {
  const content = {
    schemaVersion: 1,
    targetId,
    requestId,
    mediaType: "text/plain",
    bytes: "",
    sha256: hash,
  };
  for (const bytes of ["", "YQ==", "YWI=", "YWJj", "AA==", "/w==", "//8="]) {
    assert.equal(
      prepareContentCommandSchema.safeParse({ ...content, bytes }).success,
      true,
      bytes,
    );
  }
  for (const bytes of [
    "YQ",
    "Y Q==",
    "YQ==\n",
    "YQ===",
    "YR==",
    "YWJ=",
    "====",
    "_w==",
    [97],
  ]) {
    assert.equal(
      prepareContentCommandSchema.safeParse({ ...content, bytes }).success,
      false,
    );
  }
  assert.equal(
    prepareContentCommandSchema.safeParse({
      ...content,
      mediaType: "text/html",
    }).success,
    false,
  );
  const bytes = Buffer.alloc(ENGINEERING_BOUNDS.contentBytes).toString(
    "base64",
  );
  assert.equal(
    prepareContentCommandSchema.safeParse({ ...content, bytes }).success,
    true,
  );
  assert.equal(
    prepareContentCommandSchema.safeParse({
      ...content,
      bytes: Buffer.alloc(ENGINEERING_BOUNDS.contentBytes + 1).toString(
        "base64",
      ),
    }).success,
    false,
  );
});

test("canonical hash sorts object keys, preserves array order, Unicode and exact bytes", () => {
  const value = { z: 0, a: [{ b: true, a: null }, "Привет"] };
  const serialized =
    '{"normalizationVersion":1,"value":{"a":[{"a":null,"b":true},"Привет"],"z":0}}';
  assert.equal(canonicalEngineeringJson(value), serialized);
  assert.equal(
    hashEngineeringValue(value),
    createHash("sha256").update(serialized).digest("hex"),
  );
  assert.equal(
    hashEngineeringValue(value),
    hashEngineeringValue({ a: [{ a: null, b: true }, "Привет"], z: 0 }),
  );
  assert.notEqual(hashEngineeringValue([1, 2]), hashEngineeringValue([2, 1]));
  assert.notEqual(hashEngineeringValue("é"), hashEngineeringValue("e\u0301"));
  assert.equal(
    sha256Bytes("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.notEqual(
    sha256Bytes(new Uint8Array([0, 255])),
    sha256Bytes(new Uint8Array([0, 254])),
  );
  const alias = { key: 1 };
  assert.equal(
    hashEngineeringValue([alias, alias]),
    hashEngineeringValue([{ key: 1 }, { key: 1 }]),
  );
});

test("canonicalization rejects undefined, cycles and unsupported objects without invoking code", () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  let accessed = false;
  const getter = Object.defineProperty({}, "value", {
    enumerable: true,
    get() {
      accessed = true;
      return 1;
    },
  });
  const hidden = Object.defineProperty({}, "value", { value: 1 });
  const arrayWithProperty = Object.assign([1], { extra: 1 });
  class CustomValue {
    value = 1;
  }
  for (const value of [
    undefined,
    { a: undefined },
    [undefined],
    NaN,
    Infinity,
    -Infinity,
    1n,
    Symbol("a"),
    () => 1,
    new Date(),
    new Map(),
    new Set(),
    new CustomValue(),
    new Uint8Array([1]),
    cycle,
    getter,
    hidden,
    { [Symbol("key")]: 1 },
    new Array(1),
    arrayWithProperty,
    {
      toJSON() {
        accessed = true;
        return 1;
      },
    },
  ]) {
    assert.throws(() => canonicalEngineeringJson(value));
  }
  assert.equal(accessed, false);
  assert.equal(
    planCommandSchema.safeParse({ ...plan, intent: getter }).success,
    false,
  );
  assert.equal(accessed, false);
});

test("canonicalization limits bytes, depth, nodes and collection widths", () => {
  assert.throws(
    () => canonicalEngineeringJson("я".repeat(20), { maxBytes: 64 }),
    RangeError,
  );
  assert.throws(
    () => canonicalEngineeringJson({ a: { b: 1 } }, { maxDepth: 1 }),
    RangeError,
  );
  assert.throws(
    () => canonicalEngineeringJson([1, 2], { maxNodes: 2 }),
    RangeError,
  );
  assert.throws(
    () => canonicalEngineeringJson([1, 2], { maxArrayItems: 1 }),
    RangeError,
  );
  assert.throws(
    () => canonicalEngineeringJson({ a: 1, b: 2 }, { maxObjectKeys: 1 }),
    RangeError,
  );
  assert.throws(
    () => canonicalEngineeringJson("я", { maxStringBytes: 1 }),
    RangeError,
  );
  assert.throws(
    () => canonicalEngineeringJson(1, { maxBytes: Infinity }),
    TypeError,
  );
  assert.throws(
    () => canonicalEngineeringJson(1, { maxDepth: 257 }),
    TypeError,
  );
});
