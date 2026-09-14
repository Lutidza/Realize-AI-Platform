/**
 * @file packages/payload-ai-plugin/src/admin/dataOperationPresentation.util.ts
 * @version 1.2.0
 * @date 2026-09-14
 * @description Задаёт подписи записи и отката отдельно для каждого поддерживаемого изменения данных.
 */

import type { DataOperationDTO } from "@realize/ai-contracts";

/** Подписи не меняют lifecycle; создание, правка и удаление остаются различимы. */
export const dataOperationPresentation = (operation: DataOperationDTO) => {
  switch (operation.kind) {
    case "pages.publishDraft.v1":
    case "pages.restorePublication.v1": {
      const restore = operation.kind === "pages.restorePublication.v1";
      const remove = operation.preview.after.status === "unpublished";
      return {
        operation: restore
          ? "Восстановить публикацию"
          : "Опубликовать страницу",
        rollback: restore ? "Отдельная операция" : "Восстановление публикации",
        applied: remove ? "Публикация снята" : "Публикация сохранена",
        rolledBack: "Восстановление оформлено отдельно",
        approve: restore
          ? "Подтвердить восстановление публикации"
          : "Подтвердить публикацию",
        applyTitle: restore
          ? "Применить восстановление публикации"
          : "Опубликовать выбранную версию",
        applyHint:
          "Перед записью повторно проверим права, выбранную версию и текущую публикацию.",
        apply: restore
          ? remove
            ? "Снять публикацию"
            : "Восстановить публикацию"
          : "Опубликовать страницу",
        applying: restore ? "Восстанавливаем…" : "Публикуем…",
        result: "опубликована",
        rollbackTitle: "Восстановление публикации",
        rollbackHint: "Подготовьте отдельную подтверждаемую операцию.",
        approveRollback: "Подготовить восстановление публикации",
        rollbackApproved: "Восстановление подтверждено",
        rollbackReady: "Восстановление оформляется отдельно",
        rollbackReadyHint: "Рабочий черновик сохраняется.",
        executeRollback: "Восстановить публикацию",
        rollingBack: "Восстанавливаем…",
      };
    }
    case "pages.updateStructureDraft.v1":
      return {
        operation:
          operation.preview.action === "insert"
            ? "Добавить текстовый блок"
            : operation.preview.action === "move"
              ? "Переместить текстовый блок"
              : "Удалить текстовый блок",
        rollback: "Восстановление структуры",
        applied: "Структура черновика обновлена",
        rolledBack: "Структура восстановлена",
        approve: "Подтвердить изменение структуры",
        applyTitle: "Сохранить структуру в черновик",
        applyHint:
          "Перед записью повторно проверим права, схему и версию страницы.",
        apply: "Сохранить черновик",
        applying: "Сохраняем…",
        result: "обновлён",
        rollbackTitle: "Восстановить прежнюю структуру",
        rollbackHint:
          "Откат восстановит размещение и содержимое блока, если страницу после этой операции не изменяли и не публиковали.",
        approveRollback: "Подтвердить восстановление",
        rollbackApproved: "Восстановление структуры подтверждено",
        rollbackReady: "Восстановление структуры разрешено",
        rollbackReadyHint:
          "Перед восстановлением повторно проверим права, схему и неизменность страницы.",
        executeRollback: "Восстановить структуру",
        rollingBack: "Восстанавливаем…",
      };
    case "pages.createDraft.v1":
      return {
        operation: "Создать страницу",
        rollback: "Удаление черновика",
        applied: "Черновик создан",
        rolledBack: "Черновик удалён",
        approve: "Подтвердить создание",
        applyTitle: "Создать черновик страницы",
        applyHint:
          "Страница появится в разделе «Страницы». Опубликовать её можно после проверки в редакторе.",
        apply: "Создать черновик",
        applying: "Создаём…",
        result: "создан",
        rollbackTitle: "Удалить созданный черновик",
        rollbackHint:
          "Удаление возможно, только если страницу не изменяли и не публиковали после создания.",
        approveRollback: "Подтвердить удаление",
        rollbackApproved: "Удаление черновика подтверждено",
        rollbackReady: "Удаление черновика разрешено",
        rollbackReadyHint:
          "Перед удалением повторно проверим, что черновик не изменён и не опубликован.",
        executeRollback: "Удалить черновик",
        rollingBack: "Удаляем…",
      };
    case "pages.updateDraft.v1":
      return {
        operation: "Изменить черновик страницы",
        rollback: "Восстановление прежнего содержимого",
        applied: "Черновик обновлён",
        rolledBack: "Содержимое восстановлено",
        approve: "Подтвердить изменения",
        applyTitle: "Сохранить изменения в черновик",
        applyHint:
          "Перед записью повторно проверим права и версию страницы. Публикация остаётся отдельным действием.",
        apply: "Сохранить черновик",
        applying: "Сохраняем…",
        result: "обновлён",
        rollbackTitle: "Восстановить прежнее содержимое",
        rollbackHint:
          "Откат восстановит содержимое до изменения, только если страницу после этого не изменяли и не публиковали.",
        approveRollback: "Подтвердить восстановление",
        rollbackApproved: "Восстановление содержимого подтверждено",
        rollbackReady: "Восстановление содержимого разрешено",
        rollbackReadyHint:
          "Перед восстановлением повторно проверим права и неизменность версии страницы.",
        executeRollback: "Восстановить содержимое",
        rollingBack: "Восстанавливаем…",
      };
    case "catalog.assignCategory.v1":
      return {
        operation: "Назначить категорию",
        rollback: "Восстановление категорий",
        applied: "Применено",
        rolledBack: "Откат выполнен",
        approve: `Шаг 2 · Подтвердить v${operation.version}`,
        applyTitle: "Применить изменение категорий",
        applyHint:
          "Перед записью повторно проверим права и убедимся, что товар не изменился.",
        apply: "Шаг 3 · Применить",
        applying: "Применяем…",
        result: "",
        rollbackTitle: "Отменить изменение категорий",
        rollbackHint:
          "Откат восстановит прежние категории, если товар не менялся после применения.",
        approveRollback: "Подтвердить откат",
        rollbackApproved: "Откат подтверждён",
        rollbackReady: "Откат разрешён",
        rollbackReadyHint:
          "Перед откатом повторно проверим, что товар не изменился после применения.",
        executeRollback: "Выполнить откат",
        rollingBack: "Откатываем…",
      };
  }
};
