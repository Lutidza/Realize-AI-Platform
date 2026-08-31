# 27. Docker и infrastructure

- **Статус:** target specification

## 27.1. Installation topology

Каждая клиентская installation имеет отдельные web runtime, PostgreSQL,
media namespace, secrets, backups и deployment state. Reverse proxy/TLS,
monitoring и central services могут быть общими только при строгой identity и
network isolation.

Site container не содержит OpenAI, registry, GitHub или production deploy
credentials. PostgreSQL и internal services не публикуются в Internet.

## 27.2. Execution topology

AI execution и build происходят вне site container в trusted worker pool.
Worker использует ephemeral workspace, ограниченный network, short-lived
capability и отдельный service identity. Docker socket/host root не передаются
модели.

Preview получает отдельный Compose/project namespace, sanitized database/media,
authentication, TTL и cleanup. Production volume или network к preview не
подключаются.

## 27.3. Secrets и backups

Secrets поступают из operator-owned environment/vault и никогда не встраиваются
в image или Git. Backup шифруется, имеет retention и регулярно проходит
restore drill. Single-host V1 обязан честно фиксировать отсутствие multi-host
HA и off-site recovery, если они не настроены.
