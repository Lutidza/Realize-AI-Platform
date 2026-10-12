# Gruns Reference Analysis and Payload Technical Specification

Дата: 2026-07-14.
Проект: Realize — AI Platform.
Референс: https://gruns.co/.

## Назначение документа

Этот документ фиксирует функциональный анализ Gruns как ecommerce-референса и
переводит его в техническое задание для реализации магазина на Payload CMS 3,
Postgres и frontend текущего проекта.

Документ не предлагает копировать бренд, контент или визуальную айдентику Gruns.
Он выделяет продуктовые паттерны, компоненты, блоки и сценарии, которые нужно
адаптировать под российский рынок: русский язык, RUB, локальные платежи,
локальные службы доставки, фискализацию и локальную юридическую модель.

## Источники анализа

- Живой сайт Gruns: https://gruns.co/
- Home reference: https://gruns.co/
- PDP reference: https://gruns.co/products/gruns
- Collection reference: https://gruns.co/collections/shop-gruns
- Campaign/listicle reference: https://gruns.co/pages/first-order-benefits
- Science/trust reference: https://gruns.co/pages/science
- Blog reference: https://gruns.co/blogs/supergreens/best-gut-health-supplements
- Собранная карта URL: `.ai/research/gruns-site-link-inventory-2026-07-14.md`
- Нормализованная группировка URL: `.ai/research/gruns-link-groups-by-entity-template-2026-07-14.md`
- Payload docs: https://payloadcms.com/docs/getting-started/what-is-payload
- Payload Ecommerce docs: https://payloadcms.com/docs/ecommerce/overview
- Payload Postgres docs: https://payloadcms.com/docs/database/postgres
- Payload Live Preview docs: https://payloadcms.com/docs/live-preview/overview
- Payload Blocks Field docs: https://payloadcms.com/docs/fields/blocks
- Payload Localization docs: https://payloadcms.com/docs/configuration/localization
- Payload Globals docs: https://payloadcms.com/docs/configuration/globals
- Payload Access Control docs: https://payloadcms.com/docs/access-control/overview
- Payload Uploads docs: https://payloadcms.com/docs/upload/overview
- YooKassa 54-FZ receipts: https://yookassa.ru/en/54fz
- CloudPayments developer docs: https://developers.cloudpayments.ru/
- CDEK API docs: https://apidoc.cdek.ru/
- CDEK API integration overview: https://www.cdek.ru/ru/integration/api/
- Dadata ecommerce suggestions article: https://support.dadata.ru/knowledge-bases/4/articles/13796-suggestions-reduce-costs-for-online-stores

## Executive Summary

Gruns построен как high-conversion DTC ecommerce: storefront совмещает
витрину, product education, scientific proof, social proof, subscription offer
и повторяющиеся campaign landing pages. Основная ценность для нас не в
Shopify-реализации, а в продуктовой архитектуре:

- Commerce core: home, PLP/collection, PDP, cart, checkout, account, order
  tracking.
- PDP как главный conversion surface: gallery, flavor selector, sugar selector,
  quantity/supply selector, subscription vs one-time, price comparison, proof,
  nutrition modal, FAQ, sticky CTA.
- Content marketing engine: 100+ campaign/SEO pages, listicles, benefit pages,
  partner landings, lead-capture pages, blog articles.
- Trust system: reviews, third-party testing, science pages, certifications,
  comparison blocks, UGC testimonials.
- Reusable block system: Gruns heavily reuses section-level blocks across home,
  PDP and campaign pages.

Для Realize — AI Platform нужно реализовать аналогичную архитектуру через Payload:
контентные блоки, commerce collections, product attributes, payment/shipping
adapters and storefront components. Stripe из шаблона Payload нельзя считать
целевой платежной системой для РФ: нужна adapter architecture под YooKassa,
CloudPayments/T-Bank/SBP и локальную фискализацию.

