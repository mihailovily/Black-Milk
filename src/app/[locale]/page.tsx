import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { routing } from '@/i18n/routing';

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
    <div className="site-shell">
      <a className="skip-link" href="#main">
        {t('skip')}
      </a>
      <header className="site-header">
        <span className="wordmark" aria-label="Black and Milk">
          Black<span className="ampersand">&</span>Milk
        </span>
        <LanguageSwitcher />
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1 id="hero-title">
            {t('title')} <em>{t('titleEmphasis')}</em>
          </h1>
          <p className="hero-description">{t('description')}</p>
          <a className="text-link" href="#journal">
            {t('explore')} <span aria-hidden="true">↘</span>
          </a>
        </section>

        <section
          className="journal"
          id="journal"
          aria-labelledby="journal-title"
        >
          <div className="journal-intro">
            <h2 id="journal-title">{t('journalTitle')}</h2>
            <p>{t('journalDescription')}</p>
          </div>
          <dl className="journal-features">
            <div>
              <dt>{t('beansTitle')}</dt>
              <dd>{t('beansDescription')}</dd>
            </div>
            <div>
              <dt>{t('brewsTitle')}</dt>
              <dd>{t('brewsDescription')}</dd>
            </div>
            <div>
              <dt>{t('stockTitle')}</dt>
              <dd>{t('stockDescription')}</dd>
            </div>
          </dl>
        </section>
      </main>

      <footer className="site-footer">
        <p>{t('status')}</p>
        <span>{t('footer')}</span>
      </footer>
    </div>
  );
}
