# Grüns Link Base: Entity and Template Groups

Дата нормализации: 2026-07-14.
Источник: [.ai/research/gruns-site-link-inventory-2026-07-14.md](/home/tom/Server/Realize/Realize-E-Commerce/.ai/research/gruns-site-link-inventory-2026-07-14.md).
Объем: 217 URL.

Цель: перегруппировать собранную базу ссылок не по sitemap-разделам, а по будущим сущностям Payload/commerce и шаблонам интерфейса, чтобы затем использовать эти группы как карту UI-референсов.

## Сводка по старым типам

| Старый тип из inventory | URL |
|---|---:|
| Маркетинговый лендинг | 105 |
| Статья блога | 24 |
| PDP / товар | 16 |
| Тест/служебная | 14 |
| Партнерский лендинг | 14 |
| Страница | 9 |
| Сервисная | 7 |
| Бренд/доверие | 6 |
| Коллекция | 5 |
| Юридическая | 5 |
| Раздел блога | 4 |
| Policy / legal | 4 |
| Главная | 1 |
| Аккаунт / логин | 1 |
| AI/agent policy | 1 |
| Корзина | 1 |

## Нормализованная карта сущностей и шаблонов

| Группа | Сущность | Будущий шаблон | URL | В UI refs | Приоритет | Примеры URL | Заметка |
|---|---|---|---:|---|---|---|---|
| commerce.collection | Collection | Collection / PLP | 5 | Да | P0 | /collections/all<br>/collections/canal-products<br>/collections/gift-with-purchase<br>/collections/merch | Нужен для каталога, фильтров, сортировки и навигации. |
| commerce.product.nutrition-adult | Product | PDP / nutrition adult | 3 | Да | P0 | /products/gruns<br>/products/gruns-firecracker<br>/products/raspberry-lemonade-gruns | Базовый PDP: buybox, subscription, ingredients, reviews, FAQ. |
| commerce.product.nutrition-kids | Product | PDP / nutrition kids | 3 | Да | P0 | /products/gruns-kids<br>/products/gruns-kids-firecracker<br>/products/raspberry-lemonade-gruns-kids | Важен отдельный claims/benefits блок и возрастная коммуникация. |
| storefront.home | Global/Home | Home storefront | 1 | Да | P0 | / | Главный референс первой страницы магазина. |
| brand.trust-science | BrandPage | Brand trust / science / story | 5 | Да | P1 | /pages/bro-science-life-inf<br>/pages/how-gruns-works<br>/pages/our-story<br>/pages/reviews | Референсы для доверия, состава, отзывов, научных блоков. |
| commerce.product.merch | Product | PDP / merch | 6 | Да | P1 | /products/gruns-ecosoft-cotton-lyocell-midweight-tee<br>/products/gruns-good-greens-club-hat<br>/products/gruns-kids-cozy-fleece-hoodie<br>/products/gruns-logo-hat | Отличается от nutrition PDP атрибутами, вариантами и media grid. |
| commerce.product.subscription-upsell | Product | PDP / subscription upsell | 4 | Да | P1 | /products/upgrade-to-quarterly-on-next-order<br>/products/upgrade-to-quarterly-on-next-order-1<br>/products/upgrade-to-quarterly-on-next-order-2<br>/products/upgrade-to-quarterly-on-next-order-3 | Отдельный buybox-сценарий для подписки и апселов. |
| marketing.lead-capture | CampaignPage | Lead capture / subscribe landing | 9 | Да | P1 | /pages/birthday-subscribe-page<br>/pages/delivery-subscribe-page<br>/pages/expo-gruns-subscribe-page<br>/pages/fast-subscribe-page | Нужен компактный capture flow: form, offer, compliance copy. |
| marketing.partner-collab | CampaignPage | Partner / influencer / collab landing | 24 | Да | P1 | /pages/barbara-corcoran<br>/pages/edit-a-box<br>/pages/first-order-olipop-kids<br>/pages/forbes-new-year | Нужен reusable landing shell с partner hero, offer, proof и CTA. |
| marketing.performance-offer | CampaignPage | Performance offer landing | 33 | Да | P1 | /pages/benefits-gwp<br>/pages/benefits-lr<br>/pages/first-order-antoni<br>/pages/first-order-applovin-gwp | Главная группа для рекламных лендингов и A/B вариантов. |
| marketing.retention-member | CampaignPage | Retention / member / subscription landing | 4 | Да | P1 | /pages/exclusives<br>/pages/member-homepage<br>/pages/upgrade-to-quarterly<br>/pages/vip-access | Референс retention flows и подписочных CTA. |
| marketing.seo-benefit | CampaignPage | SEO benefit / ingredient landing | 50 | Да | P1 | /pages/bone-health<br>/pages/collagen<br>/pages/fiber<br>/pages/fiber-applovin-gwp | Нужны reusable blocks для claims, evidence, comparisons и CTA. |
| content.blog-article | Post | Blog article | 24 | Да | P2 | /blogs/bear-necessities/ag1-vs-gruns-which-green-supplement-wins-for-daily-nutrition<br>/blogs/bear-necessities/supercharge-your-health-with-green-supplements-a-complete-guide<br>/blogs/bear-necessities/top-natural-multivitamin-alternatives-busy-lives-2025<br>/blogs/news/grns-your-daily-gummy-super-greens-weight-goals | Article template, TOC, related products/articles, SEO schema. |
| content.blog-section | BlogCategory | Blog section / listing | 4 | Да | P2 | /blogs/bear-necessities<br>/blogs/news<br>/blogs/supergreens<br>/blogs/vitamins | Листинг статей и SEO-навигация. |
| service.support-program | ServicePage | Support / program page | 7 | Да | P2 | /pages/contact<br>/pages/creators<br>/pages/help-center<br>/pages/partners-program | Нужны простые функциональные страницы, формы и списки. |
| content.generic-page | Page | Generic CMS / microsite page | 9 | Частично | P3 | /pages/dad-lander-1<br>/pages/discounts-and-coupons<br>/pages/home-taste-information<br>/pages/homepage-theme-new-buybox | Использовать как long-tail Page шаблон, не как основной референс. |
| legal.policy | LegalPage | Legal / policy page | 9 | Частично | P3 | /pages/2026-sweepstakes-terms-and-conditions-gruns-x-gotham-fc<br>/pages/authorized-resale-policy<br>/pages/monthly-apple-watch-giveaway-official-rules<br>/pages/official-rules-gruns-x-skylight | Нужен простой rich text шаблон; не является визуальным UI-референсом. |
| utility.system-route | SystemRoute | Utility route | 3 | Частично | P3 | /a/account/login<br>/agents.md<br>/cart | Cart важен для commerce UX; account/agents фиксируются отдельно. |
| internal.qa-test | InternalPage | QA / internal test page | 14 | Нет | Exclude | /pages/andrew-qa-testing<br>/pages/bb-test-1<br>/pages/bb-test-2-old<br>/pages/buybox-qa | Исключить из референсов, оставить как сигнал о вариантах экспериментов. |

