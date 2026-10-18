/**
 * @file .ai/tools/task-workspace/src/filesystem/WorkspaceTree.types.ts
 * @version 1.0.0
 * @date 2026-10-15
 * @description Описывает файловые идентичности, записи и результат снимка дерева артефакта.
 * @see documentation/specifications/task-management-execution.md
 */

/** Целочисленные поля stat сохраняются строками без потери точности JSON. */
export type WorkspaceTreeIdentity = {
  dev: string;
  ino: string;
  mode: string;
  size: string;
  mtimeNs: string;
};

/** Корень имеет пустой path; хеш принадлежит содержимому файла либо тексту ссылки. */
export type WorkspaceTreeEntry = WorkspaceTreeIdentity & {
  path: string;
} & (
    | { kind: "directory"; hash?: never }
    | { kind: "file" | "link"; hash: string }
  );

/** Сумма bytes учитывает файлы, allocatedBytes — блоки всех записей дерева. */
export type WorkspaceTreeSnapshot = {
  hash: string;
  bytes: number;
  allocatedBytes: number;
  entries: WorkspaceTreeEntry[];
};
