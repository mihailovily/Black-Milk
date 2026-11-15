import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from './language-switcher';
import { SessionNavigation } from './session-navigation';

export async function SiteHeader({
  locale,
  path = '/',
}: {
  locale: string;
  path?: string;
}) {
  const t = await getTranslations('Common');
  return (
    <header className="site-header">
      <a className="wordmark" href={`/${locale}`} aria-label="Black and Milk">
        Black<span className="ampersand">&</span>Milk
        <span className="wordmark-dot">.</span>
      </a>
      <a className="header-link" href={`/${locale}#journal`}>
        {t('journal')}
      </a>
      <SessionNavigation
        locale={locale}
        signIn={t('signIn')}
        account={t('account')}
        coffee={(await getTranslations('Coffee'))('title')}
      />
      <LanguageSwitcher path={path} />
    </header>
  );
}
export async function SiteFooter() {
  const t = await getTranslations('Home');
  return (
    <footer className="site-footer">
      <div>
        <span className="footer-brand">Black&Milk.</span>
        <p>
          {t('footerBylinePrefix')}{' '}
          <a href="https://mihailovily.github.io/">{t('footerBylineName')}</a>
        </p>
      </div>
      <p className="footer-status">
        {t('footerProjectPrefix')}
        <a href="https://github.com/mihailovily/Black-Milk">
          {t('footerProjectLink')}
        </a>
        {t('footerAffiliationPrefix')}
        <a href="https://shop.tastycoffee.ru/">{t('footerAffiliation')}</a>.
      </p>
    </footer>
  );
}
export async function SiteShell({
  locale,
  path,
  children,
}: {
  locale: string;
  path: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations('Home');
  return (
    <>
      <a className="skip-link" href="#main">
        {t('skip')}
      </a>
      <div className="container site-shell">
        <SiteHeader locale={locale} path={path} />
        <main className="workspace-main" id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