## Состояние текущего проекта

Текущий проект уже содержит:

- Next.js 16 + Payload 3.
- Postgres adapter.
- Payload ecommerce plugin.
- SEO plugin.
- Form builder plugin.
- Stripe adapter как условный payment method.
- Collections: `Users`, `Pages`, `Categories`, `Media`, `Products`.
- Globals: `Header`, `Footer`.
- Frontend routes: `/`, `/shop`, `/products/[slug]`, `/checkout`,
  `/checkout/confirm-order`, account routes, auth routes, `[slug]`.
- Blocks: `ArchiveBlock`, `Banner`, `CallToAction`, `Carousel`, `Code`,
  `Content`, `Form`, `MediaBlock`, `ThreeItemGrid`.
- Перенесенный RealizeCore с заделом под атрибуты, SRP и фильтрацию.

Вывод: проект уже имеет базу Payload ecommerce, но Gruns-level реализация
потребует расширить модель данных, frontend blocks, checkout, integrations,
product attributes and marketing page system.

## Карта сущностей и шаблонов Gruns

По собранным 217 URL:

| Группа | URL | Будущая сущность | Шаблон | Приоритет |
|---|---:|---|---|---|
| storefront.home | 1 | Global/Home | Home storefront | P0 |
| commerce.collection | 5 | Collection | Collection / PLP | P0 |
| commerce.product.nutrition-adult | 3 | Product | PDP / nutrition adult | P0 |
| commerce.product.nutrition-kids | 3 | Product | PDP / nutrition kids | P0 |
| utility.system-route | 3 | SystemRoute | Cart/account/agents | P0/P3 |
| commerce.product.merch | 6 | Product | PDP / merch | P1 |
| commerce.product.subscription-upsell | 4 | Product | PDP / subscription upsell | P1 |
| marketing.performance-offer | 33 | CampaignPage | Performance offer landing | P1 |
| marketing.seo-benefit | 50 | CampaignPage | SEO benefit / ingredient landing | P1 |
| marketing.partner-collab | 24 | CampaignPage | Partner / influencer landing | P1 |
| marketing.lead-capture | 9 | CampaignPage | Lead capture / subscribe landing | P1 |
| marketing.retention-member | 4 | CampaignPage | Retention / subscription landing | P1 |
| brand.trust-science | 5 | BrandPage | Science / story / reviews | P1 |
| content.blog-article | 24 | Post | Blog article | P2 |
| content.blog-section | 4 | BlogCategory | Blog listing | P2 |
| service.support-program | 7 | ServicePage | Contact/help/referrals/locator | P2 |
| legal.policy | 9 | LegalPage | Legal rich text | P3 |
| content.generic-page | 9 | Page | Generic CMS page | P3 |
| internal.qa-test | 14 | InternalPage | QA/test pages | Exclude |

## Функционал Gruns, который нужно учесть

### Storefront

- Главная витрина с крупным hero, product claim, CTA и quick-buy.
- Sticky/floating header с прозрачным состоянием на hero и drawer navigation.
- Announcement bar с промо, ссылкой на offer anchor и возможной ротацией
  сообщений.
- Press/logo marquee.
- Product favorites grid с Add to Cart и Learn More.
- Value propositions: вкус, удобство, daily nutrition.
- Benefits storytelling: scroll/animated claim sections.
- Science/trust sections.
- Embedded buybox на home, чтобы пользователь мог купить без перехода на PDP.
- Social proof and fan/UGC sections.
- Final CTA banner.
- Footer newsletter/SMS signup and navigation.

### Product Detail Page

- Product gallery with carousel, thumbnails, arrows and modal nutrition label.
- Review rating anchor: score, reviews count, customers count.
- Product title and short benefit copy.
- Flavor selector.
- Sugar/variant selector.
- Quantity or supply selector.
- Subscription/one-time purchase selector.
- Price cards with discount, strike-through old price, per-day price and
  delivery/payment benefits.
