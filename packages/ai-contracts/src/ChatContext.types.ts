/**
 * @file packages/ai-contracts/src/ChatContext.types.ts
 * @version 1.1.0
 * @date 2026-09-12
 * @description Задаёт безопасные проекции вложений, файлов проекта и возможностей чата.
 */

/** Приватное вложение: URL требует текущую сессию владельца. */
export type ChatAttachmentDto = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "text";
  url: string;
};

/** Файл из безопасного каталога; хеш связывает выбор с конкретным содержимым. */
export type ProjectContextFileDto = {
  path: string;
  size: number;
  sha256: string;
};

/** Источник, действительно возвращённый провайдером при веб-поиске. */
export type ChatSourceDto = { url: string; title?: string };

/** Снимок доступности runtime и ограничений, понятный клиенту без внутренних путей. */
export type ChatCapabilitiesDto = {
  pageDrafts?: { available: boolean };
  attachments: {
    available: boolean;
    mimeTypes: string[];
    extensions: string[];
    maxFiles: number;
    maxImageBytes: number;
    maxTextBytes: number;
    maxTotalBytes: number;
  };
  projectFiles: { available: boolean; maxFiles: number };
  webSearch: { available: boolean };
};

/** Ограниченный результат поиска файлов проекта. */
export type ProjectContextFilesDto = {
  files: ProjectContextFileDto[];
  truncated: boolean;
};

/** Внутренняя ссылка между доверенными серверами; бинарные данные передаются отдельно. */
export type ChatAssetReference = { id: string; sha256: string };

/** Приватная metadata, доступная только серверному relay, без filesystem paths. */
export type ChatAssetMetadata = Omit<ChatAttachmentDto, "url"> & {
  sha256: string;
  createdAt: string;
  runID?: string;
};

/** Неизменяемая ссылка на файл проекта перед отправкой. */
export type ProjectFileReference = Pick<
  ProjectContextFileDto,
  "path" | "sha256"
>;
