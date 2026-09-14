/**
 * @file packages/ai-contracts/src/parsePageDraftStructure.validator.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет адресные команды Content, ревизию и полный ограниченный preview перед подтверждением.
 */
import type {
  UpdatePageStructureDraftIntent,
  PageDraftStructureCommand,
  PageDraftContentPreviewDTO,
  PageDraftStructurePreviewDTO,
} from "./PageDraftStructure.types";
import { pageDraftTextValidation as check } from "./pageDraftTextValidation.validator";
import { ContractValidationError, parseIdentifier } from "./validation";

const anchor = (value: unknown): string | null =>
  value === null ? null : parseIdentifier(value, "anchor block id");
const count = (value: unknown, minimum = 1): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > 10_000
  )
    throw new ContractValidationError("page structure count is invalid.");
  return value;
};

/** Модель задаёт только один типизированный intent; IDs вставки генерирует сервер. */
export const parseUpdatePageStructureDraftIntent = (
  value: unknown,
): UpdatePageStructureDraftIntent => {
  const input = check.object(
    value,
    [
      "version",
      "kind",
      "pageID",
      "expectedUpdatedAt",
      "expectedFingerprint",
      "expectedCatalogHash",
      "operation",
    ],
    "page structure operation",
  );
  if (input.version !== "1.0" || input.kind !== "pages.updateStructureDraft.v1")
    throw new ContractValidationError(
      "page structure operation kind or version is not supported.",
    );
  const raw = check.object(
    input.operation,
    ["type", "blockID", "beforeBlockID", "section"],
    "structure command",
  );
  let operation: PageDraftStructureCommand;
  if (raw.type === "insert") {
    check.object(raw, ["type", "beforeBlockID", "section"], "insert command");
    const section = check.object(
      raw.section,
      ["heading", "body"],
      "content section",
    );
    const body = check.text(section.body, "section body", 4_000, true);
    const heading =
      section.heading === undefined
        ? undefined
        : check.text(section.heading, "section heading", 160, true);
    if (!body.trim() || (heading !== undefined && !heading.trim()))
      throw new ContractValidationError(
        "inserted section text must not be empty.",
      );
    operation = {
      type: "insert",
      beforeBlockID: anchor(raw.beforeBlockID),
      section: { body, ...(heading === undefined ? {} : { heading }) },
    };
  } else if (raw.type === "move") {
    check.object(raw, ["type", "blockID", "beforeBlockID"], "move command");
    operation = {
      type: "move",
      blockID: parseIdentifier(raw.blockID, "block id"),
      beforeBlockID: anchor(raw.beforeBlockID),
    };
    if (operation.blockID === operation.beforeBlockID)
      throw new ContractValidationError("a block cannot be its own anchor.");
  } else if (raw.type === "remove") {
    check.object(raw, ["type", "blockID"], "remove command");
    operation = {
      type: "remove",
      blockID: parseIdentifier(raw.blockID, "block id"),
    };
  } else
    throw new ContractValidationError("structure command is not supported.");
  return {
    version: "1.0",
    kind: "pages.updateStructureDraft.v1",
    pageID: parseIdentifier(input.pageID, "page id"),
    expectedUpdatedAt: check.date(input.expectedUpdatedAt),
    expectedFingerprint: check.hash(input.expectedFingerprint),
    expectedCatalogHash: check.hash(input.expectedCatalogHash),
    operation,
  };
};

