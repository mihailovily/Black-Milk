'use client';
import type { UiMessages } from './ui-messages';
export function Feedback({
  code,
  success,
  messages: m,
}: {
  code?: string;
  success?: string;
  messages: UiMessages;
}) {
  return (
    <>
      {code ? (
        <p className="notice notice-error" role="alert">
          {m.Errors[code as keyof typeof m.Errors] ||
            m.Errors.SERVICE_UNAVAILABLE}
        </p>
      ) : null}
      {success ? (
        <p className="notice notice-success" role="status">
          {success}
        </p>
      ) : null}
    </>
  );
}
export function RemoteState({
  loading,
  error,
  onRetry,
  messages: m,
}: {
  loading: boolean;
  error?: string;
  onRetry: () => void;
  messages: UiMessages;
}) {
  return (
    <>
      {loading ? (
        <p className="loading-state" role="status">
          {m.Common.loading}
        </p>
      ) : null}
      {error ? (
        <div>
          <Feedback code={error} messages={m} />
          <button
            className="button button-secondary"
            type="button"
            onClick={onRetry}
          >
            {m.Common.retry}
          </button>
        </div>
      ) : null}
    </>
  );
}
export function dateText(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
export function WorkspaceNav({
  locale,
  selected,
  admin = false,
  messages: m,
}: {
  locale: string;
  selected: string;
  admin?: boolean;
  messages: UiMessages;
}) {
  const entries = admin
    ? ['users', 'invitations', 'access-grants', 'settings', 'audit']
    : ['profile', 'security'];
  const nav = (
    <nav aria-label={admin ? m.Admin.sections : m.Account.title}>
      {entries.map((section) => (
        <a
          key={section}
          href={`/${locale}/${admin ? 'admin/' + section : section === 'profile' ? 'account' : 'account/security'}`}
          aria-current={selected === section ? 'page' : undefined}
        >
          {admin
            ? m.Admin[section as 'users']
            : m.Account[section as 'profile']}
        </a>
      ))}
      {admin ? <a href={`/${locale}/account`}>{m.Common.account}</a> : null}
    </nav>
  );
  return (
    <aside className="workspace-nav">
      <div className="desktop-nav">{nav}</div>
      <details className="mobile-nav">
        <summary>{admin ? m.Admin.sections : m.Account.title}</summary>
        {nav}
      </details>
    </aside>
  );
}
export function Pagination({
  page,
  total,
  setPage,
  messages: m,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
  messages: UiMessages;
}) {
  const pages = Math.max(1, Math.ceil(total / 20));
  return (
    <nav className="pagination" aria-label={m.Common.page}>
      <button
        className="button button-secondary"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        {m.Common.previous}
      </button>
      <span>
        {m.Common.page} {page} / {pages}
      </span>
      <button
        className="button button-secondary"
        disabled={page >= pages}
        onClick={() => setPage(page + 1)}
      >
        {m.Common.next}
      </button>
    </nav>
  );
}
