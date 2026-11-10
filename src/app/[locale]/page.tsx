import Image from 'next/image';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { routing } from '@/i18n/routing';

const photos = {
  beans: '/images/coffee/mike-kenneally-TD4DBagg2wE-unsplash.jpg',
  brews: '/images/coffee/andrew-valdivia-mMI5sdLFoHM-unsplash.jpg',
  ritual: '/images/coffee/rizky-subagja-1k7TnX5GAww-unsplash.jpg',
  flavour: '/images/coffee/demi-deherrera-L-sm1B4L1Ns-unsplash.jpg',
};
const features = ['beans', 'brews', 'stock'] as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('Home');

  return (
    <>
      <a className="skip-link" href="#main">
        {t('skip')}
      </a>
      <div className="status-bar">
        <div className="container status-content">
          <span className="status-dot" aria-hidden="true" />
          <p>{t('statusShort')}</p>
          <a href="#journal">
            {t('statusLink')} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      <div className="container site-shell">
        <header className="site-header">
          <a
            className="wordmark"
            href={`/${locale}`}
            aria-label="Black and Milk"
          >
            Black<span className="ampersand">&</span>Milk
            <span className="wordmark-dot">.</span>
          </a>
          <a className="header-link" href="#journal">
            {t('navJournal')}
          </a>
          <LanguageSwitcher />
        </header>

        <main id="main" tabIndex={-1}>
          <section className="hero" aria-labelledby="hero-title">
            <p className="eyebrow">{t('eyebrow')}</p>
            <h1 id="hero-title">
              <strong>{t('title')}</strong> <span>{t('titleEmphasis')}</span>
            </h1>
            <p className="hero-description">{t('description')}</p>
            <div className="category-grid">
              {features.map((feature) => (
                <a
                  className={`category-card category-card--${feature}`}
                  href={`#${feature}`}
                  key={feature}
                >
                  <Image
                    src={feature === 'brews' ? photos.brews : photos.beans}
                    alt=""
                    fill
                    sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1280px) 33vw, 384px"
                    preload={feature === 'beans'}
                  />
                  <span className="category-title">{t(`${feature}Title`)}</span>
                  <span className="category-arrow" aria-hidden="true">
                    ↗
                  </span>
                </a>
              ))}
            </div>
            <a className="button" href="#journal">
              {t('explore')} <span aria-hidden="true">↓</span>
            </a>
          </section>

          <section
            className="journal"
            id="journal"
            aria-labelledby="journal-title"
          >
            <div className="section-heading">
              <p className="eyebrow">Black&Milk / {t('navJournal')}</p>
              <h2 id="journal-title">{t('journalTitle')}</h2>
              <p>{t('journalDescription')}</p>
            </div>
            <dl className="journal-features">
              {features.map((feature, index) => (
                <div id={feature} key={feature}>
                  <dt>
                    <span className="feature-number" aria-hidden="true">
                      0{index + 1}
                    </span>
                    {t(`${feature}Title`)}
                  </dt>
                  <dd>{t(`${feature}Description`)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="stories" aria-label={t('storiesLabel')}>
            <article className="story-card">
              <div className="story-image story-image--ritual">
                <Image
                  src={photos.ritual}
                  alt={t('ritualAlt')}
                  fill
                  sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1280px) 50vw, 588px"
                />
              </div>
              <div className="story-copy">
                <p className="eyebrow">{t('ritualEyebrow')}</p>
                <h2>{t('ritualTitle')}</h2>
                <p>{t('ritualDescription')}</p>
              </div>
            </article>
            <article className="story-card">
              <div className="story-image story-image--flavour">
                <Image
                  src={photos.flavour}
                  alt={t('flavourAlt')}
                  fill
                  sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1280px) 50vw, 588px"
                />
              </div>
              <div className="story-copy">
                <p className="eyebrow">{t('flavourEyebrow')}</p>
                <h2>{t('flavourTitle')}</h2>
                <p>{t('flavourDescription')}</p>
              </div>
            </article>
          </section>
        </main>

        <footer className="site-footer">
          <div>
            <span className="footer-brand">Black&Milk.</span>
            <p>{t('footer')}</p>
          </div>
          <p className="footer-status">{t('status')}</p>
        </footer>
      </div>
    </>
  );
}