## Как читать для будущего интерфейса

- P0: ядро ecommerce, которое нужно проектировать первым: home, PLP, PDP, cart.
- P1: основные reference-группы для маркетинговых и trust-шаблонов: campaign landings, SEO/benefit pages, partner pages, retention/lead capture.
- P2: контентные и сервисные шаблоны, важны после базового storefront.
- P3: простые generic/legal/system pages, проектируются как low-complexity CMS templates.
- Exclude: QA/test pages не берем как визуальный референс, но фиксируем как сигнал об A/B и экспериментальных вариациях.

## Полная группировка URL

### commerce.collection

- Entity: Collection
- Template: Collection / PLP
- Reference priority: P0; include in UI references: Да
- Count: 5

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 2 | https://gruns.co/collections/all | Products - Grüns | Коллекция | Коллекция/PLP | 200 |
| 3 | https://gruns.co/collections/canal-products | Canal Products - Grüns | Коллекция | Коллекция/PLP | 200 |
| 4 | https://gruns.co/collections/gift-with-purchase | Gift With Purchase - Grüns | Коллекция | Промо-коллекция | 200 |
| 5 | https://gruns.co/collections/merch | Ü Snacks Shack - Grüns | Коллекция | Коллекция мерча | 200 |
| 6 | https://gruns.co/collections/shop-gruns | Shop Grüns \| Multivitamin Gummies for Comprehensive Daily Nutrition | Коллекция | Основная shop-коллекция | 200 |

### commerce.product.nutrition-adult

- Entity: Product
- Template: PDP / nutrition adult
- Reference priority: P0; include in UI references: Да
- Count: 3

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 7 | https://gruns.co/products/gruns | Grüns | PDP / товар | Основная взрослая nutrition-линейка | 200 |
| 9 | https://gruns.co/products/gruns-firecracker | Popsicle® Firecracker Grüns \| Daily Nutrition Support | PDP / товар | Основная взрослая nutrition-линейка | 200 |
| 17 | https://gruns.co/products/raspberry-lemonade-gruns | Grüns Raspberry Lemonade \| Daily Nutrition Support | PDP / товар | Основная взрослая nutrition-линейка | 200 |

### commerce.product.nutrition-kids

- Entity: Product
- Template: PDP / nutrition kids
- Reference priority: P0; include in UI references: Да
- Count: 3

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 11 | https://gruns.co/products/gruns-kids | Grüns Kids | PDP / товар | Детская nutrition-линейка | 200 |
| 13 | https://gruns.co/products/gruns-kids-firecracker | Popsicle® Firecracker Grüns Kids \| Daily Nutrition Support | PDP / товар | Детская nutrition-линейка | 200 |
| 18 | https://gruns.co/products/raspberry-lemonade-gruns-kids | Grüns Kids Raspberry Lemonade \| Daily Nutrition Support | PDP / товар | Детская nutrition-линейка | 200 |

### storefront.home

- Entity: Global/Home
- Template: Home storefront
- Reference priority: P0; include in UI references: Да
- Count: 1

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 1 | https://gruns.co/ | Grüns Daily Nutrition | Главная | Главная витрина бренда и commerce funnel | 200 |

### brand.trust-science

