# Realize

Realize — AI-управляемая CMS-платформа для создания, эксплуатации и развития
сайтов разных типов. E-commerce — первый промышленный профиль текущего
репозитория, а не ограничение платформенного ядра.

## Текущий baseline

- Next.js 16.3, React 19.2, Payload CMS 3.88 и PostgreSQL.
- Single-tenant deployment: отдельное приложение и база данных на инсталляцию.
- Payload Admin с `/admin/ai`, approval-gated Change Requests, первым Data Lane,
  изолированным code execution, local preview, source promotion и
  release-candidate foundation.
- Production authorization/deploy controller, полный универсальный capability
  registry и настраиваемый installation AI-layer ещё не завершены.

Подробное разграничение target/current/history находится в
[документации](documentation/INDEX.md).

## Локальный запуск

Требуются Node.js 24.18.x, npm 11.15.x и PostgreSQL.

```bash
npm install
npm run verify:runtime
npm run payload:migrate
npm run dev
```

AI control plane и execution worker запускаются отдельными процессами только
для соответствующего development workflow:

```bash
npm run ai:control-plane
npm run ai:execution-worker
```

Переменные окружения берутся из `.env.example`. Secrets, runtime state,
database dumps и preview artifacts не должны попадать в Git.

## Навигация

- [Контекст и фактическое состояние](documentation/project-context.md)
- [Master specification v1.0](documentation/REALIZE_AI_COMMERCE_MASTER_SPEC_v1.0_RU.md)
- [Архитектурные решения](documentation/architecture/decisions/INDEX.md)
- [Delivery runbooks](documentation/delivery/INDEX.md)
- [AI operating layer](.ai/README.md)
- [Codex adapter layer](.codex/README.md)
