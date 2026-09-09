/**
 * @file packages/payload-ai-plugin/src/admin/integrations/catalog/integrationPresentation.config.ts
 * @version 1.1.0
 * @date 2026-09-09
 * @description Сопоставляет реализованные сервисы их фирменным логотипам.
 */

import { GitHubLogo } from "../GitHubLogo.component";
import { CodexLogo } from "../codex/CodexLogo.component";
import type { IntegrationPresentationRegistry } from "./IntegrationCatalog.types";

export const integrationPresentation = {
  codex: { Logo: CodexLogo },
  github: { Logo: GitHubLogo },
} satisfies IntegrationPresentationRegistry;
