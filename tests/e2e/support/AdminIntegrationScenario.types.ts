/**
 * @file tests/e2e/support/AdminIntegrationScenario.types.ts
 * @version 1.0.0
 * @date 2026-09-09
 * @description Задаёт результаты SQL-проверок временного GitHub-подключения в браузерном тесте.
 */

/** Количество подключений для защиты существующей записи от сценария сохранения. */
export type IntegrationRowCount = {
  count: string;
};

/** Поля подключения, созданного самим тестом, для проверки зашифрованного хранения. */
export type StoredGitHubIntegrationRow = {
  credential_envelope: string;
  revision: string;
  repository_slug: string;
};
