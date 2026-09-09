# Стандарт именования и структуры кода

Требования закреплены в операционном слое и применяются к собственному коду
приложения, пакетов, сервисов и инструментов. Этот документ служит навигацией;
нормативный текст хранится у владельцев правил.

| Область                                                          | Правило                                                                                 | Проверка                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Ответственность, компоненты, хуки, типы, каталоги, переносимость | [Структура кода](../../.ai/rules/development/RULE-CODE-STRUCTURE.md)                    | [Структура](../../.ai/checks/development/CHECK-CODE-STRUCTURE.md)                      |
| Имена файлов, каталогов и символов, точки входа                  | [Именование](../../.ai/rules/development/RULE-CODE-NAMING.md)                           | [Именование](../../.ai/checks/development/CHECK-CODE-NAMING.md)                        |
| Шапки, версии, даты и комментарии                                | [Комментарии](../../.ai/rules/development/RULE-CODE-COMMENT-DISCIPLINE.md)              | [Комментарии](../../.ai/checks/development/CHECK-CODE-COMMENT-DISCIPLINE.md)           |
| Публичные данные Payload и DTO                                   | [Границы DTO](../../.ai/rules/development/backend/RULE-DTO-CONTRACTS-NO-RAW-PAYLOAD.md) | [DTO](../../.ai/checks/development/backend/CHECK-DTO-CONTRACTS-NO-RAW-PAYLOAD.md)      |
| Потребители и старые пути после рефакторинга                     | [Очистка](../../.ai/rules/scope-control/RULE-STALE-ARTIFACT-CLEANUP-AFTER-REFACTOR.md)  | [Очистка](../../.ai/checks/self-review/CHECK-STALE-ARTIFACT-CLEANUP-AFTER-REFACTOR.md) |

Фактические владельцы и расположение кода описаны в
[структуре проекта](project-structure.md). Процедура Codex для архитектурной
работы — [навык декомпозиции](../../.codex/skills/feature-decomposition-guard/SKILL.md).
