# 17. Preview strategy

## 17.1. Content preview

Для обычных content changes используются:

- Payload drafts;
- autosave при необходимости;
- Payload Live Preview;
- draft access token;
- iframe/postMessage integration.

## 17.2. Code preview

Payload Live Preview не заменяет code preview.

Для code changes требуется ephemeral deployment:

- отдельный image digest;
- отдельный hostname;
- отдельный environment config;
- read-only или cloned production media;
- cloned/sanitized database;
- TTL и auto cleanup.

## 17.3. Database strategy preview

### Без schema change

Допустимо:

- clone текущей базы;
- либо отдельный draft overlay, если change чисто content.

### Со schema change

Обязателен отдельный database clone. Нельзя применять preview migration к production DB.

## 17.4. PII sanitization

При клонировании:

- emails маскируются;
- phones маскируются;
- addresses маскируются;
- payment tokens не копируются;
- auth secrets заменяются;
- webhook endpoints отключаются;
- outgoing email/SMS блокируются;
- external integrations переводятся в sandbox/mock.

---

