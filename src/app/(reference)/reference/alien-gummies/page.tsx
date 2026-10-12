/**
 * @file src/app/(reference)/reference/alien-gummies/page.tsx
 * @version 1.0.0
 * @date 2026-10-12
 * @description Отображает референс витрины Alien Gummies для проекта Realize — AI Platform.
 */

import {
  ArrowRight,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
} from 'lucide-react'

import { BenefitsParallax } from './BenefitsParallax'
import styles from './page.module.css'

const media = {
  badge: 'https://gruns.co/cdn/shop/files/Badge_3.webp?v=1783430469&width=350',
  hero: '/documentation/img/img.png',
  productCore:
    'https://gruns.co/cdn/shop/files/ShopTile-OG-Adults.webp?v=1769619031&width=800',
  productKids:
    'https://gruns.co/cdn/shop/files/ShopTile-OG-Kids.webp?v=1769619031&width=800',
  productLimited:
    'https://gruns.co/cdn/shop/files/LTO-RL-Adults-LS-1Prod_9d02010e-7402-4331-bd06-2e2fb96cf04f.webp?v=1782934999&width=800',
  productLowSugar:
    'https://gruns.co/cdn/shop/files/LTO-RL-Kids-LS-1Prod.webp?v=1781641652&width=800',
  social: 'https://gruns.co/cdn/shop/files/gal-ugc-reviews.webp?v=1783699964&width=1000',
  testedBugs: 'https://gruns.co/cdn/shop/files/icon-tested-bugs.svg?v=1780087884&width=128',
  testedContaminants:
    'https://gruns.co/cdn/shop/files/icon-tested-contaminants.svg?v=1780087884&width=128',
  testedMetals: 'https://gruns.co/cdn/shop/files/icon-tested-metals.svg?v=1780087884&width=128',
  testedMicrobial:
    'https://gruns.co/cdn/shop/files/icon-tested-microbial.svg?v=1780087884&width=128',
  valueFlavor: 'https://gruns.co/cdn/shop/files/valueprop-image1.webp?v=1778872544&width=900',
  valueNutrition: 'https://gruns.co/cdn/shop/files/valueprop-cardimg3.webp?v=1778872543&width=900',
  valueRip: 'https://gruns.co/cdn/shop/files/valueprop-cardimg1.webp?v=1778872543&width=900',
}

const products = [
  {
    className: styles.cardCore,
    image: media.productCore,
    label: 'BEST SELLER',
    name: 'Cosmo Gummy Adults',
    labelClassName: styles.productLabelCore,
    price: '2 490 ₽',
    oldPrice: '3 290 ₽',
  },
  {
    className: styles.cardBerry,
    image: media.productLimited,
    label: 'NEW FLAVOR',
    name: 'Raspberry Orbit',
    labelClassName: styles.productLabelBerry,
    price: '2 790 ₽',
    oldPrice: '3 590 ₽',
  },
  {
    className: styles.cardMint,
    image: media.productKids,
    label: null,
    name: 'Junior Aliens',
    labelClassName: null,
    price: '2 290 ₽',
    oldPrice: '2 990 ₽',
  },
  {
    className: styles.cardCream,
    image: media.productLowSugar,
    label: 'NEW FLAVOR',
    name: 'Low Sugar Beam',
    labelClassName: styles.productLabelCream,
    price: '2 590 ₽',
    oldPrice: '3 190 ₽',
  },
]

const valueProps = [
  {
    copy: 'На вкус как мармеладка, по смыслу как ежедневный нутриентный комплекс.',
    image: media.valueFlavor,
    imageClassName: styles.valuePropImageFlavor,
    title: 'Вкус без рутины',
  },
  {
    copy: 'Положил в сумку, открыл упаковку, съел порцию. Без шейкера, воды и сложной рутины.',
    image: media.valueRip,
    imageClassName: styles.valuePropImageRip,
    title: 'Открыл. Съел.',
  },
  {
    copy: '60+ ингредиентов, витамины, минералы и клетчатка в одной удобной упаковке.',
    image: media.valueNutrition,
    imageClassName: styles.valuePropImageNutrition,
    title: '60+ нутриентов',
  },
]

const testCallouts = [
  {
    image: media.testedBugs,
    text: '70 видов пестицидов',
  },
  {
    image: media.testedMetals,
    text: '4 тяжёлых металла',
  },
  {
    image: media.testedContaminants,
    text: '16 видов загрязнений',
  },
  {
    image: media.testedMicrobial,
    text: '9 микробных тестов',
  },
]

