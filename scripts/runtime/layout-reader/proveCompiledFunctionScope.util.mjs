/**
 * @file scripts/runtime/layout-reader/proveCompiledFunctionScope.util.mjs
 * @version 1.0.0
 * @date 2026-11-21
 * @description Доказывает тождество free bindings перед наблюдением inlined compiled function в factory scope.
 * @see documentation/reports/2026-11-21-layout-reader-delivery-rollback-audit.md
 */
import { createRequire } from "node:module";
import { sha256 } from "./readLayoutReaderArtifact.adapter.mjs";

const { analyze } = createRequire(import.meta.url)("eslint-scope");
const approvedGlobals = new Set([
  "Object",
  "Array",
  "JSON",
  "Date",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Number",
  "Math",
  "String",
  "Boolean",
  "Buffer",
  "structuredClone",
  "Error",
  "RegExp",
  "undefined",
]);
const inlineContracts = [
  [
    "desiredAssignment",
    "expectedCatalogHash",
    "PLAN_EXPIRED",
    "REPLAY_CONFLICT",
  ],
  ["desiredAssignment", "PLAN_NOT_FOUND", "PLAN_HASH_MISMATCH"],
  ["templateBinding", "expectedPolicyHash", "PLAN_EXPIRED", "REPLAY_CONFLICT"],
  ["desiredMode", "PLAN_NOT_FOUND", "PLAN_HASH_MISMATCH"],
  [
    "availability",
    "compiled",
    "runtimeBuildId",
    "settingsSchema",
    "layoutCatalog",
  ],
];

/** Только normal FunctionExpression: запрещённые lexical/meta constructs и intermediate bindings fail closed. */
export function proveCompiledInlineFunctions(
  ast,
  factoryNode,
  originalFactory,
  effectiveStrict,
) {
  const manager = analyze(ast, {
    ecmaVersion: 2022,
    sourceType: "script",
    optimistic: false,
    ignoreEval: false,
    impliedStrict: effectiveStrict,
  });
  const factoryScope = manager.acquire(factoryNode);
  if (!factoryScope)
    throw new Error("Factory lexical scope cannot be established.");
  const stack = [factoryNode.body];
  const found = [];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "FunctionExpression" && !node.async && !node.generator) {
      const source = originalFactory.slice(node.start - 1, node.end - 1);
      if (
        source.startsWith("function") &&
        inlineContracts.some((tokens) =>
          tokens.every((token) => source.includes(token)),
        )
      ) {
        const scope = manager.acquire(node);
        const bindings = [];
        let valid = Boolean(scope);
        const ownStrict = node.body.body.some(
          (statement, index, array) =>
            statement.directive === "use strict" &&
            array
              .slice(0, index)
              .every((prior) => typeof prior.directive === "string"),
        );
        const targetStrict = factoryScope.isStrict || ownStrict;
        if (scope?.isStrict !== targetStrict) valid = false;
        for (const reference of scope?.through ?? []) {
          const name = reference.identifier.name;
          if (reference.resolved?.scope === factoryScope)
            bindings.push({
              name,
              kind: "factory-binding",
              definitionOffsetsUtf16: reference.resolved.identifiers.map(
                (id) => id.start - 1,
              ),
            });
          else if (!reference.resolved && approvedGlobals.has(name))
            bindings.push({ name, kind: "approved-global" });
          else valid = false;
        }
        const bodyStack = [node.body, ...node.params];
        while (bodyStack.length) {
          const inner = bodyStack.pop();
          if (!inner || typeof inner !== "object") continue;
          if (
            ["ThisExpression", "Super", "MetaProperty"].includes(inner.type) ||
            (inner.type === "Identifier" &&
              ["arguments", "eval"].includes(inner.name))
          )
            valid = false;
          for (const value of Object.values(inner)) {
            if (Array.isArray(value))
              bodyStack.push(
                ...value.filter((item) => item && typeof item === "object"),
              );
            else if (value && typeof value === "object") bodyStack.push(value);
          }
        }
        if (valid)
          found.push({
            name: `__inline_${node.start - 1}`,
            source,
            startOffsetUtf16: node.start - 1,
            endOffsetUtf16: node.end - 1,
            sourceHash: sha256(source),
            proof: {
              engine: "eslint-scope",
              rule: "all-free-references-factory-or-approved-global",
              originalEffectiveStrict: scope.isStrict,
              targetEffectiveStrict: targetStrict,
              factoryEffectiveStrict: factoryScope.isStrict,
              bindings,
            },
          });
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value))
        stack.push(...value.filter((item) => item && typeof item === "object"));
      else if (value && typeof value === "object") stack.push(value);
    }
  }
  return found;
}