- Entity: BrandPage
- Template: Brand trust / science / story
- Reference priority: P1; include in UI references: Да
- Count: 5

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 33 | https://gruns.co/pages/bro-science-life-inf | Grüns Daily Nutrition | Бренд/доверие | Science, reviews, story, how it works | 200 |
| 101 | https://gruns.co/pages/how-gruns-works | How Grüns Works \| Grüns | Бренд/доверие | Science, reviews, story, how it works | 200 |
| 138 | https://gruns.co/pages/our-story | Our Story \| Grüns | Бренд/доверие | Science, reviews, story, how it works | 200 |
| 151 | https://gruns.co/pages/reviews | Grüns Gummies Reviews \| Grüns | Бренд/доверие | Science, reviews, story, how it works | 200 |
| 156 | https://gruns.co/pages/science | Science - Grüns | Бренд/доверие | Science, reviews, story, how it works | 200 |

### commerce.product.merch

- Entity: Product
- Template: PDP / merch
- Reference priority: P1; include in UI references: Да
- Count: 6

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 8 | https://gruns.co/products/gruns-ecosoft-cotton-lyocell-midweight-tee | The Call Me Tee - Grüns | PDP / товар | Мерч с размером/вариантами | 200 |
| 10 | https://gruns.co/products/gruns-good-greens-club-hat | Good Greens Club Hat - Grüns | PDP / товар | Мерч с размером/вариантами | 200 |
| 12 | https://gruns.co/products/gruns-kids-cozy-fleece-hoodie | The Kids Hüdie - Grüns | PDP / товар | Мерч с размером/вариантами | 200 |
| 14 | https://gruns.co/products/gruns-logo-hat | Grüns Trucker Hat | PDP / товар | Мерч с размером/вариантами | 200 |
| 15 | https://gruns.co/products/gruns-retro-washed-fleece-hoodie | The Bodega Hüdie - Grüns | PDP / товар | Мерч с размером/вариантами | 200 |
| 16 | https://gruns.co/products/gruns-spacious-canvas-tote-with-color-zipper-pocket | Grüns Bodega Tote | PDP / товар | Мерч с размером/вариантами | 200 |

### commerce.product.subscription-upsell

- Entity: Product
- Template: PDP / subscription upsell
- Reference priority: P1; include in UI references: Да
- Count: 4

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 19 | https://gruns.co/products/upgrade-to-quarterly-on-next-order | Upgrade to Quarterly on Next Order - Grüns | PDP / товар | Апселл подписки / next order upgrade | 200 |
| 20 | https://gruns.co/products/upgrade-to-quarterly-on-next-order-1 | Upgrade to Quarterly on Next Order - Grüns | PDP / товар | Апселл подписки / next order upgrade | 200 |
| 21 | https://gruns.co/products/upgrade-to-quarterly-on-next-order-2 | Upgrade to Quarterly on Next Order - Grüns | PDP / товар | Апселл подписки / next order upgrade | 200 |
| 22 | https://gruns.co/products/upgrade-to-quarterly-on-next-order-3 | Upgrade to Quarterly on Next Order - Grüns | PDP / товар | Апселл подписки / next order upgrade | 200 |

### marketing.lead-capture

- Entity: CampaignPage
- Template: Lead capture / subscribe landing
- Reference priority: P1; include in UI references: Да
- Count: 9

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 31 | https://gruns.co/pages/birthday-subscribe-page | BIRTHDAY Subscribe Page - Grüns | Маркетинговый лендинг | SMS/email/subscription signup page | 200 |
| 39 | https://gruns.co/pages/delivery-subscribe-page | DELIVERY Subscribe Page - Grüns | Маркетинговый лендинг | SMS/email/subscription signup page | 200 |
| 44 | https://gruns.co/pages/expo-gruns-subscribe-page | Sign Up to Receive Text Messages from Grüns | Маркетинговый лендинг | SMS/email/subscription signup page | 200 |
| 45 | https://gruns.co/pages/fast-subscribe-page | FAST Subscribe Page - Grüns | Маркетинговый лендинг | SMS/email/subscription signup page | 200 |
| 104 | https://gruns.co/pages/insider-subscribe-page | INSIDER Subscribe Page - Grüns | Маркетинговый лендинг | SMS/email/subscription signup page | 200 |
| 124 | https://gruns.co/pages/mystery-subscribe-page | MYSTERY Subscribe Page - Grüns | Маркетинговый лендинг | SMS/email/subscription signup page | 200 |
| 157 | https://gruns.co/pages/secret-subscribe-page | SECRET Subscribe Page - Grüns | Маркетинговый лендинг | SMS/email/subscription signup page | 200 |
| 169 | https://gruns.co/pages/sustainable-subscribe-page | SUSTAINABLE Subscribe Page - Grüns | Маркетинговый лендинг | SMS/email/subscription signup page | 200 |
| 181 | https://gruns.co/pages/welcome-subscribe-page | WELCOME Subscribe Page - Grüns | Маркетинговый лендинг | SMS/email/subscription signup page | 200 |

### marketing.partner-collab

