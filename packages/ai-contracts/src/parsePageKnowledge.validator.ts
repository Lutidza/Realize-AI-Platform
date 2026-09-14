/**
 * @file packages/ai-contracts/src/parsePageKnowledge.validator.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет структуру страницы, ссылки и привязку знаний к точной ревизии.
 * @see documentation/specifications/realize-ai-commerce/v1.0/03-runtime-delivery-and-security/22-api-and-streaming-contracts.md
 */
import type {
  PageBlockOutlineDTO,
  PageKnowledgeDTO,
  PageOutlineDTO,
  PageStructureContextDTO,
} from "./PageKnowledge.types";
import { parsePageArtifactCatalog } from "./parsePageArtifactCatalog.validator";
import { pageDraftTextValidation as check } from "./pageDraftTextValidation.validator";
import { ContractValidationError, parseIdentifier } from "./validation";

const integer = (value: unknown, name: string, maximum = 10_000): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new ContractValidationError(
      `${name} must be an integer between 0 and ${maximum}.`,
    );
  }
  return value;
};

const parseBlock = (value: unknown, index: number): PageBlockOutlineDTO => {
  const input = check.object(
    value,
    [
      "id",
      "identity",
      "index",
      "path",
      "blockType",
      "definitionID",
      "settings",
      "references",
    ],
    "page block",
  );
  const blockType = parseIdentifier(input.blockType, "block type");
  const definitionID =
    blockType === "content"
      ? "blocks.content"
      : blockType === "formBlock"
        ? "blocks.formBlock"
        : null;
  const id = input.id === null ? null : parseIdentifier(input.id, "block id");
  if (
    input.index !== index ||
    input.path !== `/layout/${index}` ||
    input.definitionID !== definitionID ||
    (id === null
      ? input.identity !== "missing"
      : input.identity !== "stable" && input.identity !== "duplicate")
  ) {
    throw new ContractValidationError(
      "page block identity, definition or position is inconsistent.",
    );
  }
  if (!Array.isArray(input.settings) || input.settings.length > 2) {
    throw new ContractValidationError(
      "page block settings exceed their limit.",
    );
  }
  const settingPaths = new Set<string>();
  const settings = input.settings.map((value) => {
    const setting = check.object(
      value,
      ["path", "value"],
      "page block setting",
    );
    const path = check.text(setting.path, "setting path", 64);
    if (
      settingPaths.has(path) ||
      !(
        (blockType === "content" && path === "/columns/count") ||
        (blockType === "formBlock" &&
          ["/enableIntro", "/introContent/present"].includes(path))
      )
    ) {
      throw new ContractValidationError(
        "page block setting path is unsupported or duplicated.",
      );
    }
    settingPaths.add(path);
    if (blockType === "content")
      return { path, value: integer(setting.value, "column count") };
    if (typeof setting.value !== "boolean") {
      throw new ContractValidationError("form block setting must be boolean.");
    }
    return { path, value: setting.value };
  });
  if (
    !Array.isArray(input.references) ||
    input.references.length > (blockType === "formBlock" ? 1 : 0)
  ) {
    throw new ContractValidationError(
      "page block references are unsupported or duplicated.",
    );
  }
  const references: PageBlockOutlineDTO["references"] = input.references.map(
    (value) => {
      const reference = check.object(
        value,
        ["field", "collection", "id", "access"],
        "page block reference",
      );
      if (
        reference.field !== "form" ||
        reference.collection !== "forms" ||
        (reference.access !== "readable" && reference.access !== "unavailable")
      ) {
        throw new ContractValidationError(
          "page form reference is unsupported or unresolved.",
        );
      }
      const id =
        reference.id === null ? null : parseIdentifier(reference.id, "form id");
      if (reference.access === "readable" ? id === null : id !== null) {
        throw new ContractValidationError(
          "form reference id does not match its access state.",
        );
      }
      return {
        field: "form",
        collection: "forms",
        id,
        access: reference.access as "readable" | "unavailable",
      };
    },
  );
  return {
    id,
    identity:
      id === null ? "missing" : (input.identity as "stable" | "duplicate"),
    index,
    path: `/layout/${index}`,
    blockType,
    definitionID,
    settings,
    references,
  };
};

