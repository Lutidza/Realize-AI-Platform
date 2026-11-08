/**
 * @file packages/engineering-runtime/test/caseRenameNamespace.test.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Проверяет границы исключения case-only rename, включая синтетический case-insensitive alias.
 * @see documentation/architecture/engineering-operations.md
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCreationNamespace } from "../src/filesystem/creationManifest.service.ts";
import type { ManifestEntry } from "../src/filesystem/EngineeringFilesystem.types.ts";
import { EngineeringFailure } from "../src/runtime/EngineeringFailure.error.ts";
import { sha256Bytes } from "../src/contracts/hashEngineeringValue.util.ts";

for (const scenario of [
  "case-insensitive alias",
  "foreign exact destination",
  "foreign folded sibling",
  "Unicode folded sibling",
  "source identity mismatch",
  "planned folded name",
  "unbound create",
  "Unicode source alias",
])
  test(`namespace preserves ${scenario} instead of widening the rename exception`, () => {
    let from = "src/Original.util.ts";
    const to = "src/original.util.ts";
    const file = {
      kind: "file" as const,
      dev: "1",
      ino: "2",
      mode: 0o640,
      size: 4,
      sha256: sha256Bytes("data"),
    };
    const before: ManifestEntry[] = [
      {
        path: "src",
        identity: {
          ...file,
          kind: "directory",
          ino: "1",
          size: null,
          sha256: null,
        },
        children: [
          { name: "Original.util.ts", kind: "file", dev: "1", ino: "2" },
        ],
      },
      { path: from, identity: file, children: null },
      { path: to, identity: null, children: null },
    ];
    const paths = [to];
    if (scenario === "case-insensitive alias") before[2].identity = { ...file };
    if (scenario === "foreign exact destination")
      before[2].identity = { ...file, ino: "3" };
    if (
      scenario === "foreign folded sibling" ||
      scenario === "Unicode folded sibling"
    )
      before[0].children!.push({
        name:
          scenario === "foreign folded sibling"
            ? "ORIGINAL.util.ts"
            : "ＯＲＩＧＩＮＡＬ.util.ts",
        kind: "file",
        dev: "1",
        ino: "3",
      });
    if (scenario === "source identity mismatch")
      before[1].identity = { ...file, ino: "9" };
    if (scenario === "planned folded name") paths.push("src/ORIGINAL.util.ts");
    if (scenario === "Unicode source alias") {
      from = "src/ＯＲＩＧＩＮＡＬ.util.ts";
      before[1].path = from;
      before[0].children![0].name = "ＯＲＩＧＩＮＡＬ.util.ts";
    }
    const snapshot = structuredClone(before);
    const moves =
      scenario === "unbound create"
        ? []
        : [{ kind: "move" as const, fromPath: from, path: to }];
    assert.throws(
      () => assertCreationNamespace(before, paths, moves),
      (error: unknown) =>
        error instanceof EngineeringFailure &&
        error.code ===
          (scenario === "case-insensitive alias" ? "UNSUPPORTED" : "CONFLICT"),
    );
    assert.deepEqual(before, snapshot);
  });