- Entity: CampaignPage
- Template: Partner / influencer / collab landing
- Reference priority: P1; include in UI references: Да
- Count: 24

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 26 | https://gruns.co/pages/barbara-corcoran | Barbara Corcoran - Grüns | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 42 | https://gruns.co/pages/edit-a-box | Edit a box - Grüns | Маркетинговый лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 63 | https://gruns.co/pages/first-order-olipop-kids | Grüns Kids & OLIPOP® Strawberry & Vanilla Gummies | Маркетинговый лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 72 | https://gruns.co/pages/forbes-new-year | Grüns \| Comprehensive Daily Nutrition | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 73 | https://gruns.co/pages/frontera | Grüns & Frontera - Something good for kids | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 81 | https://gruns.co/pages/gotham-fc | Grüns \| Comprehensive Daily Nutrition | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 86 | https://gruns.co/pages/gruns-nutrition-x-olipop-make-it-official-giveaway | GRÜNS NUTRITION x OLIPOP “MAKE IT OFFICIAL GIVEAWAY” - Grüns | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 87 | https://gruns.co/pages/gruns-olipop-festival | MAKE IT OFFICIAL GIVEAWAY - LANDING PAGE - Grüns | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 88 | https://gruns.co/pages/gruns-x-morning-brew | Grüns x Morning Brew - Exclusive Offer | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 89 | https://gruns.co/pages/gruns-x-throne-science-win-a-throne-giveaway | GRUNS x THRONE SCIENCE “WIN A THRONE” GIVEAWAY - Grüns | Бренд/доверие | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 96 | https://gruns.co/pages/gut-health-x-skin | Gut Health x Skin - Grüns | Маркетинговый лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 116 | https://gruns.co/pages/lisa-rinna-please-persist | Grüns Daily Nutrition | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 129 | https://gruns.co/pages/nutrition-support-olipop | Grüns Daily Nutrition | Маркетинговый лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 134 | https://gruns.co/pages/olipop-kids-surprise25 | Grüns Kids & OLIPOP® Strawberry & Vanilla Gummies | Маркетинговый лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 135 | https://gruns.co/pages/olipop-surprise25 | Grüns & OLIPOP® Strawberry & Vanilla Gummies | Маркетинговый лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 136 | https://gruns.co/pages/olipop-teaser-email | Grüns & OLIPOP® Strawberry & Vanilla Gummies | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 137 | https://gruns.co/pages/olipop-vip | Grüns OLIPOP® \| Comprehensive Daily Nutrition | Маркетинговый лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 152 | https://gruns.co/pages/robby-berger | Robby Berger - Grüns | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 158 | https://gruns.co/pages/shaun-white | Shaun White \| Grüns \| Comprehensive Daily Nutrition | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 160 | https://gruns.co/pages/skylight-win-a-free-calendar | Grüns Kids x Skylight: Win a Free Calendar | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 166 | https://gruns.co/pages/surprise-olipop-kids | Grüns Kids & OLIPOP® Strawberry & Vanilla Gummies | Маркетинговый лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 171 | https://gruns.co/pages/tamron-hall | Tamron Hall - Grüns | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 172 | https://gruns.co/pages/tamron-hall-first-order | Tamron Hall First Order - Grüns | Маркетинговый лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |
| 173 | https://gruns.co/pages/tmobile-tuesday | Grüns \| Comprehensive Daily Nutrition | Партнерский лендинг | Партнерский offer, giveaway или инфлюенсерская посадочная | 200 |

### marketing.performance-offer

- Entity: CampaignPage
- Template: Performance offer landing
- Reference priority: P1; include in UI references: Да
- Count: 33

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 29 | https://gruns.co/pages/benefits-gwp | Grüns \| Comprehensive Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 30 | https://gruns.co/pages/benefits-lr | Grüns Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 52 | https://gruns.co/pages/first-order-antoni | First Order Antoni - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 53 | https://gruns.co/pages/first-order-applovin-gwp | First Order Applovin GWP - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 54 | https://gruns.co/pages/first-order-benefits | First Order Benefits - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 62 | https://gruns.co/pages/first-order-nurse-john | First Order Nurse John - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 66 | https://gruns.co/pages/first-order-theme-new-buybox | First Order Theme (New Buybox) - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 67 | https://gruns.co/pages/first-order-tof | Grüns Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 69 | https://gruns.co/pages/flip-to-win | Flip To Win - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 70 | https://gruns.co/pages/flip-to-win-glp-1 | Flip to Win — GLP-1 - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 71 | https://gruns.co/pages/fo-snapchat-gwp | First Order - Snapchat GWP - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 74 | https://gruns.co/pages/gift-quiz | Gift Quiz - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 76 | https://gruns.co/pages/glp-gwp-flip-to-win | GLP Flip To Win - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 77 | https://gruns.co/pages/glp-gwp-listicle | Grüns \| Comprehensive Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 78 | https://gruns.co/pages/glp-gwp-listicle-google | Grüns \| Comprehensive Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 79 | https://gruns.co/pages/glp-gwp-listicle-youtube | Grüns \| Comprehensive Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 80 | https://gruns.co/pages/glp-gwp-pdp | Grüns \| Comprehensive Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 84 | https://gruns.co/pages/gruns-family-bundle | Grüns Family Bundle | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 85 | https://gruns.co/pages/gruns-kids-daily | Grüns Kids Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 105 | https://gruns.co/pages/kids-convenience-3 | Kids Convenience 3 - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 106 | https://gruns.co/pages/kids-daily | Grüns Kids \| Daily Nutrition for Kids | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 107 | https://gruns.co/pages/kids-family-ritual | Grüns Kids \| Daily Nutrition for the Whole Family | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 108 | https://gruns.co/pages/kids-first-order-gifts-3 | Kids First Order Gifts 3 - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 109 | https://gruns.co/pages/kids-food-allergy | Grüns Kids \| Comprehensive Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 110 | https://gruns.co/pages/kids-growth-spurt | Grüns Kids \| Comprehensive Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 111 | https://gruns.co/pages/kids-health-hacks | Kids Health Hacks - Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 113 | https://gruns.co/pages/kids-screen-time | Grüns Kids \| Comprehensive Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 114 | https://gruns.co/pages/limited-time-flavors | Grüns \| Comprehensive Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 117 | https://gruns.co/pages/lr | Grüns Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 123 | https://gruns.co/pages/mothers-day-bundle | Mother's Day Bundle: Adult + Kids Gummies \| Grüns | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 140 | https://gruns.co/pages/partner-shopper | Grüns Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 168 | https://gruns.co/pages/surprise-u | Grüns \| Comprehensive Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |
| 177 | https://gruns.co/pages/uzo-inf-benefits-listicle | Grüns Daily Nutrition | Маркетинговый лендинг | First order, GWP, bundle, quiz, flavor, surprise, promo | 200 |

