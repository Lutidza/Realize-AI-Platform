/**
 * @file src/collections/Pages/pagePublication.adapter.ts
 * @version 1.0.1
 * @date 2026-09-14
 * @description Подключает право публикации, статическую политику и обновление витрины после commit.
 * @see documentation/specifications/realize-ai-commerce/v1.0/02-change-engine-and-pipelines/14-data-config-pipeline.md
 */
import type { PagePublicationAdapter } from "@realize/payload-ai-control/server/page-publication";
import { hashCanonicalJSON } from "@realize/change-engine";
import { checkRole } from "@/access/utilities";
import { validatePagePublicationPolicy } from "./pagePublicationPolicy.validator";
import { PAGE_PUBLICATION_POLICY } from "./pagePublicationPolicy.constants";
import { revalidatePagePublication } from "./pagePublicationRevalidation.service";

/** Apply/restore повторяют эту политику; штатная запись Payload дополнительно запускает реальные validators. */
export const pagePublicationAdapter: PagePublicationAdapter = {
  version: "1.0",
  canPublish: (req) =>
    Boolean(req.user?.collection === "users" && checkRole(["admin"], req.user)),
  async check(page, req) {
    const policyHash = hashCanonicalJSON(PAGE_PUBLICATION_POLICY);
    const checks = validatePagePublicationPolicy(page, req);
    if (checks.length) return { checks, policyHash };
    checks.push({
      id: "static-content",
      status: "passed",
      severity: "info",
      message:
        "Обязательные поля и поддержанная текстовая структура страницы проверены.",
    });
    if (checks.length < 100)
      checks.push({
        id: "publication-shell",
        status: "not_checked",
        severity: "warning",
        message:
          "Шапка, подвал и общие настройки сайта остаются актуальными и могут измениться отдельно от страницы.",
      });
    if (checks.length < 100)
      checks.push({
        id: "publication-save-validation",
        status: "not_checked",
        severity: "info",
        message:
          "При сохранении выполнятся дополнительные проверки. Публикация завершится только после подтверждения сохранённого содержимого.",
      });
    return { checks, policyHash };
  },
  revalidate: revalidatePagePublication,
};
