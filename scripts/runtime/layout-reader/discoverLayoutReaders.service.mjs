/**
 * @file scripts/runtime/layout-reader/discoverLayoutReaders.service.mjs
 * @version 1.0.0
 * @date 2026-11-21
 * @description Находит только однозначные compiled exports по структуре и поведению fixture-контрактов.
 * @see documentation/reports/2026-11-21-layout-reader-delivery-rollback-audit.md
 */
import { sha256 } from "./readLayoutReaderArtifact.adapter.mjs";

const signatureTokens = [
  "desiredAssignment",
  "manifestHash",
  "templateBinding",
  "layoutCatalog",
  "LAYOUT_BINDING_WRITES_DISABLED",
  "INVALID_STORE",
  "PLAN_HASH_MISMATCH",
  "expectedCatalogHash",
  "invalid_assignment",
  "nativeVersion",
  "panelWidth",
  "getOwnPropertyDescriptors",
];

/** Никаких enumerate-and-execute: исполняются только factory с известным контрактным словарём. */
export function collectLayoutReaderExports(loader) {
  const values = [];
  const failures = [];
  for (const factory of loader.factories.values()) {
    if (!signatureTokens.some((token) => factory.source.includes(token)))
      continue;
    try {
      const groups = [
        { mode: "direct-export", values: loader.exportsFor(factory) },
        { mode: "lexical-observation", values: loader.capturesFor(factory) },
      ];
      for (const group of groups) {
        loader.bind("candidateExports", group.values);
        const keys = loader.evaluate("Object.keys(__probe.candidateExports)");
        for (const key of keys) {
          loader.bind("candidateKey", key);
          const value = loader.evaluate(
            "__probe.candidateExports[__probe.candidateKey]",
          );
          if (values.some((candidate) => candidate.value === value)) continue;
          loader.bind("candidateValue", value);
          const type = loader.evaluate("typeof __probe.candidateValue");
          if (type !== "object" && type !== "function") continue;
          const source =
            type === "function"
              ? loader.evaluate(
                  "Function.prototype.toString.call(__probe.candidateValue)",
                )
              : "";
          const inline = factory.inlineFunctions?.find(
            (entry) => entry.name === key,
          );
          values.push({
            value,
            key,
            factory,
            type,
            source,
            mode: inline ? "scope-proven-inline-function" : group.mode,
            inline,
          });
        }
      }
    } catch (error) {
      failures.push({
        path: factory.path,
        factoryHash: factory.hash,
        reason: String(error.message).slice(0, 180),
      });
    }
  }
  return { values, failures };
}

/** Два различных compiled exports с одинаковой сигнатурой считаются неоднозначностью, не случайным выбором. */
export function findCompiledSchema(
  loader,
  candidates,
  name,
  keys,
  positive,
  negative,
) {
  loader.setJSON("schemaPositive", positive);
  loader.setJSON("schemaNegative", negative);
  loader.setJSON("schemaKeys", keys);
  const matched = candidates.values.filter((candidate) => {
    if (candidate.type !== "object" || !candidate.value) return false;
    loader.bind("candidateValue", candidate.value);
    try {
      return loader.evaluate(`(() => {
        const s = __probe.candidateValue;
        if (typeof s.safeParse !== "function") return false;
        if (__probe.schemaKeys.length && (!s.shape || !__probe.schemaKeys.every(k => Object.hasOwn(s.shape, k)))) return false;
        return __probe.schemaPositive.every(v => s.safeParse(v).success) && __probe.schemaNegative.every(v => !s.safeParse(v).success);
      })()`);
    } catch {
      return false;
    }
  });
  return unique(loader, name, matched);
}

export function findCompiledFunction(
  loader,
  candidates,
  name,
  { all = [], any = [], exclude = [] },
) {
  const matched = candidates.values.filter(
    ({ type, source }) =>
      type === "function" &&
      !/^class\b/.test(source) &&
      all.every((token) => source.includes(token)) &&
      (!any.length || any.some((token) => source.includes(token))) &&
      !exclude.some((token) => source.includes(token)),
  );
  return unique(loader, name, matched);
}

export function findCompiledBehaviorFunction(
  loader,
  candidates,
  name,
  tokens,
  expression,
) {
  const matched = candidates.values.filter((candidate) => {
    if (
      candidate.type !== "function" ||
      /^async\b/.test(candidate.source) ||
      !tokens.every((token) => candidate.source.includes(token))
    )
      return false;
    loader.bind("candidateFunction", candidate.value);
    try {
      return loader.evaluate(expression) === true;
    } catch {
      return false;
    }
  });
  return unique(loader, name, matched);
}

function unique(loader, name, matched) {
  if (matched.length !== 1)
    throw new Error(
      `${loader.side} ${name}: expected one compiled export, found ${matched.length}`,
    );
  const candidate = matched[0];
  loader.bind(name, candidate.value);
  return {
    name,
    access: candidate.mode,
    ...(candidate.inline
      ? {
          inlineFunction: {
            startOffsetUtf16: candidate.inline.startOffsetUtf16,
            endOffsetUtf16: candidate.inline.endOffsetUtf16,
            sourceHash: candidate.inline.sourceHash,
            proof: candidate.inline.proof,
          },
          observation: candidate.factory.observation,
        }
      : {}),
    ...(candidate.mode === "lexical-observation"
      ? {
          lexicalName: candidate.key,
          observation: candidate.factory.observation,
        }
      : {}),
    ...(candidate.type === "function"
      ? { compiledFunctionSourceHash: sha256(candidate.source) }
      : {}),
    exportKey: candidate.key,
    path: candidate.factory.path,
    factoryHash: candidate.factory.hash,
    chunkHash: candidate.factory.chunkHash,
  };
}