### marketing.retention-member

- Entity: CampaignPage
- Template: Retention / member / subscription landing
- Reference priority: P1; include in UI references: Да
- Count: 4

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 43 | https://gruns.co/pages/exclusives | Grüns Exclüsives – Member-Only Perks & Savings | Маркетинговый лендинг | Member perks, edit box, upgrade, VIP access | 200 |
| 120 | https://gruns.co/pages/member-homepage | Member Homepage - Grüns | Маркетинговый лендинг | Member perks, edit box, upgrade, VIP access | 200 |
| 175 | https://gruns.co/pages/upgrade-to-quarterly | Upgrade to Quarterly - Grüns | Маркетинговый лендинг | Member perks, edit box, upgrade, VIP access | 200 |
| 179 | https://gruns.co/pages/vip-access | VIP Access - Grüns | Маркетинговый лендинг | Member perks, edit box, upgrade, VIP access | 200 |

### marketing.seo-benefit

- Entity: CampaignPage
- Template: SEO benefit / ingredient landing
- Reference priority: P1; include in UI references: Да
- Count: 50

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 32 | https://gruns.co/pages/bone-health | Bone Health - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 35 | https://gruns.co/pages/collagen | Collagen - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 46 | https://gruns.co/pages/fiber | Fiber - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 47 | https://gruns.co/pages/fiber-applovin-gwp | Fiber - Applovin GWP - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 48 | https://gruns.co/pages/fiber-men | Fiber Men - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 49 | https://gruns.co/pages/fiber-snapchat-gwp | Fiber Snapchat GWP - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 50 | https://gruns.co/pages/firecracker-chicago | Popsicle® Firecracker Grüns \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 51 | https://gruns.co/pages/firecracker-vip | Popsicle® Firecracker Grüns \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 55 | https://gruns.co/pages/first-order-firecracker | Popsicle® Firecracker Grüns \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 56 | https://gruns.co/pages/first-order-firecracker-applovin | Popsicle® Firecracker Grüns \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 57 | https://gruns.co/pages/first-order-firecracker-snapchat | Popsicle® Firecracker Grüns \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 58 | https://gruns.co/pages/first-order-gut-health | First Order Gut Health - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 59 | https://gruns.co/pages/first-order-kids-firecracker | Popsicle® Firecracker Grüns Kids \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 60 | https://gruns.co/pages/first-order-kids-raspberry-lemonade | Grüns Kids Raspberry Lemonade \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 61 | https://gruns.co/pages/first-order-kids-raspberry-lemonade-gwp | Grüns Kids Raspberry Lemonade \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 64 | https://gruns.co/pages/first-order-raspberry-lemonade | Grüns Raspberry Lemonade \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 65 | https://gruns.co/pages/first-order-raspberry-lemonade-gwp | Grüns Raspberry Lemonade \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 68 | https://gruns.co/pages/first-order-weight-loss | First Order Weight Loss - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 75 | https://gruns.co/pages/glp-1-teeth-gwp | Grüns Daily Nutrition | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 82 | https://gruns.co/pages/green-powders-gwp | Green Powders Listicle GWP - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 83 | https://gruns.co/pages/green-powders-listicle | Green Powders Listicle - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 90 | https://gruns.co/pages/gut-health-applovin-gwp | Gut Health - Applovin GWP - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 91 | https://gruns.co/pages/gut-health-girlie | Grüns Daily Nutrition | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 92 | https://gruns.co/pages/gut-health-girlie-gwp | Grüns Daily Nutrition | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 93 | https://gruns.co/pages/gut-health-ibs-thiamine | Grüns Daily Nutrition | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 94 | https://gruns.co/pages/gut-health-snapchat-gwp | Gut Health - Snapchat GWP - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 95 | https://gruns.co/pages/gut-health-travel | Gut Health Travel - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 118 | https://gruns.co/pages/male-fertility | Grüns Daily Nutrition | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 119 | https://gruns.co/pages/male-fertility-gwp | Grüns Daily Nutrition | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 121 | https://gruns.co/pages/methylation | Grüns \| Comprehensive Daily Nutrition | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 125 | https://gruns.co/pages/nutrition-support-applovin-gwp | Nutrition Support Applovin GWP - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 126 | https://gruns.co/pages/nutrition-support-hair-loss | Nutrition Support Hair Loss - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 127 | https://gruns.co/pages/nutrition-support-men | nutrition-support-men - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 128 | https://gruns.co/pages/nutrition-support-muscle | Grüns Daily Nutrition | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 130 | https://gruns.co/pages/nutrition-support-snapchat-gwp | GLP Enhanced PDP - Snapchat GWP - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 131 | https://gruns.co/pages/nutrition-support-teeth | Grüns Daily Nutrition | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 132 | https://gruns.co/pages/nutrition-support-tof | Grüns Daily Nutrition | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 142 | https://gruns.co/pages/pcos | PCOS - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 144 | https://gruns.co/pages/perimenopause | Perimenopause - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 145 | https://gruns.co/pages/perimenopause-gwp | Grüns Daily Nutrition | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 146 | https://gruns.co/pages/perimenopause-inf | Perimenopause Influencers - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 148 | https://gruns.co/pages/raspberry-lemonade-pop-up-grocer | Grüns Raspberry Lemonade \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 149 | https://gruns.co/pages/raspberry-lemonade-vip | Grüns Raspberry Lemonade \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 153 | https://gruns.co/pages/runners | Grüns for Runners | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 162 | https://gruns.co/pages/surprise-firecracker | Popsicle® Firecracker Grüns \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 163 | https://gruns.co/pages/surprise-kids-firecracker | Popsicle® Firecracker Grüns Kids \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 164 | https://gruns.co/pages/surprise-kids-raspberry-lemonade | Grüns Kids Raspberry Lemonade \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 167 | https://gruns.co/pages/surprise-raspberry-lemonade | Grüns Raspberry Lemonade \| Daily Nutrition Support | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 180 | https://gruns.co/pages/weight-loss-men | Weight Loss Men - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |
| 182 | https://gruns.co/pages/womens-fertility | Women's Fertility - Grüns | Маркетинговый лендинг | Benefit, condition, ingredient или listicle landing | 200 |

