/**
 * @file packages/ai-contracts/src/PageDiscovery.types.ts
 * @version 1.1.0
 * @date 2026-09-13
 * @description Задаёт ограниченные инструменты поиска и чтения страниц и закрытый допуск одного запуска.
 */
import type {
  PageDraftCatalogDTO,
  PageDraftContextDTO,
} from "./PageDraftUpdate.types";
import type { PageStructureContextDTO } from "./PageKnowledge.types";

export type PageDiscoveryCall = {
  callID: string;
} & (
  | { name: "pages_search"; arguments: { query: string; page?: number } }
  | { name: "pages_read"; arguments: { pageID: string } }
  | {
      name: "pages_structure";
      arguments: {
        pageID: string;
        offset?: number;
        fingerprint?: string;
        catalogHash?: string;
      };
    }
);

/** Только server-to-server; ни URL callback, ни credential не передаются модели или браузеру. */
export type PageDiscoveryGrant = { endpoint: string; token: string };

/** Серверная ссылка исключает необходимость угадывать маршрут редактора в ответе модели. */
export type PageDiscoverySearchDTO = Omit<PageDraftCatalogDTO, "pages"> & {
  pages: Array<PageDraftCatalogDTO["pages"][number] & { adminUrl: string }>;
};

/** Прочитанный сервером snapshot сохраняется до выдачи модели; принадлежит ровно одному run. */
export type PageDiscoveryReadRecord = {
  callID: string;
  requestHash: string;
  context: PageDraftContextDTO;
};

/** Сохранённая порция структуры подтверждает прочитанные IDs и ревизию исходного run. */
export type PageDiscoveryStructureReadRecord = {
  callID: string;
  requestHash: string;
  arguments: Extract<
    PageDiscoveryCall,
    { name: "pages_structure" }
  >["arguments"];
  context: PageStructureContextDTO;
};

export type PageDiscoveryResult =
  PageDiscoverySearchDTO | PageDraftContextDTO | PageStructureContextDTO;