- Add to Cart / Start Now CTA.
- Trust icons under buybox.
- Payment eligibility widget in US context; for RF заменяется на локальные
  payment benefits.
- Accordion facts: why product, ingredients/allergies, sugar variants, science,
  directions, benefits.
- Nutrition label modal/table.
- 50/50 stats and benefit sections.
- Review tabs and testimonials.
- UGC carousel.
- Us-vs-them comparison.
- FAQ.
- Sticky CTA at bottom on mobile/scroll.

### Collection / PLP

- Product grid with image card, title and hover states.
- Minimal collection header.
- Potential extension for filters, sorting and product category navigation.
- For Realize this should become a serious SRP/PLP with filters from attribute
  dictionaries, because текущий проект уже развивает RealizeCore/SRP.

### Campaign / Listicle Pages

- Promo announcement.
- Listicle hero with headline, proof and offer CTA.
- Reason/repeatable benefit blocks.
- Anchored sticky CTA to buybox.
- Reused PDP buybox inside campaign pages.
- Reviews section.
- UGC and comparison blocks.
- Optional app/embed blocks.

### Science / Trust Pages

- Editorial hero.
- Intro section with image and text.
- Feature pills with tooltips.
- Charts/stats comparing placebo vs product.
- Doctor/expert card overlay.
- Science narrative sections.
- Certification/testing references.

### Blog / SEO Content

- Blog category listing.
- Long-form article template.
- Educational SEO articles.
- Internal linking to products and related articles.
- Tables, lists, comparison content, CTA blocks and product references.

### Service / Utility

- Contact form.
- Creator/partner/referral pages.
- Help center.
- Store locator.
- Tracking page.
- Login/account/order history.
- Cart.
- Legal/policy pages.

## UI Primitives

| Primitive | Назначение | Обязательные состояния |
|---|---|---|
| Button | CTA, add to cart, checkout, filters | default, hover, active, disabled, loading |
| IconButton | cart, menu, search, close, carousel arrows | default, hover, focus, disabled |
| Link | nav, footer, inline rich text | default, hover, active, external |
| Badge/Pill | promo labels, flavor labels, feature tags | default, selected, disabled |
| Price | price, old price, discount, per-unit/per-day | sale, regular, subscription |
| RatingStars | review score | readonly, compact, with count |
| Media | responsive image/video | loading, fallback, focal point |
| Carousel | hero, product gallery, UGC, press | arrows, dots, thumbnails |
| Tabs | reviews, product facts, variants | selected, overflow/mobile |
| Accordion | FAQ, product facts, footer mobile nav | open, closed |
| Modal/Dialog | nutrition label, info tooltip, cart confirmations | open, close, scrollable |
| Drawer/Sheet | mobile nav, cart drawer, filters | left/right/bottom, overlay |
| Tooltip | feature explanations, labels | hover/focus, mobile fallback |
| FormInput | checkout, newsletter, login | error, success, disabled |
| Select/Combobox | delivery, city, pickup point, sort | search, loading, empty |
| Checkbox/Radio | offers, filters, consent | checked, disabled, error |
| Stepper | quantity | min, max, loading |
| Table | nutrition facts, legal specs | mobile scroll, caption |
| StickyBar | mobile CTA, checkout summary | collapsed, visible |
| Section | layout wrapper | background variants, spacing variants |
| Skeleton | loading states | list/grid/card variants |
| Toast | cart/payment/order events | success, error, info |

## Reusable Blocks Library

