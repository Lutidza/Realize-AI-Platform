'use client'

import type { CSSProperties } from 'react'
import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import styles from './page.module.css'

const media = {
  centerGummy:
    'https://gruns.co/cdn/shop/files/gummy_49ae5bc4-1a92-4aaf-8f02-bd9fd6f13100.webp?v=1779380980&width=400',
  floatLeft: 'https://gruns.co/cdn/shop/files/Angle04.png?v=1778720518&width=200',
  floatRight: 'https://gruns.co/cdn/shop/files/Angle03.png?v=1778720530&width=200',
  packBack: 'https://gruns.co/cdn/shop/files/sachet-rip.webp?v=1779380961&width=600',
  packFront: 'https://gruns.co/cdn/shop/files/sachet-front.webp?v=1779380947&width=800',
}

const lines = ['60+ НУТРИЕНТОВ', '21 ВИТАМИН И МИНЕРАЛ', '6Г КЛЕТЧАТКИ', 'В одной упаковке']

const lineTweenDuration = 0.6
const finalTweenDuration = 0.45
const hiddenLineOffset = 112

type ParallaxStyle = CSSProperties & Record<`--${string}`, string>

export function BenefitsParallax() {
  const sectionRef = useRef<HTMLElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<Array<HTMLSpanElement | null>>([])
  const centerGummyRef = useRef<HTMLImageElement>(null)

  useLayoutEffect(() => {
    const section = sectionRef.current
    const sticky = stickyRef.current
    const centerGummy = centerGummyRef.current

    if (!section || !sticky || !centerGummy) {
      return
    }

    gsap.registerPlugin(ScrollTrigger)

    const compactViewport = window.matchMedia('(max-width: 991px)')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let cleanupAnimations = () => {}

    const createAnimations = () => {
      cleanupAnimations()

      const isCompact = compactViewport.matches
      const lineElements = lineRefs.current.filter(
        (element): element is HTMLSpanElement => element !== null,
      )
      const lastLineElement = lineElements[lineElements.length - 1]
      const riseStart = isCompact ? 8 : 16
      const finalRise = isCompact ? -56 : -112

      gsap.set(sticky, { clearProps: 'all' })
      gsap.set(lineElements, { clearProps: 'all' })
      gsap.set(centerGummy, { clearProps: 'all' })

      if (reducedMotion.matches) {
        gsap.set(lineElements, { color: '#ffffff', y: 0, yPercent: 0 })
        gsap.set(lastLineElement, { color: '#ffcc2f' })
        gsap.set(centerGummy, { y: finalRise, yPercent: 0 })
        cleanupAnimations = () => {}
        return
      }

      gsap.set(lineElements, {
        color: '#ffffff',
        display: 'block',
        y: 0,
        yPercent: hiddenLineOffset,
      })
      gsap.set(centerGummy, { y: riseStart, yPercent: 0 })

      const pinTrigger = ScrollTrigger.create({
        anticipatePin: 1,
        end: () => `+=${sticky.offsetHeight * 1.1}`,
        id: 'cosmo-benefits-pin',
        invalidateOnRefresh: true,
        pin: true,
        pinSpacing: true,
        refreshPriority: -1,
        start: () => (isCompact ? 'center center' : 'top top'),
        trigger: sticky,
      })

      const timeline = gsap.timeline({
        scrollTrigger: {
          end: () => `+=${sticky.offsetHeight}`,
          id: 'cosmo-benefits-words',
          invalidateOnRefresh: true,
          scrub: true,
          start: () => (isCompact ? 'center 50%' : 'top top'),
          trigger: sticky,
        },
      })

      lineElements.forEach((lineElement) => {
        timeline.fromTo(
          lineElement,
          { y: 0, yPercent: hiddenLineOffset },
          {
            duration: lineTweenDuration,
            ease: 'power2.out',
            overwrite: 'auto',
            y: 0,
            yPercent: 0,
          },
        )
      })

      timeline.addLabel('final-accent')
      timeline.to(
        centerGummy,
        {
          duration: finalTweenDuration,
          ease: 'power2.out',
          overwrite: 'auto',
          y: finalRise,
          yPercent: 0,
        },
        'final-accent',
      )
      timeline.to(
        lastLineElement,
        {
          color: '#ffcc2f',
          duration: finalTweenDuration,
          ease: 'power2.out',
          overwrite: 'auto',
        },
        'final-accent',
      )

      cleanupAnimations = () => {
        timeline.scrollTrigger?.kill()
        timeline.kill()
        pinTrigger.kill()
      }

      ScrollTrigger.refresh()
    }

    createAnimations()

    const refreshAnimations = () => {
      createAnimations()
    }

    compactViewport.addEventListener('change', refreshAnimations)
    reducedMotion.addEventListener('change', refreshAnimations)
    window.addEventListener('load', refreshAnimations)

    return () => {
      compactViewport.removeEventListener('change', refreshAnimations)
      reducedMotion.removeEventListener('change', refreshAnimations)
      window.removeEventListener('load', refreshAnimations)
      cleanupAnimations()
    }
  }, [])

  return (
    <section
      aria-label="Ключевые ингредиенты Cosmo Gummy"
      className={styles.parallaxBenefits}
      ref={sectionRef}
      style={
        {
          '--parallax-last-color': '#ffffff',
          '--parallax-line-0': '112%',
          '--parallax-line-1': '112%',
          '--parallax-line-2': '112%',
          '--parallax-line-3': '112%',
          '--parallax-rise': '16px',
        } as ParallaxStyle
      }
    >
      <div className={styles.parallaxSticky} ref={stickyRef}>
        <div className={styles.parallaxWords}>
          {lines.map((line, index) => (
            <span className={styles.parallaxLineMask} key={line}>
              <span
                className={`${styles.parallaxLine} ${
                  index === 0
                    ? styles.parallaxLineOne
                    : index === 1
                      ? styles.parallaxLineTwo
                      : index === 2
                        ? styles.parallaxLineThree
                        : styles.parallaxLineFour
                }`}
                ref={(element) => {
                  lineRefs.current[index] = element
                }}
              >
                {line}
              </span>
            </span>
          ))}
        </div>

        <img
          alt=""
          aria-hidden="true"
          className={`${styles.parallaxFloat} ${styles.parallaxFloatLeft}`}
          src={media.floatLeft}
        />
        <img
          alt=""
          aria-hidden="true"
          className={`${styles.parallaxFloat} ${styles.parallaxFloatRight}`}
          src={media.floatRight}
        />

        <div className={styles.parallaxProduct} aria-hidden="true">
          <img className={styles.parallaxPackBack} src={media.packBack} alt="" />
          <img
            className={styles.parallaxCenterGummy}
            ref={centerGummyRef}
            src={media.centerGummy}
            alt=""
          />
          <img className={styles.parallaxPackFront} src={media.packFront} alt="" />
        </div>
      </div>
    </section>
  )
}
