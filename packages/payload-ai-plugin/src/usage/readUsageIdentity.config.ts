/**
 * @file packages/payload-ai-plugin/src/usage/readUsageIdentity.config.ts
 * @version 1.0.0
 * @date 2026-10-05
 * @description Назначает идентичность установки из server environment, без browser override.
 */
import { z } from "zod";

export function readUsageIdentity(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/);
  return {
    installationId: id.parse(
      environment.REALIZE_INSTALLATION_ID || "local-installation",
    ),
    projectId: id.parse(environment.REALIZE_PROJECT_ID || "local-project"),
    platformReleaseId: environment.REALIZE_PLATFORM_RELEASE_ID
      ? id.parse(environment.REALIZE_PLATFORM_RELEASE_ID)
      : null,
  };
}
