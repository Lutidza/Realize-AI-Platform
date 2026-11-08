/**
 * @file .ai/tools/engineering/test/projectArtifactBinding.test.ts
 * @version 1.0.0
 * @date 2026-10-26
 * @description Проверяет native metadata, inherited owner guards и честное покрытие preflight checks.
 * @see documentation/architecture/engineering-artifacts.md
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createProjectArtifactBinding,
  ProjectArtifactError,
  renderAiTemplate,
  renderSourceTemplate,
} from "../src/projectEngineering.index.ts";
import type {
  ProjectArtifactBindingOptions,
  ProjectFolderPolicy,
} from "../src/projectEngineering.index.ts";
import { BASE_AI_TEMPLATE } from "../src/projectArtifactProfiles.config.ts";

const policySource =
  ".ai/tools/engineering/src/projectArtifactProfiles.config.ts";
const sourcePath = ".ai/tools/engineering/src/nested/calculateTotal.util.ts";
const templatePath = ".ai/templates/engineering/TEMPLATE-ARTIFACT-REVIEW.md";
const readReference = (path: string) => readFileSync(path);
const toBytes = (source: string) => new TextEncoder().encode(source);
const toText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const code = (expected: string) => (error: unknown) =>
  error instanceof ProjectArtifactError && error.code === expected;

function policies(): ProjectFolderPolicy[] {
  return [
    {
      id: "engineering-source",
      version: "1",
      root: ".ai/tools/engineering/src",
      ownerRef: "engineering",
      purpose: "Инструмент инженерных операций",
      boundary: "owner",
      allowedKinds: ["source.util"],
      allowedProvenance: ["authored"],
      sourcePaths: [policySource],
    },
    {
      id: "ai-templates",
      version: "1",
      root: ".ai/templates",
      ownerRef: "ai-operating-layer",
      purpose: "Шаблоны материалов рабочего слоя",
      boundary: "owner",
      allowedKinds: ["ai.template"],
      allowedProvenance: ["authored"],
      sourcePaths: [policySource],
    },
  ];
}
function binding(overrides: Partial<ProjectArtifactBindingOptions> = {}) {
  return createProjectArtifactBinding({
    folderPolicies: policies(),
    readReference,
    ...overrides,
  });
}
function source(path = sourcePath) {
  return renderSourceTemplate({
    path,
    descriptionRu: "Вычисляет сумму значений.",
    createdOn: "2026-10-26",
    body: "export function calculateTotal(values: number[]): number { return values.reduce((sum, value) => sum + value, 0); }",
    seeRefs: ["documentation/architecture/engineering-artifacts.md"],
  });
}
function template(
  path = templatePath,
  body = "Проверь назначение и ограничения артефакта.",
) {
  return renderAiTemplate({
    path,
    templateId: path.split("/").at(-1)!.replace(/\.md$/, ""),
    titleRu: "Проверка артефакта",
    purposeRu: "Фиксирует сведения для проверки готового артефакта.",
    usageRu: "Заполни разделы текущими сведениями задачи.",
    sections: [{ headingRu: "Критерии", body }],
    relatedArtifacts: [],
  });
}

test("source profile validates native header, syntax and naming with frozen evidence", () => {
  const resolved = binding().resolveFile({
    path: sourcePath,
    artifactKind: "source.util",
    content: source(),
  });
  assert.equal(resolved.ownerRef, "engineering");
  assert.equal(resolved.provenance, "authored");
  assert.equal(resolved.metadataProfileRef.id, "source.tsdoc");
  assert.ok(resolved.validatedChecks.includes("source.header"));
  assert.ok(resolved.validatedChecks.includes("source.syntax"));
  assert.ok(
    resolved.readPaths.includes(
      ".ai/tools/source-headers/src/validateSourceHeader.validator.ts",
    ),
  );
  assert.ok(
    resolved.readPaths.includes(
      "documentation/architecture/engineering-artifacts.md",
    ),
  );
  assert.deepEqual(source(), source());
  assert.ok(!toText(source()).includes("artifact_id"));
});

test("template profile emits native template metadata without active instruction IDs", () => {
  const content = template();
  const text = toText(content);
  assert.match(text, /template_id: TEMPLATE-ARTIFACT-REVIEW/);
  assert.match(text, /template_type: ai-runtime-markdown-template/);
  assert.doesNotMatch(text, /(?:artifact_id|rule_id|check_id|status):/);
  const resolved = binding().resolveFile({
    path: templatePath,
    artifactKind: "ai.template",
    content,
  });
  assert.ok(resolved.validatedChecks.includes("template.metadata"));
  assert.ok(resolved.validatedChecks.includes("template.local-links"));
  assert.ok(resolved.readPaths.includes(BASE_AI_TEMPLATE));
  assert.ok(!resolved.requiredCheckRefs.includes("ai:quality:structure"));
  assert.deepEqual(template(), content);
});

test("all physical ancestors constrain placement without explicit inheritsFrom", () => {
  const configured = policies();
  configured[0].excludedPaths = [".ai/tools/engineering/src/private"];
  configured[0].requiredCheckRefs = ["project.typecheck"];
  configured.push({
    id: "private-child",
    version: "1",
    root: ".ai/tools/engineering/src/private",
    ownerRef: "engineering",
    purpose: "Вложенная область",
    boundary: "feature",
    allowedKinds: ["source.util", "ai.template"],
    allowedProvenance: ["authored"],
    excludedPaths: [],
    requiredCheckRefs: [],
    sourcePaths: [policySource],
  });
  const resolver = binding({ folderPolicies: configured });
  const privatePath =
    ".ai/tools/engineering/src/private/calculateTotal.util.ts";
  assert.throws(
    () =>
      resolver.resolveFile({
        path: privatePath,
        artifactKind: "source.util",
        content: source(privatePath),
      }),
    code("UNSUPPORTED"),
  );
  configured[0].excludedPaths = [];
  const allowed = binding({ folderPolicies: configured }).resolveFile({
    path: privatePath,
    artifactKind: "source.util",
    content: source(privatePath),
  });
  assert.ok(allowed.requiredCheckRefs.includes("project.typecheck"));
  assert.ok(!allowed.validatedChecks.includes("project.typecheck"));
  assert.throws(
    () =>
      binding({ folderPolicies: configured }).resolveFile({
        path: privatePath,
        artifactKind: "ai.template",
        content: template(),
      }),
    code("UNSUPPORTED"),
  );
  configured[2].allowedKinds = [];
  assert.throws(
    () =>
      binding({ folderPolicies: configured }).resolveFile({
        path: privatePath,
        artifactKind: "source.util",
        content: source(privatePath),
      }),
    code("UNSUPPORTED"),
  );
});

test("policy registry rejects duplicates, orphan inheritance and implicit owner changes", () => {
  const base = policies()[0];
  assert.throws(
    () => binding({ folderPolicies: [base, { ...base, id: "other" }] }),
    code("CONFLICT"),
  );
  assert.throws(
    () => binding({ folderPolicies: [{ ...base, inheritsFrom: ["missing"] }] }),
    code("CONFLICT"),
  );
  assert.throws(
    () => binding({ folderPolicies: [{ ...base, allowedKinds: undefined }] }),
    code("INVALID_INPUT"),
  );
  assert.throws(
    () =>
      binding({
        folderPolicies: [
          {
            ...base,
            entrypointPolicy: "required-index",
          } as ProjectFolderPolicy,
        ],
      }),
    code("UNSUPPORTED"),
  );
  const child = {
    ...base,
    id: "child",
    root: `${base.root}/nested`,
    ownerRef: "foreign",
    boundary: "feature" as const,
  };
  assert.throws(
    () => binding({ folderPolicies: [base, child] }),
    code("CONFLICT"),
  );
  assert.throws(
    () =>
      binding({
        folderPolicies: [
          base,
          { ...child, ownerRef: base.ownerRef, inheritsFrom: ["ai-templates"] },
          policies()[1],
        ],
      }),
    code("CONFLICT"),
  );
});

test("unknown kinds, generated provenance and missing relationship resolvers fail closed", () => {
  assert.throws(
    () =>
      binding().resolveFile({
        path: sourcePath,
        artifactKind: "generic-file",
        content: source(),
      }),
    code("UNSUPPORTED"),
  );
  assert.throws(
    () =>
      binding().resolveFile({
        path: ".ai/rules/example/RULE-EXAMPLE.md",
        artifactKind: "ai.rule",
        content: template(),
      }),
    code("UNSUPPORTED"),
  );
  for (const update of [
    { allowedProvenance: ["generated"] as const },
    { relationshipRules: ["public-exports"] },
    { boundary: "generated" as const },
  ]) {
    assert.throws(
      () =>
        binding({
          folderPolicies: [{ ...policies()[0], ...update }],
        }).resolveFile({
          path: sourcePath,
          artifactKind: "source.util",
          content: source(),
        }),
      code("UNSUPPORTED"),
    );
  }
});

test("hard exclusions remain effective even under an explicit broad owner", () => {
  const base = policies()[0];
  const resolver = binding({ folderPolicies: [{ ...base, root: "src" }] });
  for (const path of [
    "src/payload-types.ts",
    "src/app/(payload)/admin/importMap.js",
    "src/RealizeCore/a.util.ts",
    "src/.env",
    "src/node_modules/a.util.ts",
    "src/.git/config",
    "src/../other/a.util.ts",
    "src//a.util.ts",
  ]) {
    assert.throws(() =>
      resolver.resolveFile({
        path,
        artifactKind: "source.util",
        content: toBytes("data"),
      }),
    );
  }
});

test("nested folders require descendant content and exact effective folderPolicyId", () => {
  const resolver = binding();
  const input = {
    path: ".ai/tools/engineering/src/nested",
    purpose: "Вычисления текущего feature",
    folderPolicyId: "engineering-source",
    plannedFilePaths: [sourcePath],
  };
  assert.equal(resolver.resolveDirectory(input).ownerRef, "engineering");
  assert.deepEqual(resolver.resolveDirectory(input).validatedChecks, [
    "folder.placement",
  ]);
  assert.throws(
    () => resolver.resolveDirectory({ ...input, plannedFilePaths: [] }),
    code("UNSUPPORTED"),
  );
  assert.throws(
    () =>
      resolver.resolveDirectory({ ...input, folderPolicyId: "ai-templates" }),
    code("CONFLICT"),
  );
  assert.throws(
    () => resolver.resolveDirectory({ ...input, purpose: " " }),
    code("INVALID_INPUT"),
  );
});

test("invalid headers, syntax and template metadata cannot be disguised by kind", () => {
  const resolver = binding();
  const valid = toText(source());
  for (const text of [
    valid.replace("@file", "@filename"),
    valid.replace("2026-10-26", "2026-02-30"),
    valid.replace("values.reduce", "values.??reduce"),
    valid.replaceAll("calculateTotal", "calculateOther"),
  ]) {
    assert.throws(
      () =>
        resolver.resolveFile({
          path: sourcePath,
          artifactKind: "source.util",
          content: toBytes(text),
        }),
      code("INVALID_INPUT"),
    );
  }
  const native = toText(template());
  for (const text of [
    native.replace("template_id:", "artifact_id:"),
    native.replace("template_type:", "status:"),
    native.replace(
      "owner_layer: .ai/templates/engineering/",
      "owner_layer: .ai/rules/",
    ),
    native.replace(
      "## Назначение\n\nФиксирует сведения для проверки готового артефакта.",
      "## Назначение",
    ),
    native.replace("template_id:", "template_id: BAD\ntemplate_id:"),
  ]) {
    assert.throws(
      () =>
        resolver.resolveFile({
          path: templatePath,
          artifactKind: "ai.template",
          content: toBytes(text),
        }),
      code("INVALID_INPUT"),
    );
  }
  assert.throws(
    () =>
      template(templatePath, "```yaml\nentries:\n  - entry_id: invented\n```"),
    code("UNSUPPORTED"),
  );
});

test("reference existence, anchors, budgets and declared inventory are checked", () => {
  const withLink = template(
    templatePath,
    "Проверь [шаблон](../markdown/TEMPLATE-AI-RUNTIME-MARKDOWN.md#purpose).",
  );
  assert.throws(
    () =>
      binding().resolveFile({
        path: templatePath,
        artifactKind: "ai.template",
        content: withLink,
      }),
    code("INVALID_INPUT"),
  );
  const missing = template(templatePath, "Проверь [источник](../missing.md).");
  assert.throws(
    () =>
      binding().resolveFile({
        path: templatePath,
        artifactKind: "ai.template",
        content: missing,
      }),
    code("UNSUPPORTED"),
  );
  assert.throws(
    () =>
      binding({
        readReference: () => new Uint8Array(256 * 1024 + 1),
      }).resolveFile({
        path: sourcePath,
        artifactKind: "source.util",
        content: source(),
      }),
    code("LIMIT_EXCEEDED"),
  );
  assert.throws(
    () =>
      binding({
        templateIds: [
          {
            id: "TEMPLATE-ARTIFACT-REVIEW",
            path: ".ai/templates/other/TEMPLATE-ARTIFACT-REVIEW.md",
          },
        ],
      }).resolveFile({
        path: templatePath,
        artifactKind: "ai.template",
        content: template(),
      }),
    code("CONFLICT"),
  );
});

test("definitionHash captures immutable configuration and caller mutation cannot broaden scope", () => {
  const configured = policies();
  const first = binding({ folderPolicies: configured });
  assert.equal(
    first.definitionHash,
    binding({ folderPolicies: policies() }).definitionHash,
  );
  configured[0].excludedPaths = [".ai/tools/engineering/src/nested"];
  assert.notEqual(
    first.definitionHash,
    binding({ folderPolicies: configured }).definitionHash,
  );
  assert.equal(
    first.resolveFile({
      path: sourcePath,
      artifactKind: "source.util",
      content: source(),
    }).kindId,
    "source.util",
  );
  assert.ok(Object.isFrozen(first));
});

test("renderers reject injection, empty scaffolds and invalid dates", () => {
  const input = {
    path: sourcePath,
    descriptionRu: "Описание",
    createdOn: "2026-10-26",
    body: "export const calculateTotal = () => 1;",
  };
  assert.throws(
    () =>
      renderSourceTemplate({ ...input, descriptionRu: "Описание */\ncode" }),
    code("INVALID_INPUT"),
  );
  assert.throws(
    () => renderSourceTemplate({ ...input, body: "" }),
    code("INVALID_INPUT"),
  );
  assert.throws(
    () => renderSourceTemplate({ ...input, createdOn: "2026-02-30" }),
    code("INVALID_INPUT"),
  );
  assert.throws(
    () =>
      renderSourceTemplate({
        ...input,
        body: "/** @file duplicate */\nexport const calculateTotal = () => 1;",
      }),
    code("INVALID_INPUT"),
  );
});
