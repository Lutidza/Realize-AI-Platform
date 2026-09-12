/**
 * @file packages/payload-ai-plugin/src/admin/agent-layer-settings/useAgentLayerConfiguration.hook.ts
 * @version 1.5.0
 * @date 2026-09-10
 * @description Координирует чтение, выбор draft и изменения записей через существующий Config API.
 */
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AIConfigBootstrapDTO,
  AIConfigDraftDTO,
  AIConfigValidationDTO,
  AIConfigReleaseDTO,
  AILocalRuleDefinition,
} from "@realize/ai-contracts";
import { ContractValidationError } from "@realize/ai-contracts";
import { AgentLayerConfigurationAdapter } from "./AgentLayerConfiguration.adapter";
import type {
  AgentLayerConfigurationFailure,
  AgentLayerMutation,
  AgentLayerRuleInput,
  AgentLayerProfileInput,
  CreateAgentLayerDraftOptions,
  UseAgentLayerConfigurationResult,
} from "./AgentLayerConfiguration.types";
import { buildAgentLayerDraftInput } from "./buildAgentLayerDraftInput.mapper";
import { buildAgentLayerRuleRemoval } from "./buildAgentLayerRuleRemoval.mapper";
import { buildAgentLayerRuleUpdate } from "./buildAgentLayerRuleUpdate.mapper";
import { buildAgentLayerProfileUpdate } from "./buildAgentLayerProfileUpdate.mapper";
import { buildAgentLayerInstructionUpdate } from "./buildAgentLayerInstructionUpdate.mapper";
import type { AgentLayerInstructionInput } from "./AgentLayerInstruction.types";
import { buildAgentLayerBindingUpdate } from "./buildAgentLayerBindingUpdate.mapper";
import type { AgentLayerBindingInput } from "./AgentLayerBinding.types";
import type { AgentLayerWorkflowInput } from "./AgentLayerWorkflow.types";
import { buildAgentLayerWorkflowUpdate } from "./buildAgentLayerWorkflowUpdate.mapper";
import { mergeAgentLayerDraftSummary } from "./mergeAgentLayerDraftSummary.mapper";
import { parseAgentLayerFailure } from "./parseAgentLayerFailure.mapper";
import { useAgentLayerMutation } from "./useAgentLayerMutation.hook";
import { useAgentLayerReleaseMutation } from "./useAgentLayerReleaseMutation.hook";
import type { AgentLayerReleaseMutationResult } from "./AgentLayerRelease.types";
import { CHAT_AGENT_CONFIGURATION_UPDATED_EVENT } from "../chat/chatAgentConfiguration.constants";