### content.blog-article

- Entity: Post
- Template: Blog article
- Reference priority: P2; include in UI references: Да
- Count: 24

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 184 | https://gruns.co/blogs/bear-necessities/ag1-vs-gruns-which-green-supplement-wins-for-daily-nutrition | AG1 vs Grüns: Which Green Supplement Wins for Daily Nutrition? | Статья блога | SEO/education article | 200 |
| 185 | https://gruns.co/blogs/bear-necessities/supercharge-your-health-with-green-supplements-a-complete-guide | Supercharge Your Health with Green Supplements: A Complete Guide - Grüns | Статья блога | SEO/education article | 200 |
| 186 | https://gruns.co/blogs/bear-necessities/top-natural-multivitamin-alternatives-busy-lives-2025 | Top Natural Multivitamin Alternatives for Busy Lives 2025 - Grüns | Статья блога | SEO/education article | 200 |
| 188 | https://gruns.co/blogs/news/grns-your-daily-gummy-super-greens-weight-goals | Grüns: Your Daily Gummy for Super Greens & Weight Goals | Статья блога | SEO/education article | 200 |
| 190 | https://gruns.co/blogs/supergreens/6-ag1-alternatives-youll-actually-crave | 6 AG1 Alternatives You'll Actually Crave - Grüns | Статья блога | SEO/education article | 200 |
| 191 | https://gruns.co/blogs/supergreens/alternatives-multivitamins | Alternatives to Multivitamins - Grüns | Статья блога | SEO/education article | 200 |
| 192 | https://gruns.co/blogs/supergreens/best-gut-health-supplements | Best Gut Health Supplements - Grüns | Статья блога | SEO/education article | 200 |
| 193 | https://gruns.co/blogs/supergreens/best-super-greens-powders-2025 | Best Super Greens Powders 2025 - Grüns | Статья блога | SEO/education article | 200 |
| 194 | https://gruns.co/blogs/supergreens/complete-list-10-super-greens-powder-benefits | The Complete List: 10 Super Greens Powder Benefits - Grüns | Статья блога | SEO/education article | 200 |
| 195 | https://gruns.co/blogs/supergreens/daily-vitamin-gummies-men-actually-taste-good | Daily Vitamin Gummies for Men That Actually Taste Good - Grüns | Статья блога | SEO/education article | 200 |
| 196 | https://gruns.co/blogs/supergreens/daily-vitamin-packs-go | Daily Vitamin Packs on the Go - Grüns | Статья блога | SEO/education article | 200 |
| 197 | https://gruns.co/blogs/supergreens/dietitian-ranks-6-best-ag1-alternatives-2025 | A Dietitian Ranks the 6 Best AG1 Alternatives of 2025 - Grüns | Статья блога | SEO/education article | 200 |
| 198 | https://gruns.co/blogs/supergreens/greens-gummies-vs-powder-whats-more-effective-supplement | Greens Gummies vs. Powder: What’s the More Effective Supplement? - Grüns | Статья блога | SEO/education article | 200 |
| 199 | https://gruns.co/blogs/supergreens/greens-powder-probiotic-vs-prebiotic | Greens Powder: Probiotic vs. Prebiotic - Grüns | Статья блога | SEO/education article | 200 |
| 200 | https://gruns.co/blogs/supergreens/greens-powder-subscriptions-2025-winner | Greens Powder Subscriptions: 2025 Winner - Grüns | Статья блога | SEO/education article | 200 |
| 201 | https://gruns.co/blogs/supergreens/grns-vs-bloom-greens-2025-taste-price-results | Grüns vs Bloom Greens 2025: Taste, Price, Results | Статья блога | SEO/education article | 200 |
| 202 | https://gruns.co/blogs/supergreens/gut-health-chew-form-prebiotic-gummies-outsmart-powders | Gut Health in Chew Form: Prebiotic Gummies That Outsmart Powders - Grüns | Статья блога | SEO/education article | 200 |
| 203 | https://gruns.co/blogs/supergreens/happens-your-body-you-take-greens-powder-day | What Happens to Your Body When You Take Greens Powder Every Day - Grüns | Статья блога | SEO/education article | 200 |
| 204 | https://gruns.co/blogs/supergreens/prebiotic-supplements-microbiome-8-chew-fix | Prebiotic Supplements for Microbiome: 8-Chew Fix - Grüns | Статья блога | SEO/education article | 200 |
| 205 | https://gruns.co/blogs/supergreens/skip-powders-daily-vitamins-go-energy | Skip Powders Daily Vitamins for On-the-Go Energy - Grüns | Статья блога | SEO/education article | 200 |
| 206 | https://gruns.co/blogs/supergreens/super-greens-gummies-dietitian-picks-top-2025 | Super Greens Gummies: Dietitian Picks Top 2025 - Grüns | Статья блога | SEO/education article | 200 |
| 207 | https://gruns.co/blogs/supergreens/super-greens-supplements-8-gummies-replace-11-capsules-daily | Super Greens Supplements: 8 Gummies Replace 11 Capsules Daily - Grüns | Статья блога | SEO/education article | 200 |
| 208 | https://gruns.co/blogs/supergreens/super-greens-weight-loss | Super Greens for Weight Loss - Grüns | Статья блога | SEO/education article | 200 |
| 210 | https://gruns.co/blogs/vitamins/vitamin-gummies-adults | Vitamin Gummies for Adults - Grüns | Статья блога | SEO/education article | 200 |

