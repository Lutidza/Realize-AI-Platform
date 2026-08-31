# Этап 0L. Security и repository hygiene

> **Статус: historical evidence.** Этот файл фиксирует выполненный EPIC-000
> и не является активной инструкцией. Актуальный roadmap находится в разделе
> `05-implementation-roadmap`, а порядок работ — в главе 32.

Проверь:

- secrets в tracked files и history, доступной локально;
- `.env.example` без реальных значений;
- `.gitignore` для IDE/runtime/build/test artifacts;
- `.idea` policy;
- отсутствие tracked `.next`, reports, runtime DB/logs;
- security headers/config там, где уже существует owner;
- access defaults Payload;
- Stripe test-only environment;
- отсутствие слабых fallback secrets в production path;
- generated files policy;
- package license metadata.

Не переписывай историю Git без отдельного подтверждения.

По лицензии продукта создай ADR со статусом `proposed`. Не выдавай юридическое заключение. Зафиксируй, что будущая коммерческая дистрибуция потребует проприетарного EULA/договора и корректного учёта лицензий зависимостей.

---
