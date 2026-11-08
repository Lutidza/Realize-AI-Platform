/**
 * @file .ai/tools/engineering/src/collectArtifactReferences.service.ts
 * @version 1.0.1
 * @date 2026-10-30
 * @description Проверяет bounded exact references через host evidence reader и собирает read manifest.
 * @see documentation/architecture/engineering-artifacts.md
 */
import { posix } from "node:path";
import { EngineeringFailure } from "@realize/engineering-runtime";
import {
  readMarkdownAnchors,
  readMarkdownLinks,
} from "../../quality/readMarkdownLinks.util.ts";
import type { ProjectArtifactBindingOptions } from "./ProjectArtifactBinding.types.ts";
import { ProjectArtifactError } from "./ProjectArtifact.error.ts";
import { ARTIFACT_LIMITS } from "./projectArtifactProfiles.config.ts";
import { assertArtifactPath } from "./resolveProjectFolderPolicy.validator.ts";

/** Reader вызывается только для exact paths; ошибка или усечение evidence запрещает план. */
export function collectArtifactReferences(
  readReference: ProjectArtifactBindingOptions["readReference"],
) {
  const contents = new Map<string, string>();
  let total = 0;
  const requireReference = (path: string): string => {
    assertArtifactPath(path);
    if (contents.has(path)) return contents.get(path)!;
    if (contents.size >= ARTIFACT_LIMITS.references)
      throw new ProjectArtifactError(
        "LIMIT_EXCEEDED",
        "Слишком много references артефакта.",
      );
    let bytes: Uint8Array;
    try {
      bytes = readReference(path);
    } catch (error) {
      // Структурированный отказ trusted host сохраняет ACL/conflict/budget reason.
      if (error instanceof EngineeringFailure) throw error;
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Не подтверждён обязательный reference артефакта.",
      );
    }
    if (!(bytes instanceof Uint8Array) || !bytes.byteLength)
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Reference не содержит проверяемых bytes.",
      );
    total += bytes.byteLength;
    if (
      bytes.byteLength > ARTIFACT_LIMITS.referenceBytes ||
      total > ARTIFACT_LIMITS.totalReferenceBytes
    )
      throw new ProjectArtifactError(
        "LIMIT_EXCEEDED",
        "Превышен бюджет reference evidence.",
      );
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Reference должен быть UTF-8 текстом.",
      );
    }
    contents.set(path, text);
    return text;
  };
  const checkLink = (path: string, text: string, link: string): void => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(link);
    } catch {
      throw new ProjectArtifactError(
        "INVALID_INPUT",
        "Некорректная ссылка Markdown.",
      );
    }
    const [rawPath, anchor, extra] = decoded.split("#");
    if (
      extra !== undefined ||
      rawPath.startsWith("/") ||
      /^[a-z][a-z\d+.-]*:/i.test(rawPath)
    )
      throw new ProjectArtifactError(
        "UNSUPPORTED",
        "Reference требует неподдержанного resolver.",
      );
    const target = rawPath
      ? posix.normalize(posix.join(posix.dirname(path), rawPath))
      : path;
    assertArtifactPath(target);
    const content = target === path ? text : requireReference(target);
    if (anchor && !readMarkdownAnchors(content).has(anchor))
      throw new ProjectArtifactError(
        "INVALID_INPUT",
        "Не найден Markdown anchor.",
      );
  };
  return {
    require: requireReference,
    localLinks(path: string, text: string) {
      const links = readMarkdownLinks(text);
      if (links.length > ARTIFACT_LIMITS.references)
        throw new ProjectArtifactError(
          "LIMIT_EXCEEDED",
          "Слишком много Markdown links.",
        );
      links.forEach((link) => checkLink(path, text, link));
    },
    rootedLink(path: string, text: string, target: string) {
      const [reference, anchor] = target.split("#");
      assertArtifactPath(reference);
      checkLink(
        path,
        text,
        `${posix.relative(posix.dirname(path), reference)}${anchor ? `#${anchor}` : ""}`,
      );
    },
    paths: () => [...contents.keys()].sort(),
  };
}
