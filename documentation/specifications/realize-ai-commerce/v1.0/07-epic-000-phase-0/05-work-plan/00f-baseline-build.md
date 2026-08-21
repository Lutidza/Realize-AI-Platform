# Этап 0F. Baseline build

В чистом окружении выполни:

```text
install
lint
typecheck
integration tests
production build
```

Перед командами:

- проверь Node/npm;
- проверь environment prerequisites;
- не используй реальные production secrets;
- используй локальную тестовую PostgreSQL;
- зафиксируй точные команды.

При ошибках:

1. классифицируй root cause;
2. найди owner-layer;
3. исправляй минимально;
4. не скрывай ошибку через blanket ignore;
5. повтори релевантную проверку;
6. сохрани evidence в execution log.

Если install заблокирован сетью/registry, отметь `blocked`, приложи точную ошибку и продолжи только статический анализ. Нельзя объявлять build green.

