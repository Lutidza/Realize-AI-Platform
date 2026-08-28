/**
 * @file packages/payload-ai-plugin/src/admin/integrations/useIntegrations.ts
 * @version 2026-08-27
 * @description Owns Admin integration catalog state without persisting draft secrets.
 */

"use client";

import type {
  GitHubIntegrationConnectionDTO,
  GitHubIntegrationTestDTO,
  IntegrationCatalogDTO,
  SaveGitHubIntegrationInput,
  TestGitHubIntegrationInput,
} from "@realize/ai-contracts";
import { useCallback, useState } from "react";

import {
  disconnectGitHubIntegration,
  loadIntegrationCatalog,
  saveGitHubIntegration,
  testGitHubIntegration,
} from "./integrationAPI";

/** Coordinates list/save/test/disconnect while keeping token in form-local memory. */
export const useIntegrations = (initialCatalog: IntegrationCatalogDTO) => {
  const [catalog, setCatalog] = useState<IntegrationCatalogDTO>(initialCatalog);
  const [busyAction, setBusyAction] = useState<
    "disconnect" | "load" | "save" | "test" | undefined
  >();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setBusyAction("load");
    setError(undefined);
    try {
      setCatalog(await loadIntegrationCatalog());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить интеграции.",
      );
    } finally {
      setBusyAction((current) => (current === "load" ? undefined : current));
    }
  }, []);

  const replaceGitHub = useCallback(
    (connection?: GitHubIntegrationConnectionDTO) => {
      setCatalog((current) =>
        current
          ? {
              ...current,
              connections: [
                ...current.connections.filter(
                  (item) => item.provider !== "github",
                ),
                ...(connection ? [connection] : []),
              ],
            }
          : current,
      );
    },
    [],
  );

  const saveGitHub = useCallback(
    async (
      input: SaveGitHubIntegrationInput,
    ): Promise<GitHubIntegrationConnectionDTO | undefined> => {
      setBusyAction("save");
      setError(undefined);
      try {
        const connection = await saveGitHubIntegration(input);
        replaceGitHub(connection);
        return connection;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось сохранить интеграцию.",
        );
      } finally {
        setBusyAction(undefined);
      }
    },
    [replaceGitHub],
  );

  const testGitHub = useCallback(
    async (
      input: TestGitHubIntegrationInput,
    ): Promise<GitHubIntegrationTestDTO | undefined> => {
      setBusyAction("test");
      setError(undefined);
      try {
        const result = await testGitHubIntegration(input);
        if (!input.token) await load();
        return result;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось проверить интеграцию.",
        );
      } finally {
        setBusyAction(undefined);
      }
    },
    [load],
  );

  const disconnectGitHub = useCallback(
    async (revision: number) => {
      setBusyAction("disconnect");
      setError(undefined);
      try {
        await disconnectGitHubIntegration({ expectedRevision: revision });
        replaceGitHub();
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Не удалось отключить интеграцию.",
        );
        return false;
      } finally {
        setBusyAction(undefined);
      }
    },
    [replaceGitHub],
  );

  return {
    busyAction,
    catalog,
    clearError: () => setError(undefined),
    disconnectGitHub,
    error,
    reload: load,
    saveGitHub,
    testGitHub,
  };
};
