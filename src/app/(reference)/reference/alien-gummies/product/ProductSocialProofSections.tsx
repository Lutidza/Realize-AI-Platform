/**
 * @file src/app/(reference)/reference/alien-gummies/product/ProductSocialProofSections.tsx
 * @version 2026-07-21
 * @description Route-private customer review and UGC sections for the Cosmo Gummy product reference.
 */
"use client";

import { ArrowLeft, ArrowRight, MessageCircle, Star } from "lucide-react";
import { useState } from "react";

import styles from "./ProductSocialProofSections.module.css";

const reviewTopics = [
  "Все отзывы",
  "Вкус",
  "Удобство",
  "Энергия",
  "Пищеварение",
  "Состав",
] as const;

const featuredReviews = [
  {
    author: "Алина, Москва",
    quote:
      "Наконец-то полезная привычка, о которой не приходится вспоминать. Стик лежит рядом с завтраком, а вкус ощущается как маленький десерт.",
    title: "Легко соблюдать каждый день",
    topics: ["Удобство", "Энергия"],
  },
  {
    author: "Михаил, Казань",
    quote:
      "Удобно брать с собой, ничего не нужно отмерять или запивать. Особенно нравится понятный состав и одна готовая дневная порция.",
    title: "Один стик вместо набора банок",
    topics: ["Удобство", "Пищеварение", "Состав"],
  },
  {
    author: "Екатерина, Санкт-Петербург",
    quote:
      "Йогуртовые ягоды — нежные, с лёгкой кислинкой и без приторности. Формат оказался настолько простым, что я действительно стала регулярнее.",
    title: "Вкус, к которому хочется вернуться",
    topics: ["Вкус", "Пищеварение"],
  },
];

const visualReviewLabels = [
  "Полина — о ежедневном ритуале",
  "Антон — об удобном формате",
  "Вера — о вкусе и текстуре",
  "Кирилл — о составе продукта",
  "Мария — о первом месяце",
];

type ProductSocialProofSectionsProps = {
  images: string[];
};

function ReviewStars({ size = 17 }: { size?: number }) {
  return (
    <span aria-label="Оценка 5 из 5" className={styles.stars}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star aria-hidden="true" fill="currentColor" key={index} size={size} />
      ))}
    </span>
  );
}

/** Renders the reference review tabs, editorial reviews, and visual UGC rail. */
export function ProductSocialProofSections({
  images,
}: ProductSocialProofSectionsProps) {
  const [activeTopic, setActiveTopic] =
    useState<(typeof reviewTopics)[number]>("Все отзывы");
  const [activeVisualIndex, setActiveVisualIndex] = useState(0);
  const orderedReviews =
    activeTopic === "Все отзывы"
      ? featuredReviews
      : [...featuredReviews].sort(
          (left, right) =>
            Number(right.topics.some((topic) => topic === activeTopic)) -
            Number(left.topics.some((topic) => topic === activeTopic)),
        );

  const showPreviousVisual = () => {
    setActiveVisualIndex(
      (current) =>
        (current - 1 + visualReviewLabels.length) % visualReviewLabels.length,
    );
  };

  const showNextVisual = () => {
    setActiveVisualIndex(
      (current) => (current + 1) % visualReviewLabels.length,
    );
  };

  return (
    <div className={styles.socialProof}>
      <section
        aria-labelledby="community-reviews-title"
        className={styles.reviewsSection}
      >
        <div className={styles.reviewsInner}>
          <div className={styles.communityHeader}>
            <ReviewStars size={22} />
            <p className={styles.rating}>4,9 звезды · проверенные покупатели</p>
            <h2 id="community-reviews-title">
              1 000 000+ покупателей закрывают пробелы в рационе
            </h2>
          </div>

          <ul
            aria-label="Темы отзывов"
            className={styles.topicTabs}
            role="tablist"
          >
            {reviewTopics.map((topic, index) => (
              <li key={topic} role="presentation">
                <button
                  aria-controls="community-review-panel"
                  aria-selected={activeTopic === topic}
                  className={`${styles.topicButton} ${activeTopic === topic ? styles.activeTopic : ""}`}
                  id={`review-topic-${index}`}
                  onClick={() => setActiveTopic(topic)}
                  role="tab"
                  type="button"
                >
                  {topic}
                </button>
              </li>
            ))}
          </ul>

          <div
            aria-labelledby={`review-topic-${reviewTopics.indexOf(activeTopic)}`}
            className={styles.reviewGrid}
            id="community-review-panel"
            role="tabpanel"
          >
            {orderedReviews.map((review) => (
              <figure className={styles.reviewCard} key={review.title}>
                <ReviewStars />
                <h3>{review.title}</h3>
                <blockquote>«{review.quote}»</blockquote>
                <figcaption>
                  <strong>{review.author}</strong>
                  <span>Подтверждённая покупка</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="visual-reviews-title"
        className={styles.ugcSection}
      >
        <h2 className={styles.srOnly} id="visual-reviews-title">
          Визуальные отзывы покупателей
        </h2>

        <div className={styles.ugcGrid}>
          {visualReviewLabels.map((label, index) => {
            const image =
              images.length > 0 ? images[index % images.length] : undefined;

            return (
              <figure
                className={`${styles.visualCard} ${index === activeVisualIndex ? styles.activeVisual : ""}`}
                key={label}
              >
                {image ? (
                  <span
                    aria-hidden="true"
                    className={styles.visualImage}
                    style={{ backgroundImage: `url("${image}")` }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className={styles.imagePlaceholder}
                  />
                )}
                <span aria-hidden="true" className={styles.visualShade} />
                <span aria-hidden="true" className={styles.visualBadge}>
                  <MessageCircle fill="currentColor" size={22} />
                </span>
                <figcaption>{label}</figcaption>
              </figure>
            );
          })}
        </div>

        <div
          aria-label="Управление визуальными отзывами"
          className={styles.mobileCarouselControls}
        >
          <button
            aria-label="Предыдущий визуальный отзыв"
            className={styles.arrowControl}
            onClick={showPreviousVisual}
            type="button"
          >
            <ArrowLeft size={20} />
          </button>
          <span className={styles.carouselDots}>
            {visualReviewLabels.map((label, index) => (
              <button
                aria-label={`Показать визуальный отзыв ${index + 1}`}
                aria-pressed={index === activeVisualIndex}
                className={`${styles.dotControl} ${index === activeVisualIndex ? styles.activeDot : ""}`}
                key={label}
                onClick={() => setActiveVisualIndex(index)}
                type="button"
              />
            ))}
          </span>
          <button
            aria-label="Следующий визуальный отзыв"
            className={styles.arrowControl}
            onClick={showNextVisual}
            type="button"
          >
            <ArrowRight size={20} />
          </button>
        </div>

        <div className={styles.disclosure}>
          <p>
            Отзывы отражают личный опыт покупателей. Результаты индивидуальны и
            могут отличаться.
          </p>
          <small>
            Продукт не является лекарственным средством. Перед применением
            ознакомьтесь с составом и рекомендациями на упаковке.
          </small>
        </div>
      </section>
    </div>
  );
}
