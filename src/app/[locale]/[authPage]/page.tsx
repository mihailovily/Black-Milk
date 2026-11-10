import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { AuthForm, type AuthPage } from '@/components/auth-form';
import { getUiMessages } from '@/components/ui-messages';
import { SiteShell } from '@/components/site-shell';

const pages: Record<
  AuthPage,
  | 'signInTitle'
  | 'signUpTitle'
  | 'forgotTitle'
  | 'resetTitle'
  | 'verifyTitle'
  | 'activateTitle'
> = {
  'sign-in': 'signInTitle',
  'sign-up': 'signUpTitle',
  'forgot-password': 'forgotTitle',
  'reset-password': 'resetTitle',
  'verify-email': 'verifyTitle',
  activate: 'activateTitle',
};
type Props = {
  params: Promise<{ locale: string; authPage: string }>;
  searchParams: Promise<{ token?: string; error?: string; verified?: string }>;
};
export async function generateMetadata({ params }: Props) {
  const { locale, authPage } = await params;
  if (!hasLocale(routing.locales, locale) || !Object.hasOwn(pages, authPage))
    notFound();
  return {
    title: `Black&Milk — ${getUiMessages(locale).Auth[pages[authPage as AuthPage]]}`,
  };
}
export default async function AuthScreen({ params, searchParams }: Props) {
  const { locale, authPage } = await params;
  if (!hasLocale(routing.locales, locale) || !Object.hasOwn(pages, authPage))
    notFound();
  setRequestLocale(locale);
  const query = await searchParams;
  const messages = getUiMessages(locale);
  const path =
    '/' +
    authPage +
    (query.token ? '?token=' + encodeURIComponent(query.token) : '');
  return (
    <SiteShell locale={locale} path={path}>
      <div className="auth-heading">
        <h1>
          <strong>{messages.Auth[pages[authPage as AuthPage]]}</strong>
        </h1>
      </div>
      <AuthForm
        locale={locale}
        mode={authPage as AuthPage}
        token={query.token}
        initialError={query.error}
        verified={query.verified === '1'}
        messages={messages}
      />
    </SiteShell>
  );
}