const parseOutline = (value: unknown): PageOutlineDTO => {
  const input = check.object(
    value,
    ["offset", "limit", "totalBlocks", "nextOffset", "blocks"],
    "page outline",
  );
  const totalBlocks = integer(input.totalBlocks, "total block count");
  const offset = integer(input.offset, "block offset");
  if (
    input.limit !== 32 ||
    !Array.isArray(input.blocks) ||
    input.blocks.length > 32 ||
    offset > totalBlocks ||
    offset % 32 !== 0
  ) {
    throw new ContractValidationError(
      "page outline requires a valid offset and a limit of 32 blocks.",
    );
  }
  const count = Math.min(32, totalBlocks - offset);
  const nextOffset = offset + count < totalBlocks ? offset + count : null;
  if (
    input.blocks.length !== count ||
    input.nextOffset !== nextOffset ||
    (offset > 0 && offset === totalBlocks)
  ) {
    throw new ContractValidationError(
      "page outline is incomplete or its continuation is inconsistent.",
    );
  }
  const blocks = input.blocks.map((value, position) =>
    parseBlock(value, offset + position),
  );
  const identities = new Map<string, PageBlockOutlineDTO["identity"]>();
  for (const block of blocks) {
    if (block.id === null) continue;
    const previous = identities.get(block.id);
    // Второй экземпляр может лежать вне порции; duplicate одиночно тоже допустим.
    if (
      previous &&
      (previous !== "duplicate" || block.identity !== "duplicate")
    ) {
      throw new ContractValidationError(
        "repeated block ids must all be marked as duplicate.",
      );
    }
    identities.set(block.id, block.identity);
  }
  return { offset, limit: 32, totalBlocks, nextOffset, blocks };
};

/** Принимает только конечный DTO после серверной проверки доступа к связанным формам. */
export const parsePageKnowledge = (value: unknown): PageKnowledgeDTO => {
  const input = check.object(
    value,
    [
      "version",
      "pageID",
      "fingerprint",
      "catalogHash",
      "definitions",
      "outline",
    ],
    "page knowledge",
  );
  if (input.version !== "1.0")
    throw new ContractValidationError("page knowledge version is unsupported.");
  const catalog = parsePageArtifactCatalog({
    version: "1.0",
    hash: input.catalogHash,
    definitions: input.definitions,
  });
  const outline = parseOutline(input.outline);
  const requiredDefinitions = new Set([
    "pages",
    ...outline.blocks.flatMap((block) =>
      block.definitionID ? [block.definitionID] : [],
    ),
  ]);
  if (
    catalog.definitions.length !== requiredDefinitions.size ||
    catalog.definitions.some(
      (definition) => !requiredDefinitions.has(definition.id),
    )
  ) {
    throw new ContractValidationError(
      "page knowledge definitions must match the current outline portion.",
    );
  }
  const result: PageKnowledgeDTO = {
    version: "1.0",
    pageID: parseIdentifier(input.pageID, "page id"),
    fingerprint: check.hash(input.fingerprint),
    catalogHash: catalog.hash,
    definitions: catalog.definitions,
    outline,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 48 * 1024) {
    throw new ContractValidationError("page knowledge must not exceed 48 KiB.");
  }
  return result;
};

/** Чтение структуры имеет собственный лимит и не зависит от числа текстовых полей страницы. */
export const parsePageStructureContext = (
  value: unknown,
): PageStructureContextDTO => {
  const input = check.object(
    value,
    ["page", "updatedAt", "fingerprint", "knowledge"],
    "page structure context",
  );
  const page = check.object(
    input.page,
    ["id", "title", "slug"],
    "page reference",
  );
  const id = parseIdentifier(page.id, "page id");
  const title = check.text(page.title, "page title", 160);
  const fingerprint = check.hash(input.fingerprint);
  const knowledge = parsePageKnowledge(input.knowledge);
  if (
    !title.trim() ||
    knowledge.pageID !== id ||
    knowledge.fingerprint !== fingerprint
  ) {
    throw new ContractValidationError(
      "page structure reference or knowledge revision is inconsistent.",
    );
  }
  return {
    page: {
      id,
      title,
      ...(page.slug !== undefined
        ? { slug: check.text(page.slug, "page slug", 160) }
        : {}),
    },
    updatedAt: check.date(input.updatedAt),
    fingerprint,
    knowledge,
  };
};
