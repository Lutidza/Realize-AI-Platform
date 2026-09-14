/**
 * @file packages/ai-contracts/src/parsePageDiscovery.validator.ts
 * @version 1.0.0
 * @date 2026-09-13
 * @description Проверяет узкие аргументы и результаты инструментов поиска и чтения страниц.
 */
import type {
  PageDiscoveryCall,
  PageDiscoveryGrant,
  PageDiscoveryResult,
  PageDiscoverySearchDTO,
} from "./PageDiscovery.types";
import { pageDraftTextValidation as check } from "./pageDraftTextValidation.validator";
import { parsePageDraftContext } from "./parsePageDraftContext.validator";
import { parsePageStructureContext } from "./parsePageKnowledge.validator";
import { ContractValidationError, parseIdentifier } from "./validation";

const integer = (value: unknown, min: number, max: number): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new ContractValidationError("page tool pagination is invalid.");
  return value;
};

/** Модель не выбирает actor, run, URL, коллекцию, ACL или произвольный Payload query. */
export const parsePageDiscoveryCall = (value: unknown): PageDiscoveryCall => {
  const input = check.object(
    value,
    ["callID", "name", "arguments"],
    "page tool call",
  );
  const callID = parseIdentifier(input.callID, "page tool call id");
  if (input.name === "pages_search") {
    const args = check.object(
      input.arguments,
      ["query", "page"],
      "page search arguments",
    );
    const query = check.text(args.query, "page search query", 128).trim();
    if (!query)
      throw new ContractValidationError("page search query must not be empty.");
    return {
      callID,
      name: input.name,
      arguments: {
        query,
        ...(args.page !== undefined
          ? { page: integer(args.page, 1, 999_999) }
          : {}),
      },
    };
  }
  if (input.name === "pages_read") {
    const args = check.object(
      input.arguments,
      ["pageID"],
      "page read arguments",
    );
    return {
      callID,
      name: input.name,
      arguments: { pageID: parseIdentifier(args.pageID, "page id") },
    };
  }
  if (input.name === "pages_structure") {
    const args = check.object(
      input.arguments,
      ["pageID", "offset", "fingerprint", "catalogHash"],
      "page structure arguments",
    );
    const offset =
      args.offset === undefined ? 0 : integer(args.offset, 0, 10_000);
    if (
      offset % 32 !== 0 ||
      (offset > 0 && (!args.fingerprint || !args.catalogHash))
    )
      throw new ContractValidationError(
        "page structure continuation requires revision and catalog hashes.",
      );
    return {
      callID,
      name: input.name,
      arguments: {
        pageID: parseIdentifier(args.pageID, "page id"),
        ...(args.offset !== undefined ? { offset } : {}),
        ...(args.fingerprint !== undefined
          ? { fingerprint: check.hash(args.fingerprint) }
          : {}),
        ...(args.catalogHash !== undefined
          ? { catalogHash: check.hash(args.catalogHash) }
          : {}),
      },
    };
  }
  throw new ContractValidationError("page tool is not registered.");
};

/** Проверяет private transport metadata; подпись и текущие права проверяет только владелец Payload. */
export const parsePageDiscoveryGrant = (
  value: unknown,
  runID?: string,
): PageDiscoveryGrant => {
  const input = check.object(value, ["endpoint", "token"], "page tool grant");
  const endpoint = check.text(input.endpoint, "page tool endpoint", 2_048);
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new ContractValidationError("page tool endpoint is invalid.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/\/realize-ai\/chat\/page-tools\/[A-Za-z0-9_-]{1,128}$/.test(
      url.pathname,
    ) ||
    (runID !== undefined &&
      !url.pathname.endsWith(
        `/chat/page-tools/${parseIdentifier(runID, "run id")}`,
      ))
  )
    throw new ContractValidationError(
      "page tool endpoint is not bound to this run.",
    );
  const token = check.text(input.token, "page tool credential", 4_096);
  if (token.length < 32 || !/^[A-Za-z0-9_.-]+$/.test(token))
    throw new ContractValidationError("page tool credential is invalid.");
  return { endpoint, token };
};

/** В поиске содержатся только безопасные подписи и реальные ссылки на редактор. */
export const parsePageDiscoverySearch = (
  value: unknown,
): PageDiscoverySearchDTO => {
  const input = check.object(
    value,
    ["pages", "page", "totalPages", "totalDocs"],
    "page search result",
  );
  if (!Array.isArray(input.pages) || input.pages.length > 20)
    throw new ContractValidationError(
      "page search result exceeds its page size.",
    );
  const ids = new Set<string>();
  const pages = input.pages.map((value) => {
    const page = check.object(
      value,
      ["id", "title", "slug", "adminUrl"],
      "page search reference",
    );
    const id = parseIdentifier(page.id, "page id");
    const title = check.text(page.title, "page title", 500);
    const adminUrl = check.text(page.adminUrl, "page admin URL", 512);
    if (
      ids.has(id) ||
      !title.trim() ||
      !/^\/(?:[A-Za-z0-9_-]+\/)*collections\/pages\/[A-Za-z0-9_-]{1,128}$/.test(
        adminUrl,
      ) ||
      !adminUrl.endsWith(`/pages/${id}`)
    )
      throw new ContractValidationError(
        "page search reference is invalid or duplicated.",
      );
    ids.add(id);
    return {
      id,
      title,
      adminUrl,
      ...(page.slug !== undefined
        ? { slug: check.text(page.slug, "page slug", 160) }
        : {}),
    };
  });
  const result = {
    pages,
    page: integer(input.page, 1, 999_999),
    totalPages: integer(input.totalPages, 0, Number.MAX_SAFE_INTEGER),
    totalDocs: integer(input.totalDocs, 0, Number.MAX_SAFE_INTEGER),
  };
  if (
    result.totalDocs < pages.length ||
    new TextEncoder().encode(JSON.stringify(result)).byteLength > 32 * 1024
  )
    throw new ContractValidationError(
      "page search result is inconsistent or exceeds 32 KiB.",
    );
  return result;
};

/** Повторно проверяет ответ доверенного сервера на границе provider transport. */
export const parsePageDiscoveryResult = (
  name: PageDiscoveryCall["name"],
  value: unknown,
): PageDiscoveryResult => {
  if (name === "pages_search") return parsePageDiscoverySearch(value);
  if (name === "pages_read") return parsePageDraftContext(value);
  if (name === "pages_structure") return parsePageStructureContext(value);
  throw new ContractValidationError("page tool is not registered.");
};