| Block | Где нужен | Payload fields | Frontend behavior | Priority |
|---|---|---|---|---|
| AnnouncementBar | global/header, campaign | messages, link, schedule, style | rotating messages, anchor link | P0 |
| HeaderNav | global | logo, nav groups, nav cards, CTA, cart | sticky, transparent/solid, drawer | P0 |
| Footer | global | columns, newsletter, legal links, social | mobile accordions, forms | P0 |
| HeroCommerce | home/campaign | eyebrow, title, text, media, CTA, stats | responsive media, CTA | P0 |
| PressMarquee | home/trust | logos, speed, labels | horizontal marquee | P1 |
| ProductFavoritesGrid | home | products, card copy, CTA mode | quick add, learn more | P0 |
| ValueProps | home/PDP | items with icon/title/text | grid/cards | P0 |
| BenefitsScroll | home/campaign | benefit steps, media, anchors | scroll or static fallback | P1 |
| ScienceProof | home/PDP/trust | claims, lab/testing refs, CTA | proof cards, badges | P1 |
| ProductBuyBox | PDP/home/campaign | product, variant groups, offer rules | dynamic pricing, add to cart | P0 |
| ProductGallery | PDP | media array, labels, nutrition media | carousel, thumbnails, modal | P0 |
| ProductVariantSelector | PDP | option groups, variants | selected state, stock constraints | P0 |
| SubscriptionPlanSelector | PDP | plans, discounts, interval | one-time/subscription toggle | P1 |
| NutritionFactsModal | PDP | ingredients, facts table, warnings | modal/table/tabs | P1 |
| TrustIconRow | PDP/campaign | icons, labels | compact badges | P0 |
| ReviewSummary | PDP/home | rating, counts, source | anchor to reviews | P1 |
| ReviewTabs | PDP | reviews by topic/source | tabs/filter | P1 |
| UGCTestimonials | PDP/campaign | videos/images/quotes | carousel | P1 |
| ComparisonTable | PDP/SEO | columns, rows, highlight | responsive table | P1 |
| Stats5050 | PDP/science | stat, chart rows, media | charts/static fallback | P1 |
| FAQ | PDP/content | questions/answers | accordion | P0 |
| FinalCTA | home/campaign/content | title, media, CTA | banner | P1 |
| ListicleHero | campaign | headline, slides/media, CTA | carousel/offer anchor | P1 |
| ListicleReason | campaign | number, title, copy, media | repeated section | P1 |
| LeadCapture | subscribe pages | form, consent text, offer | form submit, success state | P1 |
| BlogArticleBody | blog | rich text, blocks, TOC | SEO article layout | P2 |
| BlogListing | blog category | category, posts, filters | cards/pagination | P2 |
| StoreLocator | service | provider/map, pickup points | map/list/search | P2 |
| ContactForm | service | form relation | validation/submission | P2 |
| LegalRichText | legal | rich text, updated date | simple readable layout | P3 |

## Payload Data Model

### Existing collections to keep

- `Users`
- `Pages`
- `Categories`
- `Media`
- `Products`
- ecommerce plugin collections: carts/orders/payments/addresses as generated by
  the plugin or explicit overrides.

### Collections to add or expand