const faqs = [
  {
    answer:
      'Выбирай вкус по целям: поддержка энергии, контроль аппетита или мягкая замена перекуса. Подбираем порцию и план в зависимости от твоих привычек.',
    question: 'Как выбрать вкус?',
  },
  {
    answer:
      'Да, мы используем визуалы под бренд и локальный контент: фото, видео и инфографику по вкусам, сроку годности и упаковке.',
    question: 'Что входит в комплект?',
  },
  {
    answer:
      'В наличии опции подписки и разовой покупки. Доставка на всю РФ: СДЭК, Boxberry, Почта России, а оплата через СБП, карты и локальные платежные решения.',
    question: 'Как быстро будет доставка?',
  },
]

const clientLogos = [
  'vc.ru',
  'РБК Стиль',
  'The Village',
  'СберМаркет',
  'ЗОЖ Daily',
  'Forbes',
  'GQ',
  'TODAY',
  'People',
  'Travel + Leisure',
  'Men’s Journal',
  'Good Housekeeping',
]

const menuProducts = [
  {
    badge: null,
    href: '#buybox',
    image: media.productCore,
    name: 'Cosmo Gummy Adults',
  },
  {
    badge: 'Новинка',
    href: '#products',
    image: media.productLimited,
    name: 'Raspberry Orbit Adults',
  },
  {
    badge: null,
    href: '#products',
    image: media.productKids,
    name: 'Junior Aliens Kids',
  },
  {
    badge: 'Новинка',
    href: '#products',
    image: media.productLowSugar,
    name: 'Low Sugar Beam Kids',
  },
]

