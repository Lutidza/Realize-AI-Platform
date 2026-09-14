/**
 * @file packages/payload-ai-plugin/src/chat-context/pageDiscovery.service.ts
 * @version 1.1.0
 * @date 2026-09-13
 * @description Выполняет ограниченные чтения страниц и сохраняет проверяемый источник будущего плана.
 */
import {
  parsePageDiscoveryResult,
  parsePageDraftContext,
  parsePageStructureContext,
  type PageDiscoveryCall,
  type PageDiscoveryResult,
} from "@realize/ai-contracts";
import { hashCanonicalJSON } from "@realize/change-engine";
import type { PayloadRequest } from "payload";
import { EndpointError } from "../endpoints/http";
import { PageDraftUpdate } from "../endpoints/pageDraftUpdate.service";
import { getControlPlaneClient } from "../runtime/getControlPlaneClient";
import type { SanitizedRealizeAIPluginOptions } from "../types";
import { listPageDrafts } from "./listPageDrafts.repository";
import { PageDiscoveryRepository } from "./PageDiscovery.repository";
import type { ChatRunContext } from "./ChatRunContext.types";

const ledger = (context: ChatRunContext) => {
  const calls = context.pageDiscoveryCalls ?? [];
  if (
    !Array.isArray(calls) ||
    calls.length > 12 ||
    !Array.isArray(context.pageReadContexts ?? []) ||
    (context.pageReadContexts?.length ?? 0) > 3 ||
    !Array.isArray(context.pageStructureReadContexts ?? []) ||
    (context.pageStructureReadContexts?.length ?? 0) > 8 ||
    Buffer.byteLength(
      JSON.stringify([
        context.pageReadContexts ?? [],
        context.pageStructureReadContexts ?? [],
      ]),
      "utf8",
    ) >
      384 * 1024
  )
    throw new EndpointError(
      "CONFLICT",
      "Журнал чтений запуска некорректен.",
      409,
    );
  return calls;
};