| Collection | Purpose | Key fields |
|---|---|---|
| Products | Commerce product | title, slug, status, type, category, media, attributes, variants, SEO |
| ProductVariants | Sellable SKU | sku, barcode, price, compareAtPrice, stock, dimensions, weight, options |
| ProductOptionGroups | Variant axes | flavor, size, color, sugar level, quantity, package |
| ProductAttributeGroups | Attribute dictionary | group name, scope, sort, filterable |
| ProductAttributes | Attribute definitions | key, label, type, units, filterable, searchable |
| ProductAttributeValues | Values | attribute, value, normalized value, locale label |
| Collections | PLP/taxonomy | title, slug, description, image, products, SEO |
| Ingredients | Nutrition/beauty/health products | name, description, source, allergen flags |
| NutritionFacts | Structured facts | product/variant, serving size, nutrients, daily values |
| Claims | Product claims | title, evidence, disclaimer, products/pages |
| Certifications | Proof system | name, issuer, certificate media, expiry |
| Reviews | Review content | rating, author, media, source, product, moderation |
| CampaignPages | Marketing pages | slug, campaign type, offer, layout blocks, tracking tags |
| Posts | Blog articles | title, slug, category, author, body, related products |
| BlogCategories | Blog section | title, slug, SEO, order |
| Promotions | Promo engine | code, discount, audience, date, conditions |
| Coupons | Customer-facing codes | code, promotion, usage limits |
| PriceLists | Regional/channel pricing | currency, channel, customer group |
| Inventory | Stock by SKU/warehouse | variant, warehouse, quantity, reserved |
| Warehouses | Fulfillment locations | address, service region, active |
| Carts | Cart state | items, customer, discounts, shipping estimate |
| Orders | Order lifecycle | items, customer, totals, payment, shipment, fiscal status |
| Payments | Payment transactions | provider, amount, status, external id, receipt status |
| Refunds | Refund records | payment, amount, reason, external id |
| Shipments | Delivery records | provider, tariff, tracking, pickup point, label |
| DeliveryMethods | Available methods | provider, courier/PVZ/post, rules, pricing fallback |
| PickupPointsCache | PVZ cache | provider, city, coordinates, schedule, raw payload |
| Addresses | Customer/order addresses | Dadata fields, geo, postal code, normalized parts |
| Forms | Form builder | keep plugin model |
| FormSubmissions | Leads/support | keep plugin model |
| Menus | Header/footer nav | groups, cards, links |
| SiteSettings | Global settings | currency, locale, support contacts, legal data |
| Redirects | SEO migrations | from, to, status |

### Globals

| Global | Purpose |
|---|---|
| Header | Logo, nav, commerce CTA, drawer cards, announcement reference |
| Footer | Newsletter, legal links, nav columns, social links |
| Home | Home page composition or use Pages with home slug |
| SiteSettings | Locale, currency, company info, contacts, analytics ids |
| CheckoutSettings | Payment/delivery toggles, consent texts, fiscal settings |
| PromoSettings | Announcement defaults, active promo, campaign defaults |

## Payload Blocks Requirements

Payload Blocks Field is the right base for page composition because editors need
to mix reusable sections in arbitrary order. For MVP, blocks must be grouped:

- Commerce blocks: `ProductBuyBoxBlock`, `ProductGridBlock`,
  `FeaturedCollectionBlock`, `CartSummaryBlock`.
- Marketing blocks: `HeroCommerceBlock`, `ListicleReasonBlock`,
  `PressMarqueeBlock`, `ValuePropsBlock`, `FinalCTABlock`, `LeadCaptureBlock`.
- Trust blocks: `ScienceProofBlock`, `ReviewsBlock`, `UGCTestimonialsBlock`,
  `ComparisonTableBlock`, `StatsBlock`, `CertificationsBlock`.
- Content blocks: `RichTextBlock`, `MediaBlock`, `FAQBlock`, `BlogCTA`,
  `RelatedPostsBlock`, `RelatedProductsBlock`.
- Utility blocks: `FormBlock`, `StoreLocatorBlock`, `TrackingBlock`,
  `LegalRichTextBlock`.

Each block requires:

- `blockType`
- editor label
- optional anchor id
- background/theme variant
- spacing controls from a constrained enum
- fields for mobile/desktop media
- SEO-safe headings
- optional visibility schedule
- optional audience/campaign tags

## Frontend Routes

### P0

- `/` home storefront.
- `/shop` default PLP.
- `/collections/[slug]` collection PLP.
- `/products/[slug]` PDP.
- `/cart` or cart drawer route fallback.
- `/checkout` checkout flow.
- `/checkout/confirm-order` success/confirmation.
- `/login`, `/create-account`, `/account`, `/account/orders`.

### P1

- `/pages/[slug]` or `[slug]` CMS pages.
- `/campaigns/[slug]` or page type inside Pages/CampaignPages.
- `/blog` listing.
- `/blog/[category]`.
- `/blog/[category]/[slug]`.
- `/reviews`, `/science`, `/about`.

