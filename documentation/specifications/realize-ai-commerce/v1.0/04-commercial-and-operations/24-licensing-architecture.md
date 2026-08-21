# 24. Licensing architecture

## 24.1. Реалистичная цель защиты

Нельзя гарантировать, что JavaScript-код или Docker image невозможно скопировать. Техническая защита должна сочетаться с:

- proprietary договором;
- контролируемой поставкой;
- signed images;
- private registry;
- central services;
- license enforcement;
- entitlement checks;
- отсутствием критических private keys в поставке.

Ценность должна находиться не только в коде контейнера, но и в AI execution, updates, лицензии, release service и сопровождении.

## 24.2. Installation identity

При первом запуске:

1. генерируется `installation_id`;
2. генерируется Ed25519 keypair;
3. private key хранится локально в secret storage;
4. public key отправляется на License Service;
5. activation request подписывается private key;
6. License Service создаёт installation record.

## 24.3. License lease

License Service выдаёт signed lease:

```json
{
  "license_id": "lic_...",
  "installation_id": "inst_...",
  "installation_public_key_hash": "...",
  "customer_id": "cus_...",
  "plan": "agency-commerce-pro",
  "environment": "production",
  "domains": ["shop.example.com"],
  "entitlements": {
    "ai": true,
    "code_changes": true,
    "production_deploy": true,
    "monthly_ai_credits": 5000,
    "max_concurrent_runs": 1,
    "premium_modules": ["seo-pro", "advanced-carousel"]
  },
  "issued_at": "...",
  "expires_at": "...",
  "grace_until": "...",
  "lease_version": 1
}
```

Lease подписывается private signing key центрального сервиса и проверяется embedded public verification key.

## 24.4. Domain binding

Domain — дополнительный сигнал, а не единственный идентификатор.

Нужны:

- production domains;
- staging domains;
- временная смена;
- migration workflow;
- DNS verification при необходимости.

Жёсткая привязка только к одному домену создаёт операционные проблемы и не защищает от копирования сама по себе.

## 24.5. License states

```text
UNACTIVATED
TRIAL
ACTIVE
GRACE
SUSPENDED
EXPIRED
REVOKED
INVALID
```

## 24.6. Поведение по состояниям

### ACTIVE/TRIAL

Все entitlements согласно plan.

### GRACE

- storefront работает;
- admin работает;
- существующий контент доступен;
- AI может быть ограничен warning/budget policy;
- renewal активно повторяется.

### SUSPENDED/EXPIRED после grace

- storefront работает;
- заказы и данные не блокируются;
- AI-run creation запрещён;
- production deployment запрещён;
- premium updates запрещены;
- operator может восстановить подписку.

### REVOKED/INVALID

- AI и deployment отключены;
- security alert;
- storefront не выключается автоматически;
- manual review.

## 24.7. Release protection

- private OCI registry;
- images pinned by digest;
- Cosign signature;
- SBOM attestation;
- release manifest signature;
- site pulls only allowed channel/version;
- unsigned image не запускается deployment controller.

## 24.8. Правовая часть

Потребуются отдельные документы, проверенные юристом:

- proprietary software license;
- SaaS/service agreement;
- acceptable use;
- support/SLA;
- privacy/DPA;
- AI usage disclosure;
- subcontractor list;
- OpenAI/API terms compliance;
- notices по MIT и другим open-source dependencies.

---

