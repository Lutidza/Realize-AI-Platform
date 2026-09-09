/**
 * @file packages/codex-adapter/src/CodexLogin.error.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Передаёт безопасную причину отказа авторизации без текста внешнего протокола.
 */

import type { CodexLoginFailureCode } from "./CodexLoginFailure.types";

const MESSAGES: Record<CodexLoginFailureCode, string> = {
  login_cancelled: "Вход отменён. Начните новую попытку авторизации.",
  device_auth_disabled:
    "В ChatGPT не разрешён вход по коду устройства. Включите его в настройках безопасности и начните новый вход.",
  account_restricted:
    "OpenAI не разрешил доступ к аккаунту или рабочему пространству. Проверьте разрешения Codex для выбранного аккаунта.",
  code_expired:
    "OpenAI отклонил одноразовый код входа. Начните новую попытку и используйте ссылку или код из неё.",
  network_failed:
    "Сервер CMS не смог завершить соединение с OpenAI. Проверьте сеть или настройки прокси на сервере.",
  token_exchange_failed:
    "OpenAI не завершил обмен кода на данные доступа. Начните новый вход; если ошибка повторится, требуется проверка серверного соединения с OpenAI.",
  credential_store_failed:
    "Codex не смог сохранить данные входа на сервере. Проверьте доступ процесса к своему каталогу авторизации.",
  provider_rejected:
    "OpenAI не подтвердил завершение входа. Проверьте результат на странице OpenAI и начните новую попытку.",
};

/** code и message берутся из фиксированного списка; исходный cause намеренно не сохраняется. */
export class CodexLoginError extends Error {
  constructor(readonly code: CodexLoginFailureCode) {
    super(MESSAGES[code]);
    this.name = "CodexLoginError";
  }
}