### P2

- `/help`, `/contact`, `/tracking`, `/referrals`, `/partners`,
  `/store-locator`.
- `/policies/[slug]`.
- `/sitemap.xml`, `/robots.txt`.

## Checkout and Russia-Specific Requirements

### Currency and pricing

- Primary currency: RUB.
- Store all money as integer minor units.
- Format prices using Russian locale: `ru-RU`, `RUB`.
- Do not hardcode VAT rates. Create configurable tax categories and use them in
  products/order items.
- Support compare-at price, sale price, subscription price, bundle price and
  per-unit price.
- All totals must be recalculated server-side.

### Payment adapters

Current Stripe adapter remains useful as a development reference, but target RF
implementation needs payment provider abstraction.

Required interface:

- `createPayment(order)`
- `capturePayment(payment)`
- `cancelPayment(payment)`
- `refundPayment(payment, amount)`
- `handleWebhook(payload, signature)`
- `createReceipt(payment/order)`
- `getPaymentStatus(externalId)`

Recommended providers:

- YooKassa as primary adapter for cards, SBP and receipt/fiscalization flows.
- CloudPayments/CloudKassir as optional adapter.
- T-Bank/SberPay/SBP as optional future adapters depending on acquiring.
- Cash on delivery only if operationally required; keep disabled by default.

Provider-specific secrets must be environment variables, never stored in Payload.

### Fiscalization

- Payment records must have fiscal status: `not_required`, `pending`,
  `sent`, `confirmed`, `failed`.
- Order item fiscal payload must include item name, quantity, amount, tax
  category, payment subject/method where required by provider.
- Receipt failures must not silently mark orders as complete. Add admin retry.
- Final legal/fiscal configuration requires accounting/legal review.

### Delivery adapters

Required interface:

- `getRates(cart, address)`
- `getPickupPoints(city/address)`
- `createShipment(order)`
- `cancelShipment(shipment)`
- `getTracking(trackingNumber)`
- `printLabel(shipment)`

Recommended providers:

- CDEK: courier delivery and PVZ pickup.
- Boxberry: optional PVZ/courier depending on contract.
- Russian Post: optional wide coverage.
- Yandex Delivery or Dostavista: optional same-day/local delivery.

Checkout must support:

- courier delivery;
- pickup point selection;
- delivery price calculation;
- estimated delivery date;
- tracking number;
- shipment status sync;
- admin manual override.

### Address UX

- Use Dadata-style suggestions for Russian addresses, names, phone normalization.
- Store both user-entered address and normalized address components.
- Validate phone as Russian phone by default, but do not block non-RU if business
  later supports CIS.
- Pickup point selector must have list + map-ready data structure, even if map
  is postponed.

### Language and localization

- Primary frontend language: Russian.
- Payload admin can stay English/Russian depending on team preference.
- Content localization should be configured at field level, not blindly for
  entire documents.
- Initial locales: `ru` as default. Add `en` later only if business requires.
- All frontend copy must come from CMS or typed dictionaries where appropriate.

## Functional Requirements

### Storefront

- Render CMS-composed home page with reusable blocks.
- Show announcement bar and global header/footer.
- Support product cards with quick add and product link.
- Support featured products and collections.
- Support CTA anchors to buybox or product routes.
- Support reviews/proof blocks.
- Support responsive mobile-first layouts.

### Product Catalog

- Products have product type: nutrition, merch, digital/service, bundle,
  subscription upsell.
- Products can have variants based on option groups.
- Product attributes must be structured and filterable.
- Product media supports multiple images, video, alt text, focal point.
- Product can reference ingredients, nutrition facts, claims, certifications,
  reviews and FAQs.
- Product can define PDP blocks overriding or extending defaults.

### PLP / SRP

