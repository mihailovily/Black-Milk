import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { requireSession } from '@/server/security';
import { AppError } from '@/server/errors';
import { routing } from '@/i18n/routing';
import { SiteShell } from './site-shell';
import { getUiMessages } from './ui-messages';

export async function ProtectedScreen({
  locale,
  path,
  admin = false,
  title,
  children,
}: {
  locale: string;
  path: string;
  admin?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const m = getUiMessages(locale);
  let denied: 'FORBIDDEN' | 'SERVICE_UNAVAILABLE' | 'ACCOUNT_BLOCKED' | null =
    null;
  try {
    await requireSession(await headers(), admin);
  } catch (error) {
    if (error instanceof AppError && error.code === 'UNAUTHORIZED')
      redirect(`/${locale}/sign-in`);
    denied =
      error instanceof AppError && error.code === 'FORBIDDEN'
        ? 'FORBIDDEN'
        : error instanceof AppError && error.code === 'ACCOUNT_BLOCKED'
          ? 'ACCOUNT_BLOCKED'
          : 'SERVICE_UNAVAILABLE';
  }
  return (
    <SiteShell locale={locale} path={path}>
      {denied ? (
        <section className="panel service-state">
          <h1>
            <strong>
              {title || (admin ? m.Admin.title : m.Account.title)}
            </strong>
          </h1>
          <p role="alert">{m.Errors[denied]}</p>
          <a
            className="button"
            href={
              denied === 'SERVICE_UNAVAILABLE'
                ? `/${locale}${path}`
                : `/${locale}/account`
            }
          >
            {denied === 'SERVICE_UNAVAILABLE' ? m.Common.retry : m.Common.back}
          </a>
        </section>
      ) : (
        children
      )}
    </SiteShell>
  );
}
