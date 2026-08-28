/**
 * @file src/app/(reference)/reference/alien-gummies/product/ProductFaqSection.tsx
 * @version 2026-07-21
 * @description Route-private FAQ matching the reference PDP two-column accordion structure.
 */
import styles from "./ProductFaqSection.module.css";

const faqItems = [
  [
    "Малиновый лимонад будет постоянным вкусом?",
    "Нет. Это лимитированный выпуск, доступный только пока товар есть в наличии.",
  ],
  [
    "Будет ли подписка дальше приходить с этим вкусом?",
    "После лимитированного выпуска подписка вернётся к базовым йогуртовым ягодам, если вы не выберете другой доступный вкус.",
  ],
  [
    "Как поменять вкус в следующем заказе?",
    "Откройте управление подпиской до даты списания и выберите доступный вкус для ближайшей отправки.",
  ],
  [
    "Когда приедут мармеладки?",
    "Заказ обычно передаётся в доставку в течение 24 часов. Срок зависит от региона и выбранной службы.",
  ],
  [
    "Что находится внутри заказа?",
    "В большой упаковке находятся 28 индивидуальных стиков — по одной дневной порции в каждом.",
  ],
  [
    "Когда можно заметить эффект?",
    "Ощущения индивидуальны. Важны регулярность, рацион и образ жизни; продукт не заменяет полноценное питание.",
  ],
  [
    "Как оформить возврат?",
    "Для первого заказа действует простая гарантия 30 дней. Напишите в поддержку с номером заказа.",
  ],
] as const;

/** Renders the seven-question reference FAQ and conversion CTA. */
export function ProductFaqSection() {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <h2>Остались вопросы?</h2>
        <div className={styles.list}>
          {faqItems.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
      <a className={styles.cta} href="#purchase">
        Сэкономить и оформить доставку
      </a>
    </section>
  );
}