### content.blog-section

- Entity: BlogCategory
- Template: Blog section / listing
- Reference priority: P2; include in UI references: Да
- Count: 4

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 183 | https://gruns.co/blogs/bear-necessities | Bear Necessities \| Grüns | Раздел блога | Раздел блога | 200 |
| 187 | https://gruns.co/blogs/news | News - Grüns | Раздел блога | Раздел блога | 200 |
| 189 | https://gruns.co/blogs/supergreens | supergreens - Grüns | Раздел блога | Раздел блога | 200 |
| 209 | https://gruns.co/blogs/vitamins | /vitamins - Grüns | Раздел блога | Раздел блога | 200 |

### service.support-program

- Entity: ServicePage
- Template: Support / program page
- Reference priority: P2; include in UI references: Да
- Count: 7

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 36 | https://gruns.co/pages/contact | Contact Form \| Grüns | Сервисная | Support, creators, partners, referrals, locator, tracking | 200 |
| 37 | https://gruns.co/pages/creators | Creators Community \| Grüns | Сервисная | Support, creators, partners, referrals, locator, tracking | 200 |
| 97 | https://gruns.co/pages/help-center | Help Center - Grüns | Сервисная | Support, creators, partners, referrals, locator, tracking | 200 |
| 141 | https://gruns.co/pages/partners-program | Partners Program \| Grüns | Сервисная | Support, creators, partners, referrals, locator, tracking | 200 |
| 150 | https://gruns.co/pages/referrals | Referral Program \| Grüns | Сервисная | Support, creators, partners, referrals, locator, tracking | 200 |
| 161 | https://gruns.co/pages/store-locator | Store Locator - Grüns | Сервисная | Support, creators, partners, referrals, locator, tracking | 200 |
| 174 | https://gruns.co/pages/tracking | Order Tracking \| Grüns | Сервисная | Support, creators, partners, referrals, locator, tracking | 200 |

### content.generic-page