/** Превышение лимитов отклоняется: удаляемый контент не может молча обрезаться. */
export const parsePageDraftContentPreview = (
  value: unknown,
): PageDraftContentPreviewDTO => {
  const input = check.object(
    value,
    ["columns", "blockName"],
    "content preview",
  );
  if (
    !Array.isArray(input.columns) ||
    input.columns.length < 1 ||
    input.columns.length > 16
  )
    throw new ContractValidationError(
      "content preview must contain 1 to 16 columns.",
    );
  const columns = input.columns.map((value) => {
    const column = check.object(
      value,
      ["size", "text"],
      "content column preview",
    );
    if (
      typeof column.size !== "string" ||
      !["oneThird", "half", "twoThirds", "full"].includes(column.size)
    )
      throw new ContractValidationError("content column size is unsupported.");
    return {
      size: column.size as PageDraftContentPreviewDTO["columns"][number]["size"],
      text: check.text(column.text, "content column text", 16_000),
    };
  });
  const blockName =
    input.blockName === undefined
      ? undefined
      : check.text(input.blockName, "block name", 160);
  if (blockName !== undefined && !blockName.trim())
    throw new ContractValidationError("block name is empty.");
  const result = { columns, ...(blockName === undefined ? {} : { blockName }) };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 32 * 1024)
    throw new ContractValidationError("content preview exceeds 32 KiB.");
  return result;
};

/** DTO не раскрывает закрытые before/after документы или нетронутый layout. */
export const parsePageDraftStructurePreview = (
  value: unknown,
): PageDraftStructurePreviewDTO => {
  const input = check.object(
    value,
    [
      "page",
      "status",
      "action",
      "blockID",
      "beforeIndex",
      "afterIndex",
      "totalBefore",
      "totalAfter",
      "beforeBlockID",
      "content",
    ],
    "structure preview",
  );
  const page = check.object(
    input.page,
    ["id", "title", "slug"],
    "page reference",
  );
  const title = check.text(page.title, "page title", 500);
  if (
    !title.trim() ||
    input.status !== "draft" ||
    typeof input.action !== "string" ||
    !["insert", "move", "remove"].includes(input.action)
  )
    throw new ContractValidationError("structure preview is invalid.");
  const action = input.action as PageDraftStructurePreviewDTO["action"];
  const totalBefore = count(input.totalBefore, action === "insert" ? 0 : 1);
  const totalAfter = count(input.totalAfter);
  const index = (value: unknown, total: number): number | null => {
    if (value === null) return null;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value >= total
    )
      throw new ContractValidationError("structure preview index is invalid.");
    return value;
  };
  const beforeIndex = index(input.beforeIndex, totalBefore);
  const afterIndex = index(input.afterIndex, totalAfter);
  if (
    (action === "insert" &&
      (beforeIndex !== null ||
        afterIndex === null ||
        totalAfter !== totalBefore + 1)) ||
    (action === "remove" &&
      (beforeIndex === null ||
        afterIndex !== null ||
        totalAfter !== totalBefore - 1)) ||
    (action === "move" &&
      (beforeIndex === null ||
        afterIndex === null ||
        beforeIndex === afterIndex ||
        totalBefore !== totalAfter))
  )
    throw new ContractValidationError(
      "structure preview does not describe its action.",
    );
  if (
    (action === "move" && input.content !== undefined) ||
    (action !== "move" && input.content === undefined)
  )
    throw new ContractValidationError(
      "structure preview content does not match its action.",
    );
  const blockID = parseIdentifier(input.blockID, "block id");
  const beforeBlockID = anchor(input.beforeBlockID);
  if (
    (action === "remove" && beforeBlockID !== null) ||
    beforeBlockID === blockID
  )
    throw new ContractValidationError("structure preview anchor is invalid.");
  if (
    action !== "remove" &&
    (beforeBlockID === null
      ? afterIndex !== totalAfter - 1
      : afterIndex === totalAfter - 1)
  )
    throw new ContractValidationError(
      "structure preview position does not match its anchor.",
    );
  return {
    page: {
      id: parseIdentifier(page.id, "page id"),
      title,
      ...(page.slug === undefined
        ? {}
        : { slug: check.text(page.slug, "page slug", 160) }),
    },
    status: "draft",
    action,
    blockID,
    beforeIndex,
    afterIndex,
    totalBefore,
    totalAfter,
    beforeBlockID,
    ...(input.content === undefined
      ? {}
      : { content: parsePageDraftContentPreview(input.content) }),
  };
};
