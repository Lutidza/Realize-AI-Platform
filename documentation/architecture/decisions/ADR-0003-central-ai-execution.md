# ADR-0003: Central AI execution

## Status

accepted-as-target

## Context

Чату нужны conversation lifecycle, streaming и cancellation, но браузер и клиентский site container не должны владеть OpenAI credentials или shell-доступом.

## Decision

Production Codex выполняется в центральном изолированном worker через Codex App Server по private stdio/Unix-socket boundary. Site plugin обращается к control plane через authenticated service contract. App Server не публикуется в браузер или публичный интернет.

Для локальной разработки разрешён отдельный loopback-only adapter process с пользовательской Codex authentication. Это development boundary, а не production topology.

## Consequences

- постоянный OpenAI key не хранится в Payload DB и site image;
- browser chat является UI, а не executor;
- первая capability — только repository read в sandbox;
- write tools, production credentials и Docker socket отсутствуют у read-only worker-а;
- provider-specific protocol скрыт за `CodingAgentAdapter`.