/** Только сервер формирует snapshot; аргументы модели никогда не становятся контекстом записи. */
export const executePageDiscovery = async (
  req: PayloadRequest,
  options: SanitizedRealizeAIPluginOptions,
  runID: string,
  userID: string,
  call: PageDiscoveryCall,
): Promise<PageDiscoveryResult> => {
  const repository = new PageDiscoveryRepository(req, runID, userID);
  const assertRunning = async () => {
    await repository.current();
    if ((await getControlPlaneClient(options).runStatus(runID)) !== "running")
      throw new EndpointError(
        "CONFLICT",
        "Запуск уже завершён или не выполняется. Отправьте новый запрос.",
        409,
      );
  };
  await assertRunning();
  const requestHash = hashCanonicalJSON({
    name: call.name,
    arguments: call.arguments,
  });
  const replay = await repository.locked(async (context) => {
    const calls = ledger(context);
    const previous = calls.find((record) => record.callID === call.callID);
    if (previous) {
      if (previous.requestHash !== requestHash || previous.name !== call.name)
        throw new EndpointError(
          "CONFLICT",
          "Идентификатор вызова уже связан с другим запросом.",
          409,
        );
      if (previous.status !== "completed")
        throw new EndpointError(
          "CONFLICT",
          "Этот вызов выполняется или завершился ошибкой. Используйте новый вызов.",
          409,
        );
      if (call.name === "pages_read") {
        const read = context.pageReadContexts?.find(
          (record) =>
            record.callID === call.callID && record.requestHash === requestHash,
        );
        if (!read)
          throw new EndpointError(
            "CONFLICT",
            "У вызова отсутствует сохранённый снимок страницы.",
            409,
          );
        return parsePageDraftContext(read.context);
      }
      if (call.name === "pages_structure") {
        const read = context.pageStructureReadContexts?.find(
          (record) =>
            record.callID === call.callID && record.requestHash === requestHash,
        );
        if (!read)
          throw new EndpointError(
            "CONFLICT",
            "У вызова отсутствует сохранённая порция структуры.",
            409,
          );
        return parsePageStructureContext(read.context);
      }
      // Поиск при точном повторе перечитывается с действующими ACL.
      return undefined;
    }
    if (calls.length >= 12)
      throw new EndpointError(
        "RATE_LIMITED",
        "Лимит чтений страниц для этого сообщения исчерпан. Отправьте новый запрос.",
        429,
      );
    await repository.save({
      ...context,
      pageDiscoveryCalls: [
        ...calls,
        {
          callID: call.callID,
          requestHash,
          name: call.name,
          status: "pending",
        },
      ],
    });
    return undefined;
  });
  const pages = new PageDraftUpdate(req.payload, req);
  try {
    if (replay) {
      // Snapshot остаётся точным, но выдаётся повторно только пока текущие ACL страницы разрешают чтение.
      if (
        call.name === "pages_structure" &&
        "knowledge" in replay &&
        replay.knowledge
      ) {
        const current = await pages.readStructure(replay.page.id, {
          offset: replay.knowledge.outline.offset,
          fingerprint: replay.fingerprint,
          catalogHash: replay.knowledge.catalogHash,
        });
        if (hashCanonicalJSON(current) !== hashCanonicalJSON(replay))
          throw new EndpointError(
            "CONFLICT",
            "Структура или доступ к её ссылкам изменились. Прочитайте новую порцию.",
            409,
          );
      } else await pages.readContext(replay.page.id);
      await assertRunning();
      return replay;
    }
    let result: PageDiscoveryResult;
    if (call.name === "pages_search") {
      const catalog = await listPageDrafts(
        req,
        call.arguments.query,
        call.arguments.page ?? 1,
      );
      result = {
        ...catalog,
        pages: catalog.pages.map((page) => ({
          ...page,
          adminUrl: `${req.payload.config.routes.admin}/collections/pages/${encodeURIComponent(page.id)}`,
        })),
      };
    } else if (call.name === "pages_structure") {
      const { pageID, ...request } = call.arguments;
      result = await pages.readStructure(pageID, request);
    } else {
      result = await pages.readContext(call.arguments.pageID);
    }
    result = parsePageDiscoveryResult(call.name, result);
    await assertRunning();
    await repository.locked(async (context) => {
      const calls = ledger(context);
      const previous = calls.find(
        (record) =>
          record.callID === call.callID && record.requestHash === requestHash,
      );
      if (!previous || previous.status === "failed")
        throw new EndpointError(
          "CONFLICT",
          "Состояние вызова изменилось.",
          409,
        );
      const reads = context.pageReadContexts ?? [];
      if (call.name === "pages_read") {
        const snapshot = parsePageDraftContext(result);
        const nextReads = [
          ...reads,
          { callID: call.callID, requestHash, context: snapshot },
        ];
        if (
          nextReads.length > 3 ||
          Buffer.byteLength(
            JSON.stringify([
              nextReads,
              context.pageStructureReadContexts ?? [],
            ]),
            "utf8",
          ) >
            384 * 1024
        )
          throw new EndpointError(
            "RATE_LIMITED",
            "Лимит снимков страниц для этого сообщения исчерпан. Отправьте новый запрос.",
            429,
          );
        await repository.save({
          ...context,
          pageReadContexts: nextReads,
          pageDiscoveryCalls: calls.map((record) =>
            record.callID === call.callID
              ? { ...record, status: "completed" }
              : record,
          ),
        });
      } else if (call.name === "pages_structure") {
        const snapshot = parsePageStructureContext(result);
        const nextStructures = [
          ...(context.pageStructureReadContexts ?? []),
          {
            callID: call.callID,
            requestHash,
            arguments: call.arguments,
            context: snapshot,
          },
        ];
        if (
          nextStructures.length > 8 ||
          Buffer.byteLength(JSON.stringify([reads, nextStructures]), "utf8") >
            384 * 1024
        )
          throw new EndpointError(
            "RATE_LIMITED",
            "Лимит сохранённых порций структуры исчерпан. Отправьте новый запрос.",
            429,
          );
        await repository.save({
          ...context,
          pageStructureReadContexts: nextStructures,
          pageDiscoveryCalls: calls.map((record) =>
            record.callID === call.callID
              ? { ...record, status: "completed" }
              : record,
          ),
        });
      } else {
        await repository.save({
          ...context,
          pageDiscoveryCalls: calls.map((record) =>
            record.callID === call.callID
              ? { ...record, status: "completed" }
              : record,
          ),
        });
      }
    });
    return result;
  } catch (error) {
    // Сбой не возвращает бюджет вызова и не превращает неподтверждённый результат в источник плана.
    await repository
      .locked(async (context) => {
        await repository.save({
          ...context,
          pageDiscoveryCalls: ledger(context).map((record) =>
            record.callID === call.callID && record.status === "pending"
              ? { ...record, status: "failed" }
              : record,
          ),
        });
      })
      .catch(() => undefined);
    throw error;
  }
};