- Entity: Page
- Template: Generic CMS / microsite page
- Reference priority: P3; include in UI references: Частично
- Count: 9

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 38 | https://gruns.co/pages/dad-lander-1 | dad lander - Grüns | Страница | Обычная страница или микросайт без явного commerce шаблона | 200 |
| 41 | https://gruns.co/pages/discounts-and-coupons | Discounts and Coupons - Grüns | Страница | Обычная страница или микросайт без явного commerce шаблона | 200 |
| 99 | https://gruns.co/pages/home-taste-information | Grüns \| Comprehensive Daily Nutrition | Страница | Обычная страница или микросайт без явного commerce шаблона | 200 |
| 100 | https://gruns.co/pages/homepage-theme-new-buybox | Homepage Theme (New Buybox) - Grüns | Страница | Обычная страница или микросайт без явного commerce шаблона | 200 |
| 102 | https://gruns.co/pages/hub | Grüns \| Creators Hub | Страница | Обычная страница или микросайт без явного commerce шаблона | 200 |
| 115 | https://gruns.co/pages/links | Links - Grüns | Страница | Обычная страница или микросайт без явного commerce шаблона | 200 |
| 139 | https://gruns.co/pages/p | Grüns \| Creator Invitation \| Comprehensive Daily Nutrition | Страница | Обычная страница или микросайт без явного commerce шаблона | 200 |
| 176 | https://gruns.co/pages/usnacks | Ü Snacks \| Grüns, Nütrops, Immün, Jüced | Страница | Обычная страница или микросайт без явного commerce шаблона | 200 |
| 178 | https://gruns.co/pages/uzo-inf-fo | Grüns Daily Nutrition | Страница | Обычная страница или микросайт без явного commerce шаблона | 200 |

### legal.policy

- Entity: LegalPage
- Template: Legal / policy page
- Reference priority: P3; include in UI references: Частично
- Count: 9

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 23 | https://gruns.co/pages/2026-sweepstakes-terms-and-conditions-gruns-x-gotham-fc | 2026 Sweepstakes Terms and Conditions - Grüns x Gotham FC | Юридическая | Campaign legal page | 200 |
| 25 | https://gruns.co/pages/authorized-resale-policy | Authorized Resale Policy - Grüns | Юридическая | Campaign legal page | 200 |
| 122 | https://gruns.co/pages/monthly-apple-watch-giveaway-official-rules | GRÜNS MONTHLY APPLE WATCH GIVEAWAY OFFICIAL RULES - Grüns | Юридическая | Campaign legal page | 200 |
| 133 | https://gruns.co/pages/official-rules-gruns-x-skylight | OFFICIAL RULES \| GRUNS x SKYLIGHT “WIN A SKYLIGHT CALENDAR” GIVEAWAY - Grüns | Юридическая | Campaign legal page | 200 |
| 170 | https://gruns.co/pages/sweepstakes-terms-and-conditions | Sweepstakes Terms and Conditions - Grüns | Юридическая | Campaign legal page | 200 |
| 211 | https://gruns.co/policies/privacy-policy | privacy-policy | Policy / legal | Shopify policy route | not fetched: robots/disallowed |
| 212 | https://gruns.co/policies/refund-policy | refund-policy | Policy / legal | Shopify policy route | not fetched: robots/disallowed |
| 213 | https://gruns.co/policies/shipping-policy | shipping-policy | Policy / legal | Shopify policy route | not fetched: robots/disallowed |
| 214 | https://gruns.co/policies/terms-of-service | terms-of-service | Policy / legal | Shopify policy route | not fetched: robots/disallowed |

### utility.system-route

- Entity: SystemRoute
- Template: Utility route
- Reference priority: P3; include in UI references: Частично
- Count: 3

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 215 | https://gruns.co/a/account/login | Grüns | Аккаунт / логин | Account, cart или agents.md | 200 |
| 216 | https://gruns.co/agents.md | agents.md | AI/agent policy | Account, cart или agents.md | 200 |
| 217 | https://gruns.co/cart | cart | Корзина | Account, cart или agents.md | not fetched: robots/disallowed |

### internal.qa-test

- Entity: InternalPage
- Template: QA / internal test page
- Reference priority: Exclude; include in UI references: Нет
- Count: 14

| # | URL | Название | Старый тип | Подтип / назначение | Статус |
|---:|---|---|---|---|---|
| 24 | https://gruns.co/pages/andrew-qa-testing | Andrew QA Testing - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
| 27 | https://gruns.co/pages/bb-test-1 | Bundle Test NEW BB - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
| 28 | https://gruns.co/pages/bb-test-2-old | Bundle Test Old BB - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
| 34 | https://gruns.co/pages/buybox-qa | Buybox QA - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
| 40 | https://gruns.co/pages/development-testing-patrick | development-testing-patrick | Тест/служебная | Тестовая или служебная страница | not fetched: robots/disallowed |
| 98 | https://gruns.co/pages/holding-it-together-man | Grüns Daily Nutrition | Тест/служебная | Тестовая или служебная страница | 200 |
| 103 | https://gruns.co/pages/index-test | index test - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
| 112 | https://gruns.co/pages/kids-pdp-test | kids pdp test - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
| 143 | https://gruns.co/pages/pdp-test | pdp test - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
| 147 | https://gruns.co/pages/qa-testing | QA Testing - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
| 154 | https://gruns.co/pages/sam-test-page | Sam-test-page - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
| 155 | https://gruns.co/pages/sam-test-page-2 | Sam-test-page-2 - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
| 159 | https://gruns.co/pages/siena-qa-testing | siena qa testing - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
| 165 | https://gruns.co/pages/surprise-old | Surprise Offer - Grüns | Тест/служебная | Тестовая или служебная страница | 200 |
