/**
 * @file src/app/(reference)/reference/realize-ai/RealizeHomeReference.component.tsx
 * @version 1.0.0
 * @date 2026-09-16
 * @description Собирает отдельный интерактивный референс главной Realize.
 */

'use client'

import { UiBadge, UiButton, UiSurface, UiTheme } from '@realize/ui-kit'
import {
  ArrowDown, ArrowRight, Check, Code2, Eye, Menu, MessageSquare,
  Moon, ShoppingBag, Sparkles, Sun, X,
} from 'lucide-react'
import { benefits, capabilities, copy, navigation, process } from './realizeHomeReference.content'
import { RealizeWorkflowDemo } from './RealizeWorkflowDemo.component'
import { useRealizeHomeReference } from './useRealizeHomeReference.hook'
import styles from './RealizeHomeReference.module.css'

const capabilityIcons = [MessageSquare, Code2, Eye, ShoppingBag]

/** Самостоятельная презентация с локальным состоянием и демонстрационными данными. */
export function RealizeHomeReference() {
  const model = useRealizeHomeReference()

  return (
    <UiTheme mode={model.theme} className={styles.page}>
      <a href="#main" className={styles.skipLink}>К содержимому</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.logo} href="#main" aria-label="Realize — к началу">
            <Sparkles size={25} aria-hidden="true" />Realize<span>AI CMS</span>
          </a>
          <nav className={styles.desktopNav} aria-label="Основная навигация">
            {navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </nav>
          <div className={styles.headerActions}>
            <UiButton
              size="icon"
              variant="ghost"
              onClick={model.toggleTheme}
              aria-label={model.theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
            >
              {model.theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
            </UiButton>
            <UiButton className={`${styles.headerCta} ${styles.wrapButton}`} variant="secondary" onClick={model.showDemo}>
              {copy.watch}
            </UiButton>
            <UiButton
              ref={model.menuButtonRef}
              size="icon"
              variant="ghost"
              className={styles.menuToggle}
              aria-label={model.menuOpen ? 'Закрыть навигацию' : 'Открыть навигацию'}
              aria-expanded={model.menuOpen}
              aria-controls="mobile-navigation"
              onClick={model.toggleMenu}
            >
              {model.menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </UiButton>
          </div>
        </div>
        <nav id="mobile-navigation" className={styles.mobileNav} hidden={!model.menuOpen} aria-label="Мобильная навигация">
          {navigation.map((item) => (
            <a key={item.href} href={item.href} onClick={model.closeMenu}>{item.label}</a>
          ))}
          <UiButton className={styles.wrapButton} onClick={model.showDemo}>{copy.watch}</UiButton>
        </nav>
        <p className={styles.referenceLabel}>{copy.demoLabel}</p>
      </header>

      <main id="main" tabIndex={-1} className={styles.container}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <UiBadge dot>{copy.eyebrow}</UiBadge>
            <h1 id="hero-title">{copy.heroTitle} <span>{copy.heroAccent}</span></h1>
            <p className={styles.heroDescription}>{copy.heroDescription}</p>
            <div className={styles.heroActions}>
              <UiButton className={styles.wrapButton} onClick={model.showDemo}>
                {copy.watch}<ArrowRight size={18} aria-hidden="true" />
              </UiButton>
              <a href="#capabilities" className={styles.textLink}>
                {copy.explore}<ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <p className={styles.heroNote}>{copy.heroNote}</p>
          </div>
          <div ref={model.demoRef} id="scenario" tabIndex={-1} aria-labelledby="workflow-title" className={styles.demoAnchor}>
            <RealizeWorkflowDemo
              step={model.step}
              state={model.state}
              onStepChange={model.setStep}
              onStateChange={model.setState}
              onReset={model.resetDemo}
            />
          </div>
        </section>

        <section id="capabilities" className={styles.section} aria-labelledby="capabilities-title">
          <p className={styles.eyebrow}>01 / Возможности</p>
          <h2 id="capabilities-title">{copy.capabilitiesTitle}</h2>
          <p className={styles.sectionLead}>{copy.capabilitiesDescription}</p>
          <div className={styles.capabilityGrid}>
            {capabilities.map((item, index) => {
              const Icon = capabilityIcons[index] ?? Sparkles
              return (
                <UiSurface key={item.title} className={styles.card}>
                  <Icon size={26} className={styles.accent} aria-hidden="true" />
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </UiSurface>
              )
            })}
          </div>
        </section>

        <section id="approach" className={styles.section} aria-labelledby="approach-title">
          <p className={styles.eyebrow}>02 / Как это работает</p>
          <h2 id="approach-title">{copy.approachTitle}</h2>
          <p className={styles.sectionLead}>{copy.approachDescription}</p>
          <ol className={styles.process}>
            {process.map((item, index) => (
              <li key={item.title}>
                <div className={styles.processNumber}>
                  <span>0{index + 1}</span>
                  {index < process.length - 1 && <ArrowRight size={18} aria-hidden="true" />}
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </li>
            ))}
          </ol>
          <div className={styles.benefits}>
            <h2>{copy.benefitsTitle}</h2>
            <div className={styles.benefitGrid}>
              {benefits.map((item) => (
                <article key={item.title}>
                  <Check size={22} className={styles.accent} aria-hidden="true" />
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="evolution" className={styles.section} aria-labelledby="evolution-title">
          <p className={styles.eyebrow}>03 / Развитие продукта</p>
          <h2 id="evolution-title">{copy.evolutionTitle}</h2>
          <div className={styles.evolutionGrid}>
            <UiSurface className={styles.evolutionCard}>
              <UiBadge dot tone="positive">{copy.today}</UiBadge>
              <h3>{copy.todayTitle}</h3>
              <p>{copy.todayDescription}</p>
              <UiSurface tone="raised" className={styles.browserMock}>
                <div className={styles.browserBar} aria-hidden="true"><span /><span /><span /></div>
                <div className={styles.storeHeading}><ShoppingBag size={20} aria-hidden="true" /><strong>Ваша витрина</strong></div>
                <div className={styles.productGrid} aria-hidden="true">
                  {[0, 1, 2].map((item) => (
                    <UiSurface className={styles.product} key={item}>
                      <ShoppingBag size={30} /><div className={styles.sampleLines}><span /><span /></div>
                    </UiSurface>
                  ))}
                </div>
                <p className={styles.demoNote}>Схематичный образец веб-интерфейса</p>
              </UiSurface>
            </UiSurface>
            <UiSurface tone="accent" className={styles.evolutionCard}>
              <UiBadge>{copy.future}</UiBadge>
              <h3>{copy.futureTitle}</h3>
              <p>{copy.futureDescription}</p>
              <UiSurface tone="raised" className={styles.phoneMock}>
                <UiBadge>{copy.concept}</UiBadge>
                <Sparkles size={28} className={styles.accent} aria-hidden="true" />
                <h4>{copy.mobileTitle}</h4>
                <p>{copy.mobileDescription}</p>
                <div className={styles.sampleLines} aria-hidden="true"><span /><span /></div>
                <div className={styles.phoneNav}>
                  {copy.mobileItems.map((item) => <span key={item}>{item}</span>)}
                </div>
              </UiSurface>
            </UiSurface>
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <Sparkles size={32} className={styles.accent} aria-hidden="true" />
          <h2 id="closing-title">{copy.closingTitle}</h2>
          <p>{copy.closingDescription}</p>
          <UiButton className={styles.wrapButton} onClick={model.showDemo}>
            {copy.repeat}<ArrowRight size={18} aria-hidden="true" />
          </UiButton>
        </section>
        <footer className={styles.footer}><strong>Realize</strong><span>{copy.footer}</span></footer>
      </main>
    </UiTheme>
  )
}
