/**
 * @file services/ai-control-plane/repositoryReadPolicy.index.ts
 * @version 1.1.0
 * @date 2026-11-26
 * @description Предоставляет тип и фабрику политики чтения репозитория.
 * @see documentation/architecture/project-structure.md
 */
export type { RepositoryReadPolicy } from "./src/RepositoryRead.types.ts";
export {
  createRepositoryReadPolicy,
  isRepositoryPathAllowed,
  REPOSITORY_ROOT_FILES,
  REPOSITORY_ROOT_DIRECTORIES,
} from "./src/repositoryReadPolicy.validator.ts";
export { readRepositoryFile } from "./src/readRepositoryFile.service.ts";