export const useAgentLayerConfiguration =
  (): UseAgentLayerConfigurationResult => {
    const api = useMemo(() => new AgentLayerConfigurationAdapter(), []);
    const [bootstrap, setBootstrap] = useState<AIConfigBootstrapDTO>();
    const [draft, setDraft] = useState<AIConfigDraftDTO>();
    const [release, setRelease] = useState<AIConfigReleaseDTO>();
    const [isLoading, setIsLoading] = useState(true);
    const [failure, setFailure] = useState<AgentLayerConfigurationFailure>();
    const [notice, setNotice] = useState<string>();
    const [validation, setValidation] = useState<AIConfigValidationDTO>();
    const draftRef = useRef<AIConfigDraftDTO | undefined>(undefined);
    const bootstrapRef = useRef<AIConfigBootstrapDTO | undefined>(undefined);
    const releaseRef = useRef<AIConfigReleaseDTO | undefined>(undefined);
    const readRef = useRef<AbortController | undefined>(undefined);
    const loadingRef = useRef(true);
    const mountedRef = useRef(false);

    const mutationStarted = useCallback(() => {
      setFailure(undefined);
      setNotice(undefined);
    }, []);
    const mutationFailed = useCallback(
      (error: AgentLayerConfigurationFailure) => {
        setFailure(error);
      },
      [],
    );
    const mutationSucceeded = useCallback(
      (
        loaded: AIConfigDraftDTO,
        kind: AgentLayerMutation["kind"],
        result?: AIConfigValidationDTO,
      ) => {
        draftRef.current = loaded;
        setDraft(loaded);
        setValidation(result);
        if (bootstrapRef.current) {
          const next = mergeAgentLayerDraftSummary(
            bootstrapRef.current,
            loaded,
          );
          bootstrapRef.current = next;
          setBootstrap(next);
        }
        setNotice(
          kind === "create"
            ? "Черновик создан. Он ещё не применяется к запускам агентов."
            : kind === "update"
              ? "Изменения сохранены в черновике."
              : result?.valid
                ? "Черновик прошёл проверку. Можно создать выпуск конфигурации."
                : result
                  ? "Проверка завершена: исправьте указанные ошибки."
                  : "Проверка выполнена. Загружена актуальная версия черновика.",
        );
      },
      [],
    );
    const mutation = useAgentLayerMutation({
      api,
      onStart: mutationStarted,
      onFailure: mutationFailed,
      onSuccess: mutationSucceeded,
    });
    const releaseSucceeded = useCallback(
      (result: AgentLayerReleaseMutationResult) => {
        bootstrapRef.current = result.bootstrap;
        setBootstrap(result.bootstrap);
        setValidation(undefined);
        if (result.kind === "release") {
          draftRef.current = result.draft;
          setDraft(result.draft);
          releaseRef.current = result.release;
          setRelease(result.release);
          setNotice(
            `Выпуск ${result.release.version} создан. Просмотрите его и активируйте для новых запусков чата.`,
          );
        } else {
          const superseded =
            result.bootstrap.activePointer!.version > result.receipt.version;
          setNotice(
            superseded
              ? "Активация подтверждена, но активный выпуск уже изменён другим редактором. Показано актуальное состояние."
              : "Выпуск активирован. Его инструкции доступны для новых запусков чата; текущие запуски сохраняют прежнюю конфигурацию.",
          );
          window.dispatchEvent(
            new Event(CHAT_AGENT_CONFIGURATION_UPDATED_EVENT),
          );
        }
      },
      [],
    );
    const releaseMutation = useAgentLayerReleaseMutation({
      api,
      onStart: mutationStarted,
      onFailure: mutationFailed,
      onSuccess: releaseSucceeded,
    });
    const { execute, isLocked: isDraftLocked } = mutation;
    const { execute: executeRelease, isLocked: isReleaseLocked } =
      releaseMutation;
    const isLocked = useCallback(
      () => isDraftLocked() || isReleaseLocked(),
      [isDraftLocked, isReleaseLocked],
    );

    const loadConfiguration = useCallback((): Promise<boolean> => {
      readRef.current?.abort();
      const request = new AbortController();
      readRef.current = request;
      loadingRef.current = true;
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(15_000),
      ]);
      return api
        .bootstrap(signal)
        .then(async (loaded) => {
          const selected =
            draftRef.current?.id ??
            loaded.drafts.find((value) => value.state !== "released")?.id ??
            loaded.drafts[0]?.id;
          const detail = selected
            ? await api.draft(selected, signal)
            : undefined;
          if (
            !mountedRef.current ||
            request.signal.aborted ||
            readRef.current !== request
          )
            return false;
          bootstrapRef.current = loaded;
          setBootstrap(loaded);
          draftRef.current = detail;
          setDraft(detail);
          setValidation(undefined);
          return true;
        })
        .catch((error: unknown) => {
          if (
            !mountedRef.current ||
            request.signal.aborted ||
            readRef.current !== request
          )
            return false;
          const parsed = parseAgentLayerFailure(error);
          setFailure(
            parsed.kind === "network"
              ? {
                  ...parsed,
                  message:
                    "Не удалось загрузить конфигурацию. Повторите загрузку.",
                }
              : parsed,
          );
          return false;
        })
        .finally(() => {
          if (mountedRef.current && readRef.current === request) {
            loadingRef.current = false;
            setIsLoading(false);
          }
        });
    }, [api]);
    const refresh = useCallback(async (): Promise<boolean> => {
      if (isLocked()) return false;
      setIsLoading(true);
      setFailure(undefined);
      setNotice(undefined);
      return loadConfiguration();
    }, [isLocked, loadConfiguration]);
    const selectDraft = useCallback(
      async (id: string): Promise<boolean> => {
        if (isLocked()) return false;
        readRef.current?.abort();
        const request = new AbortController();
        readRef.current = request;
        loadingRef.current = true;
        setIsLoading(true);
        setFailure(undefined);
        setNotice(undefined);
        try {
          const loaded = await api.draft(
            id,
            AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
          );
          if (
            !mountedRef.current ||
            request.signal.aborted ||
            readRef.current !== request
          )
            return false;
          draftRef.current = loaded;
          setDraft(loaded);
          setValidation(undefined);
          return true;
        } catch (error) {
          if (
            !mountedRef.current ||
            request.signal.aborted ||
            readRef.current !== request
          )
            return false;
          const parsed = parseAgentLayerFailure(error);
          setFailure(
            parsed.kind === "network"
              ? {
                  ...parsed,
                  message:
                    "Не удалось открыть черновик. Текущий черновик сохранён на экране.",
                }
              : parsed,
          );
          return false;
        } finally {
          if (mountedRef.current && readRef.current === request) {
            loadingRef.current = false;
            setIsLoading(false);
          }
        }
      },
      [api, isLocked],
    );
    const openRelease = useCallback(
      async (id: string): Promise<boolean> => {
        if (loadingRef.current || isLocked()) return false;
        readRef.current?.abort();
        const request = new AbortController();
        readRef.current = request;
        loadingRef.current = true;
        setIsLoading(true);
        setFailure(undefined);
        setNotice(undefined);
        try {
          const loaded = await api.release(
            id,
            AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
          );
          if (
            !mountedRef.current ||
            request.signal.aborted ||
            readRef.current !== request
          )
            return false;
          releaseRef.current = loaded;
          setRelease(loaded);
          return true;
        } catch (cause) {
          if (
            !mountedRef.current ||
            request.signal.aborted ||
            readRef.current !== request
          )
            return false;
          setFailure({
            ...parseAgentLayerFailure(cause),
            message:
              "Не удалось открыть выпуск. Обновите список и повторите действие.",
          });
          return false;
        } finally {
          if (mountedRef.current && readRef.current === request) {
            loadingRef.current = false;
            setIsLoading(false);
          }
        }
      },
      [api, isLocked],
    );
    const createRelease = useCallback(async (): Promise<boolean> => {
      const current = draftRef.current;
      const system = bootstrapRef.current?.system;
      if (
        loadingRef.current ||
        isLocked() ||
        !current ||
        !system ||
        current.state !== "ready"
      )
        return false;
      releaseRef.current = undefined;
      setRelease(undefined);
      return executeRelease({
        kind: "release",
        input: {
          schemaVersion: "1.0",
          draftID: current.id,
          expectedDraftRevision: current.revision,
          expectedSystemManifestHash: system.manifestHash,
        },
        idempotencyKey: crypto.randomUUID(),
      });
    }, [isLocked, executeRelease]);
    const activateRelease = useCallback(
      async (action: "activate" | "rollback"): Promise<boolean> => {
        const current = releaseRef.current;
        const configuration = bootstrapRef.current;
        if (
          loadingRef.current ||
          isLocked() ||
          !current ||
          !configuration ||
          (configuration.activePointer?.releaseID === current.id &&
            configuration.activePointer.manifestHash === current.manifestHash)
        )
          return false;
        return executeRelease({
          kind: "activate",
          input: {
            schemaVersion: "1.0",
            action,
            releaseID: current.id,
            expectedReleaseManifestHash: current.manifestHash,
            expectedPointerVersion: configuration.activePointer?.version ?? 0,
            expectedSystemManifestHash: configuration.system.manifestHash,
          },
          idempotencyKey: crypto.randomUUID(),
        });
      },
      [isLocked, executeRelease],
    );
    // Первый render уже показывает загрузку; effect только начинает чтение внешнего API.
    useEffect(() => {
      mountedRef.current = true;
      void loadConfiguration();
      return () => {
        mountedRef.current = false;
        readRef.current?.abort();
      };
    }, [loadConfiguration]);

    const reportLocalFailure = useCallback((error: unknown) => {
      setFailure(
        error instanceof ContractValidationError &&
          /[А-Яа-яЁё]/.test(error.message)
          ? { kind: "validation", message: error.message, retryable: false }
          : parseAgentLayerFailure(error),
      );
      return false;
    }, []);
    const createDraft = useCallback(
      async (options: CreateAgentLayerDraftOptions = {}): Promise<boolean> => {
        if (loadingRef.current || isLocked() || !bootstrapRef.current)
          return false;
        try {
          const source = options.copySelected ? draftRef.current : undefined;
          if (options.copySelected && !source)
            throw new ContractValidationError(
              "Выберите черновик для копирования.",
            );
          const draftID = `draft-${crypto.randomUUID()}`;
          return execute({
            kind: "create",
            draftID,
            input: buildAgentLayerDraftInput(draftID, source),
            idempotencyKey: crypto.randomUUID(),
          });
        } catch (error) {
          return reportLocalFailure(error);
        }
      },
      [isLocked, execute, reportLocalFailure],
    );
    const saveRule = useCallback(
      async (
        input: AgentLayerRuleInput,
        originalKey?: string,
      ): Promise<boolean> => {
        if (loadingRef.current || isLocked() || !draftRef.current) return false;
        try {
          return execute({
            kind: "update",
            draftID: draftRef.current.id,
            input: buildAgentLayerRuleUpdate(
              draftRef.current,
              input,
              originalKey,
            ),
            idempotencyKey: crypto.randomUUID(),
          });
        } catch (error) {
          return reportLocalFailure(error);
        }
      },
      [isLocked, execute, reportLocalFailure],
    );
    const saveProfile = useCallback(
      async (
        input: AgentLayerProfileInput,
        originalKey?: string,
      ): Promise<boolean> => {
        if (loadingRef.current || isLocked() || !draftRef.current) return false;
        try {
          return execute({
            kind: "update",
            draftID: draftRef.current.id,
            input: buildAgentLayerProfileUpdate(
              draftRef.current,
              input,
              originalKey,
            ),
            idempotencyKey: crypto.randomUUID(),
          });
        } catch (error) {
          return reportLocalFailure(error);
        }
      },
      [isLocked, execute, reportLocalFailure],
    );
    const saveInstruction = useCallback(
      async (
        input: AgentLayerInstructionInput,
        originalKey?: string,
      ): Promise<boolean> => {
        if (loadingRef.current || isLocked() || !draftRef.current) return false;
        try {
          return execute({
            kind: "update",
            draftID: draftRef.current.id,
            input: buildAgentLayerInstructionUpdate(
              draftRef.current,
              input,
              originalKey,
            ),
            idempotencyKey: crypto.randomUUID(),
          });
        } catch (error) {
          return reportLocalFailure(error);
        }
      },
      [isLocked, execute, reportLocalFailure],
    );
    const saveBinding = useCallback(
      async (
        input: AgentLayerBindingInput,
        originalKey?: string,
      ): Promise<boolean> => {
        if (loadingRef.current || isLocked() || !draftRef.current) return false;
        try {
          return execute({
            kind: "update",
            draftID: draftRef.current.id,
            input: buildAgentLayerBindingUpdate(
              draftRef.current,
              input,
              originalKey,
            ),
            idempotencyKey: crypto.randomUUID(),
          });
        } catch (error) {
          return reportLocalFailure(error);
        }
      },
      [isLocked, execute, reportLocalFailure],
    );
    const saveWorkflow = useCallback(
      async (
        input: AgentLayerWorkflowInput,
        originalKey?: string,
      ): Promise<boolean> => {
        if (loadingRef.current || isLocked() || !draftRef.current) return false;
        try {
          return execute({
            kind: "update",
            draftID: draftRef.current.id,
            input: buildAgentLayerWorkflowUpdate(
              draftRef.current,
              input,
              originalKey,
            ),
            idempotencyKey: crypto.randomUUID(),
          });
        } catch (error) {
          return reportLocalFailure(error);
        }
      },
      [isLocked, execute, reportLocalFailure],
    );
    const removeRule = useCallback(
      async (key: string): Promise<boolean> => {
        if (loadingRef.current || isLocked() || !draftRef.current) return false;
        try {
          return execute({
            kind: "update",
            draftID: draftRef.current.id,
            input: buildAgentLayerRuleRemoval(draftRef.current, key),
            idempotencyKey: crypto.randomUUID(),
          });
        } catch (error) {
          return reportLocalFailure(error);
        }
      },
      [isLocked, execute, reportLocalFailure],
    );
    const validateDraft = useCallback(async (): Promise<boolean> => {
      const current = draftRef.current;
      if (loadingRef.current || isLocked() || !current) return false;
      if (current.state !== "editing")
        return reportLocalFailure(
          new ContractValidationError(
            current.state === "ready"
              ? "Эта версия уже прошла проверку. Измените черновик для повторной проверки."
              : "Этот черновик доступен только для чтения. Создайте копию.",
          ),
        );
      return execute({
        kind: "validate",
        draftID: current.id,
        input: {
          draftID: current.id,
          expectedRevision: current.revision,
          schemaVersion: "1.0",
        },
        idempotencyKey: crypto.randomUUID(),
      });
    }, [isLocked, execute, reportLocalFailure]);
    const rules = useMemo(
      () =>
        draft?.artifacts.filter(
          (artifact): artifact is AILocalRuleDefinition =>
            artifact.kind === "local_rule",
        ) ?? [],
      [draft],
    );
    return {
      bootstrap,
      release,
      openRelease,
      createRelease,
      activateRelease,
      draft,
      rules,
      isLoading,
      isBusy: mutation.isBusy || releaseMutation.isBusy,
      error: failure?.message,
      errorKind: failure?.kind,
      notice,
      validation,
      hasPendingMutation:
        mutation.hasPendingMutation || releaseMutation.hasPendingMutation,
      refresh,
      selectDraft,
      createDraft,
      saveRule,
      saveProfile,
      saveInstruction,
      saveBinding,
      saveWorkflow,
      removeRule,
      validateDraft,
      retryMutation: () =>
        releaseMutation.hasPendingMutation
          ? releaseMutation.retry()
          : mutation.retry(),
    };
  };