export default function AlienGummiesReferencePage() {
  return (
    <main className={styles.page}>
      <div className={styles.announcement}>
        <span>Бесплатная доставка по РФ + 30 дней гарантии</span>
      </div>

      <header className={styles.header}>
        <a aria-label="Cosmo Gummy на главную" className={styles.brand} href="#top">
          <strong>cosmo gummy</strong>
        </a>
        <div className={styles.actions}>
          <a className={styles.shopButton} href="#buybox">
            Купить
          </a>
          <a aria-label="Корзина" className={styles.iconButton} href="#buybox">
            <ShoppingBag aria-hidden="true" size={20} />
          </a>
          <details className={styles.navMenu}>
            <summary aria-label="Открыть или закрыть меню" className={styles.menuButton}>
              <span aria-hidden="true" className={styles.menuIcon}>
                <span />
                <span />
                <span />
              </span>
            </summary>
            <nav aria-label="Навигация магазина" className={styles.navPanel}>
              <p className={styles.navEyebrow}>Shop products</p>
              <div className={styles.navProducts}>
                {menuProducts.map((product) => (
                  <a className={styles.navProduct} href={product.href} key={product.name}>
                    <img alt="" src={product.image} />
                    <span>
                      <strong>{product.name}</strong>
                      {product.badge ? <em>{product.badge}</em> : null}
                    </span>
                  </a>
                ))}
              </div>
              <a className={styles.navFeature} href="#products">
                <img alt="" src={media.productLimited} />
                <span>Новый вкус: Raspberry Orbit</span>
              </a>
              <a className={styles.navAccount} href="#buybox">
                Управлять подпиской
              </a>
              <div className={styles.navFooterLinks}>
                <a href="#science">Наша наука</a>
                <a href="#buybox">Где купить</a>
                <a href="#benefits">Ü Snacks</a>
              </div>
            </nav>
          </details>
        </div>
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroInner}>
          <div className={styles.heroVisual}>
            <img
              alt="Упаковки витаминов Cosmo Gummy в формате daily mix"
              decoding="async"
              fetchPriority="high"
              src={media.hero}
            />
          </div>
          <div className={styles.heroCopy}>
            <div className={styles.rating}>
              <span className={styles.stars} aria-label="Рейтинг пять звезд">
                <Star aria-hidden="true" fill="currentColor" size={17} />
                <Star aria-hidden="true" fill="currentColor" size={17} />
                <Star aria-hidden="true" fill="currentColor" size={17} />
                <Star aria-hidden="true" fill="currentColor" size={17} />
                <Star aria-hidden="true" fill="currentColor" size={17} />
              </span>
              <span>4.9 • 100К+ отзывов • 1М+ покупателей</span>
            </div>
            <h1>
              60+ полезных ингредиентов <span className={styles.heroLineBreak}>в одной упаковке</span>
            </h1>
            <a className={styles.primaryCta} href="#buybox">
              Попробовать набор
            </a>
            <div className={styles.guarantees}>
              <span>
                <Truck aria-hidden="true" size={15} />
                30 дней гарантии
              </span>
              <span>
                <Sparkles aria-hidden="true" size={15} />
                Отмена в любой момент
              </span>
            </div>
            <div className={styles.heroMetrics} aria-label="Ключевые преимущества">
              <div className={styles.metricCard}>
                <span className={styles.metricBadge} aria-hidden="true">
                  <svg viewBox="0 0 75 65" className={styles.metricShape} focusable="false">
                    <path d="M37.2402 0C57.8072 0.000123697 74.4805 16.6732 74.4805 37.2402C74.4804 47.3676 70.4361 56.5493 63.8763 63.2624C62.8827 64.2792 61.3433 64.4648 60.0479 63.8793C53.0981 60.7382 45.3753 58.9873 37.2402 58.9873C29.1046 58.9873 21.381 60.7378 14.4308 63.8792C13.1352 64.4647 11.5958 64.2791 10.6022 63.2622C4.04306 56.5492 6.09106e-05 47.3672 0 37.2402C0 16.6731 16.6731 0 37.2402 0Z" />
                  </svg>
                  <span className={styles.metricValue}>
                    60<span className={styles.metricPlus}>+</span>
                  </span>
                </span>
                <span>нутриентов</span>
                <small>фрукты, ягоды и клетчатка</small>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricBadge} aria-hidden="true">
                  <svg viewBox="0 0 75 65" className={styles.metricShape} focusable="false">
                    <path d="M37.2402 0C57.8072 0.000123697 74.4805 16.6732 74.4805 37.2402C74.4804 47.3676 70.4361 56.5493 63.8763 63.2624C62.8827 64.2792 61.3433 64.4648 60.0479 63.8793C53.0981 60.7382 45.3753 58.9873 37.2402 58.9873C29.1046 58.9873 21.381 60.7378 14.4308 63.8792C13.1352 64.4647 11.5958 64.2791 10.6022 63.2622C4.04306 56.5492 6.09106e-05 47.3672 0 37.2402C0 16.6731 16.6731 0 37.2402 0Z" />
                  </svg>
                  <span className={styles.metricValue}>21</span>
                </span>
                <span>витамин и минерал</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricBadge} aria-hidden="true">
                  <svg viewBox="0 0 75 65" className={styles.metricShape} focusable="false">
                    <path d="M37.2402 0C57.8072 0.000123697 74.4805 16.6732 74.4805 37.2402C74.4804 47.3676 70.4361 56.5493 63.8763 63.2624C62.8827 64.2792 61.3433 64.4648 60.0479 63.8793C53.0981 60.7382 45.3753 58.9873 37.2402 58.9873C29.1046 58.9873 21.381 60.7378 14.4308 63.8792C13.1352 64.4647 11.5958 64.2791 10.6022 63.2622C4.04306 56.5492 6.09106e-05 47.3672 0 37.2402C0 16.6731 16.6731 0 37.2402 0Z" />
                  </svg>
                  <span className={styles.metricValue}>6г</span>
                </span>
                <span>клетчатки</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.pressStrip} aria-label="Медиа и доверие">
        <div className={styles.pressTrack}>
          {[...clientLogos, ...clientLogos].map((logo, index) => (
            <span key={`${logo}-${index}`}>{logo}</span>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.productSection}`} id="products">
        <div className={styles.sectionHeading}>
          <h2>Подбери своего инопланетянина</h2>
          <p>
            Выбирай вкус, сравнивай состав и покупай в один клик — без
            лишних уровней и с понятным ценником.
          </p>
        </div>
        <div className={styles.productGrid}>
          {products.map((product) => (
            <article className={`${styles.productCard} ${product.className}`} key={product.name}>
              <a aria-label={`Открыть ${product.name}`} className={styles.productImageTile} href="#buybox">
                {product.label ? (
                  <span className={`${styles.productLabel} ${product.labelClassName ?? ''}`}>
                    {product.label}
                  </span>
                ) : null}
                <img alt={product.name} className={styles.productImage} src={product.image} />
              </a>
              <div className={styles.productBody}>
                <h3>{product.name}</h3>
                <div className={styles.priceInfo}>
                  <span className={styles.startsAtLabel}>от</span>
                  <span className={styles.priceFrom}>{product.price}</span>
                  <span className={styles.priceOld}>{product.oldPrice}</span>
                </div>
              </div>
              <div className={styles.productActions}>
                <a className={styles.primaryAction} href="#buybox">
                  В корзину
                </a>
                <a className={styles.secondaryAction} href="#buybox">
                  Подробнее
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.valueProps} id="benefits">
        <div className={styles.valuePropsInner}>
          <h2>
            Польза на каждый день, <span>до смешного просто.</span>
          </h2>
          <div className={styles.valuePropsGrid}>
            {valueProps.map((item) => (
              <article className={styles.valuePropCard} key={item.title}>
                <div className={styles.valuePropImageWrap}>
                  <img
                    alt={item.title}
                    className={`${styles.valuePropImage} ${item.imageClassName}`}
                    src={item.image}
                  />
                </div>
                <div className={styles.valuePropCopy}>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <BenefitsParallax />

      <section className={styles.thirdPartyScience} id="science">
        <div className={styles.thirdPartyScienceInner}>
          <div className={styles.thirdPartyScienceCopy}>
            <h2>Независимо проверено на состав, чистоту и безопасность.</h2>
            <p>
              Проверяем витамины, минералы и нутриенты на точность состава и
              отсутствие загрязнителей:
            </p>
          </div>
          <ul className={styles.thirdPartyCallouts} role="list">
            {testCallouts.map((item) => (
              <li className={styles.thirdPartyCallout} key={item.text}>
                <img alt="" aria-hidden="true" src={item.image} />
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.buybox} id="buybox">
        <div className={styles.buyImageWrap}>
          <img alt="Упаковка Cosmo Gummy" src={media.productCore} />
          <img alt="" className={styles.badge} src={media.badge} />
        </div>
        <div className={styles.buyPanel}>
          <p className={styles.kicker}>Starter pack</p>
          <h2>Cosmo Gummy Core, 28 стиков</h2>
          <p>
            Блок покупки в формате 28 стиков: выбор вкуса, тариф, актуальная
            цена, скидка и гарантированная доставка по РФ.
          </p>
          <div className={styles.optionGroup} aria-label="Выбор вкуса">
            <button type="button">Йогуртовые ягоды</button>
            <button type="button">Малина-лимон</button>
            <button type="button">Low sugar</button>
          </div>
          <div className={styles.planGrid}>
            <button className={styles.planActive} type="button">
              <span>Подписка</span>
              <strong>2 490 ₽</strong>
              <small>-20% на первый месяц</small>
            </button>
            <button type="button">
              <span>Разовая покупка</span>
              <strong>3 190 ₽</strong>
              <small>Без автопродления</small>
            </button>
          </div>
          <a className={styles.checkoutButton} href="#faq">
            Добавить в корзину
            <ShoppingBag aria-hidden="true" size={18} />
          </a>
          <div className={styles.fulfillment}>
            <span>
              <Truck aria-hidden="true" size={18} />
              СДЭК / Boxberry / Почта России
            </span>
            <span>
              <Sparkles aria-hidden="true" size={18} />
              СБП, карты, pay-link
            </span>
          </div>
        </div>
      </section>

      <section className={styles.socialProof}>
        <div className={styles.socialImage}>
          <img alt="Коллаж отзывов покупателей" src={media.social} />
        </div>
        <div className={styles.quoteGrid}>
          <blockquote>
            <p>«Удобно держать в рюкзаке. Вкус не как аптечная витамина.»</p>
            <cite>Анна, Москва</cite>
          </blockquote>
          <blockquote>
            <p>«Понравилось, что все понятно: вкус, состав, доставка, цена.»</p>
            <cite>Илья, Казань</cite>
          </blockquote>
          <blockquote>
            <p>«Детская линейка выглядит дружелюбно, но не слишком детсадовски.»</p>
            <cite>Марина, Екатеринбург</cite>
          </blockquote>
        </div>
      </section>

      <section className={styles.faq} id="faq">
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}>Questions from earth</p>
          <h2>Частые вопросы</h2>
        </div>
        <div className={styles.faqList}>
          {faqs.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <div>
          <p className={styles.kicker}>Ready for launch</p>
          <h2>Собираем первый магазин вокруг нового бренда</h2>
          <p>
            Космо-гумми для каждой цели дня: удобно выбирать, легко добавлять в
            корзину, быстро заказывать и получать на дом.
          </p>
        </div>
        <a href="#buybox">
          Начать покупку
          <ArrowRight aria-hidden="true" size={18} />
        </a>
      </section>

      <footer className={styles.footer}>
        <span>Cosmo Gummy</span>
        <span>Концепт витрины для Realize — AI Platform</span>
        <span>Адаптация для розницы в РФ</span>
      </footer>
    </main>
  )
}
