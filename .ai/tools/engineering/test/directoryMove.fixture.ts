/**
 * @file .ai/tools/engineering/test/directoryMove.fixture.ts
 * @version 1.0.0
 * @date 2026-10-29
 * @description Готовит изолированное authored-дерево с внутренними и внешними ссылками для directory move.
 * @see documentation/architecture/engineering-operations.md
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import type { LoadEngineeringNativeInput } from "@realize/engineering-runtime";
import { renderSourceTemplate } from "../src/projectEngineering.index.ts";
import type { ProjectFolderPolicy } from "../src/projectEngineering.index.ts";
import {
  filesystemFixture,
  planCommand,
  policySource,
} from "./filesystemIntegration.fixture.ts";

/** Настоящий project binding и native ports; вызывающий закрывает fixture и удаляет только её root. */
export function directoryMoveFixture(
  native: LoadEngineeringNativeInput,
  extraFolderPolicies: readonly ProjectFolderPolicy[] = [],
  from = "src/move/left",
  to = "src/move/right/relocated",
) {
  const movePolicy = {
    changedOn: "2026-10-28",
    coverage: "complete" as const,
    referenceRoots: ["src/move"],
    sourcePaths: [policySource],
  };
  const f = filesystemFixture(
    native,
    undefined,
    undefined,
    [],
    movePolicy,
    extraFolderPolicies,
  );
  const source = from + "/calculateTotal.util.ts";
  const nested = from + "/nested/calculateDouble.util.ts";
  const consumer = "src/move/useTotal.util.ts";
  const empty = from + "/empty";
  const put = (path: string, body: string, bom = false) => {
    mkdirSync(dirname(join(f.checkout, path)), { recursive: true });
    const text = Buffer.from(
      renderSourceTemplate({
        path,
        body,
        descriptionRu: "Вычисляет результат сценария переноса дерева.",
        createdOn: "2026-10-26",
        seeRefs: ["documentation/architecture/engineering-artifacts.md"],
      }),
    ).toString("utf8");
    writeFileSync(
      join(f.checkout, path),
      bom ? "\uFEFF" + text.replaceAll("\n", "\r\n") : text,
    );
  };
  mkdirSync(join(f.checkout, dirname(to)), { recursive: true });
  mkdirSync(join(f.checkout, empty), { recursive: true });
  put("src/move/helper.util.ts", "export function helper() { return 4; }");
  put(
    source,
    'import { helper } from "../helper.util.js";\nexport function calculateTotal() { return helper(); }',
    true,
  );
  put(
    nested,
    'import { calculateTotal } from "../calculateTotal.util.js";\nexport function calculateDouble() { return calculateTotal() * 2; }',
  );
  put(
    consumer,
    `import { calculateTotal } from ${JSON.stringify("./" + posix.relative(posix.dirname(consumer), source).replace(/\.ts$/, ".js"))};\nexport function useTotal() { return calculateTotal(); }`,
  );
  return {
    ...f,
    from,
    to,
    source,
    nested,
    consumer,
    empty,
    movePolicy,
    command: () =>
      planCommand([
        {
          kind: "move",
          from,
          to,
          expectedVersion: f.ports.directoryVersion(from),
        },
      ]),
  };
}