- Product grid.
- Category/collection header.
- Sorting.
- Filters from attribute dictionary.
- URL-synchronized filter state.
- Pagination or infinite loading; choose one consistently.
- Empty state.
- SEO text block above/below grid.
- Future Elasticsearch/OpenSearch adapter can consume the same attribute model.

### PDP

- Gallery with thumbnails.
- Variant selectors.
- Price display.
- Stock/availability display.
- Quantity selector.
- Add to cart.
- Subscription plan selector if product supports subscription.
- Nutrition/ingredients modal.
- Product facts accordion.
- Reviews and comparison sections.
- Sticky mobile CTA.
- Related products.

### Cart

- Cart drawer and full cart page fallback.
- Add/update/remove items.
- Recalculate totals server-side.
- Apply coupon/promo.
- Show shipping estimate when available.
- Show payment/delivery warnings.
- Persist anonymous cart and merge on login.

### Checkout

- Contact step.
- Delivery step.
- Payment step.
- Confirmation step.
- Guest checkout.
- Authenticated checkout.
- Address suggestions.
- Delivery rates.
- Pickup point selection.
- Payment initialization.
- Order creation.
- Payment webhook handling.
- Fiscal receipt state.
- Confirmation email/SMS hooks.

### Account

- Login/register/reset password.
- Profile data.
- Address book.
- Order history.
- Order detail.
- Tracking link/status.
- Reorder action after MVP.

### Admin

- Manage products, variants, attributes, categories, collections.
- Manage pages, blocks, menus, forms, media.
- Manage orders, payments, shipments, refunds.
- Manual order status change with audit trail.
- Retry payment/fiscal/delivery operations.
- Role-based access: admin, content editor, support, fulfillment, analyst.

### Content and Marketing

- Campaign pages with listicle and offer blocks.
- SEO benefit pages.
- Partner pages.
- Lead capture pages.
- Blog and blog categories.
- Legal pages.
- Redirect management.
- SEO meta fields, open graph image, canonical URL.
- Drafts and live preview.

## Non-Functional Requirements

### Performance

- Product, PLP and CMS pages should use server rendering and cache/revalidate
  strategy appropriate to content freshness.
- Product images must be optimized and responsive.
- Avoid client-heavy blocks unless interaction requires it.
- Cart/checkout interactions can be client components.

### SEO

- Unique title/description per product/page/post.
- Canonical URL.
- Open Graph data.
- JSON-LD for product, breadcrumbs, article and organization where applicable.
- Sitemap generation.
- Robots policy.
- Redirects from migrated URLs.

### Accessibility

- Keyboard navigation for header, cart drawer, modals, accordions and checkout.
- Visible focus states.
- Proper labels for form fields.
- Dialog focus trap.
- Color contrast checks.
- Semantic headings.

### Security

- Access control on all admin and customer data.
- Server-side validation for price, inventory, order totals and payment status.
- Webhook signature validation.
- Secrets only in environment variables.
- No PII in logs beyond operational need.
- Rate limiting for auth, forms and checkout endpoints.

### Observability

- Payment webhook logs.
- Delivery adapter logs.
- Order state transition history.
- Admin audit trail for manual changes.
- Error monitoring hooks.

### Data Privacy

- Russian personal data handling must be reviewed before production launch.
- Add consent text and policy links in checkout/forms.
- Minimize stored PII.
- Add data retention policy for leads and inactive carts.

## Technical Architecture

### Backend

- Payload 3 as CMS/app backend.
- Postgres as primary database.
- Payload Local API for server-side rendering and transactional operations.
- REST/GraphQL available but frontend should prefer typed local/server APIs
  where possible.
- Payment and delivery integrations behind internal adapter interfaces.

### Frontend

- App Router routes already exist; expand them by template.
- Use existing UI primitives where compatible.
- Build block renderer mapping Payload block slugs to React components.
- Keep server components for read-heavy catalog/content.
- Use client components for cart, checkout, selectors, drawers, carousels and
  modals.

