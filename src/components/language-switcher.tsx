import { getLocale, getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';

export async function LanguageSwitcher() {
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations('Languages'),
  ]);

  return (
    <nav className="language-switcher" aria-label={t('label')}>
      {routing.locales.map((language) => (
        <a
          key={language}
          href={`/${language}`}
          lang={language}
          hrefLang={language}
          aria-label={t(language)}
          aria-current={locale === language ? 'page' : undefined}
        >
          {language.toUpperCase()}
        </a>
      ))}
    </nav>
  );
}
