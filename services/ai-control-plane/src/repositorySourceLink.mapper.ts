/**
 * @file services/ai-control-plane/src/repositorySourceLink.mapper.ts
 * @version 1.0.0
 * @date 2026-09-30
 * @description Строит проверяемую ссылку на строки текущего файла без credential и произвольного назначения.
 */
export const buildRepositorySourceLink = (
  path: string,
  line: number,
  sha256: string,
  base?: string,
): string => {
  const relative = `/api/realize-ai/chat/project-file?${new URLSearchParams({ path, startLine: String(line), expectedSha256: sha256 })}`;
  if (!base) return relative;
  const url = new URL(base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("repository_source_origin_invalid");
  return new URL(relative, url.origin).href;
};
