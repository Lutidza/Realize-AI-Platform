/**
 * @file packages/ai-contracts/src/parsePageArtifactCatalog.validator.ts
 * @version 1.1.0
 * @date 2026-09-13
 * @description Проверяет ограниченный каталог зарегистрированных описаний Pages и блоков.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type {
  PageArtifactCatalogDTO,
  PageArtifactDefinitionDTO,
} from "./PageKnowledge.types";
import { pageDraftTextValidation as check } from "./pageDraftTextValidation.validator";
import { ContractValidationError, parseIdentifier } from "./validation";

const requiredText = (value: unknown, name: string, limit: number): string => {
  const result = check.text(value, name, limit);
  if (!result.trim()) throw new ContractValidationError(`${name} is empty.`);
  return result;
};

const sourcePath = (value: unknown): string => {
  const path = requiredText(value, "artifact source path", 256);
  if (
    !/^src\/(?:[A-Za-z0-9_()[\].-]+\/)*[A-Za-z0-9_[\].-]+\.(?:tsx?|md)$/.test(
      path,
    ) ||
    path.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new ContractValidationError(
      "artifact source must be a safe project src path.",
    );
  }
  return path;
};

const sourceExport = (value: unknown) => {
  const source = check.object(value, ["path", "exportName"], "artifact source");
  if (
    typeof source.exportName !== "string" ||
    !/^[A-Za-z_$][\w$]{0,127}$/.test(source.exportName)
  ) {
    throw new ContractValidationError("artifact export name is invalid.");
  }
  return { path: sourcePath(source.path), exportName: source.exportName };
};

const schemaPath = (value: unknown): string => {
  const path = requiredText(value, "schema field path", 256);
  if (
    !/^\/(?:[A-Za-z][A-Za-z0-9_]*|\*)(?:\/(?:[A-Za-z][A-Za-z0-9_]*|\*))*$/.test(
      path,
    ) ||
    path
      .split("/")
      .some((part) => ["__proto__", "prototype", "constructor"].includes(part))
  ) {
    throw new ContractValidationError("schema field path is invalid.");
  }
  return path;
};

const parseDefinition = (value: unknown): PageArtifactDefinitionDTO => {
  const input = check.object(
    value,
    [
      "id",
      "version",
      "kind",
      "title",
      "description",
      "schema",
      "renderer",
      "guide",
      "supportedOperations",
      "fields",
    ],
    "artifact definition",
  );
  if (
    typeof input.id !== "string" ||
    !["pages", "blocks.content", "blocks.formBlock"].includes(input.id) ||
    typeof input.version !== "string" ||
    !["1.0", "1.1"].includes(input.version) ||
    input.kind !== (input.id === "pages" ? "collection" : "block")
  ) {
    throw new ContractValidationError(
      "artifact definition identity or version is unsupported.",
    );
  }
  const guide = check.object(
    input.guide,
    ["source", "version", "instructions"],
    "artifact guide",
  );
  if (
    typeof guide.version !== "string" ||
    !["1.0", "1.1"].includes(guide.version) ||
    !Array.isArray(guide.instructions) ||
    guide.instructions.length < 1 ||
    guide.instructions.length > 8
  ) {
    throw new ContractValidationError(
      "artifact guide requires a supported version and 1 to 8 instructions.",
    );
  }
  if (
    !Array.isArray(input.supportedOperations) ||
    input.supportedOperations.length > 8
  ) {
    throw new ContractValidationError(
      "artifact operation references exceed their limit.",
    );
  }
  const operations = new Set<string>();
  const supportedOperations = input.supportedOperations.map((value) => {
    const operation = check.object(
      value,
      ["id", "version"],
      "artifact operation",
    );
    if (
      typeof operation.id !== "string" ||
      !/^[A-Za-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*$/.test(operation.id) ||
      operation.id.length > 128 ||
      typeof operation.version !== "string" ||
      !/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(operation.version) ||
      operations.has(operation.id)
    ) {
      throw new ContractValidationError(
        "artifact operation reference is invalid or duplicated.",
      );
    }
    operations.add(operation.id);
    return { id: operation.id, version: operation.version };
  });
  if (!Array.isArray(input.fields) || input.fields.length > 64) {
    throw new ContractValidationError(
      "artifact definition must not exceed 64 schema fields.",
    );
  }
  const paths = new Set<string>();
  const fields = input.fields.map((value) => {
    const field = check.object(
      value,
      ["path", "type", "required", "relationTo"],
      "artifact field",
    );
    const path = schemaPath(field.path);
    if (paths.has(path) || typeof field.required !== "boolean") {
      throw new ContractValidationError(
        "artifact field is duplicated or has an invalid requirement.",
      );
    }
    paths.add(path);
    const type = parseIdentifier(field.type, "artifact field type");
    let relationTo: string[] | undefined;
    if (field.relationTo !== undefined) {
      if (
        !Array.isArray(field.relationTo) ||
        field.relationTo.length < 1 ||
        field.relationTo.length > 8
      ) {
        throw new ContractValidationError(
          "artifact field relationships exceed their limit.",
        );
      }
      relationTo = field.relationTo.map((value) =>
        parseIdentifier(value, "artifact collection"),
      );
      if (new Set(relationTo).size !== relationTo.length) {
        throw new ContractValidationError(
          "artifact field relationship is duplicated.",
        );
      }
    }
    return {
      path,
      type,
      required: field.required,
      ...(relationTo ? { relationTo } : {}),
    };
  });
  return {
    id: input.id,
    version: input.version,
    kind: input.id === "pages" ? "collection" : "block",
    title: requiredText(input.title, "artifact title", 160),
    description: requiredText(input.description, "artifact description", 1_000),
    schema: sourceExport(input.schema),
    renderer: sourceExport(input.renderer),
    guide: {
      source: sourcePath(guide.source),
      version: guide.version,
      instructions: guide.instructions.map((value) =>
        requiredText(value, "artifact instruction", 1_000),
      ),
    },
    supportedOperations,
    fields,
  };
};

/** Проверяет каталог без обращения к registry; совпадение исполняемых операций проверяет сервер. */
export const parsePageArtifactCatalog = (
  value: unknown,
): PageArtifactCatalogDTO => {
  const input = check.object(
    value,
    ["version", "hash", "definitions"],
    "page artifact catalog",
  );
  if (
    input.version !== "1.0" ||
    !Array.isArray(input.definitions) ||
    input.definitions.length < 1 ||
    input.definitions.length > 3
  ) {
    throw new ContractValidationError(
      "page catalog requires version 1.0 and 1 to 3 definitions.",
    );
  }
  const definitions = input.definitions.map(parseDefinition);
  if (
    new Set(definitions.map((definition) => definition.id)).size !==
      definitions.length ||
    !definitions.some((definition) => definition.id === "pages")
  ) {
    throw new ContractValidationError(
      "page catalog requires unique definitions including pages.",
    );
  }
  const result: PageArtifactCatalogDTO = {
    version: "1.0",
    hash: check.hash(input.hash),
    definitions,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 32 * 1024) {
    throw new ContractValidationError("page catalog must not exceed 32 KiB.");
  }
  return result;
};