### Integrations

- Payment providers: adapter-based.
- Delivery providers: adapter-based.
- Address suggestions: adapter-based.
- Email/SMS: adapter-based.
- Analytics: dataLayer/event interface; provider choice later.

## Implementation Phases

### Phase 0: Stabilization

- Verify dev startup, Postgres startup and seed flow.
- Audit current ecommerce plugin collections.
- Confirm whether to keep official ecommerce plugin as base or override more
  collections.
- Generate Payload types.
- Add initial technical decisions record.

### Phase 1: Data Model

- Implement attribute dictionary collections.
- Expand Products/Variants model.
- Add Collections/Blog/Posts/CampaignPages if missing.
- Add Reviews, Ingredients, NutritionFacts, Claims, Certifications.
- Add Payment/Delivery adapter models.
- Add SiteSettings/CheckoutSettings globals.

### Phase 2: Block System

- Define block configs.
- Implement block renderer.
- Port existing simple blocks where useful.
- Add commerce/trust/marketing blocks from this document.
- Enable preview/live preview for Pages, Products, CampaignPages and Globals.

### Phase 3: Storefront

- Implement home.
- Implement PLP/SRP.
- Implement PDP nutrition.
- Implement PDP merch.
- Implement cart drawer/page.
- Implement base account pages.

### Phase 4: Checkout RF

- Implement checkout steps.
- Implement address suggestions.
- Implement CDEK rates/PVZ prototype.
- Implement YooKassa or selected provider payment prototype.
- Implement webhook and order state transitions.
- Implement fiscal status fields and retry mechanics.

### Phase 5: Content Engine

- Implement campaign/listicle pages.
- Implement SEO benefit pages.
- Implement blog articles/listing.
- Implement service/legal pages.
- Seed reference pages and demo content.

### Phase 6: QA and Launch Readiness

- Unit/integration tests for pricing, cart, checkout, adapters.
- E2E tests for browse -> cart -> checkout.
- Admin acceptance tests.
- SEO checks.
- Accessibility checks.
- Performance checks.
- Security review for payments/webhooks/PII.

## Acceptance Criteria

### P0

- Project starts locally with Postgres.
- Admin can create product with variants and publish it.
- Frontend renders product and collection pages.
- User can add product to cart.
- User can complete checkout with test payment adapter.
- Order is created with correct totals and statuses.
- CMS page can be edited and previewed.

### P1

- Nutrition PDP supports facts modal, accordions, reviews and sticky CTA.
- Campaign page can reuse ProductBuyBox.
- Payment provider adapter is implemented for selected RF provider.
- Delivery provider adapter calculates at least one real delivery method.
- Attribute-based filters work on PLP.

### P2

- Blog, service and legal templates are implemented.
- Reviews and UGC are editable in CMS.
- Admin can retry failed payment/fiscal/delivery sync.
- Basic analytics events are emitted.

## Open Decisions

- Payment provider priority: YooKassa vs CloudPayments vs T-Bank.
- Delivery provider priority: CDEK only for MVP or CDEK + Boxberry.
- Whether subscriptions are required in MVP or postponed.
- Whether product vertical is nutrition-like, general marketplace, or store
  builder with many merchant verticals.
- Whether frontend should support multi-tenant storefronts immediately.
- Whether Elasticsearch/OpenSearch is required before first launch or after
  Payload/Postgres filters.

## Immediate Next Steps

1. Approve target MVP scope: P0 only or P0 + selected P1 blocks.
2. Decide RF providers for first adapter implementation.
3. Convert this document into implementation tasks grouped by collections,
   blocks, frontend routes and integrations.
4. Start with data model: attributes, variants, collections, products and
   settings.
5. Seed demo products/categories/pages matching Gruns-like template coverage,
   but with Russian copy, RUB and local checkout assumptions.
