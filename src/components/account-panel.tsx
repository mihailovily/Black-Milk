'use client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useState } from 'react';
import { createAuthClient } from 'better-auth/react';
import type { Profile, SessionSummary } from '@/contracts/account';
import type { UiMessages } from './ui-messages';
import { useRemote } from './use-remote';
import { api, errorCode, authenticationError } from './api-client';
import { Field } from './field';
import { ConfirmDialog } from './confirm-dialog';
import { dateText, Feedback, RemoteState } from './workspace-ui';

const authClient = createAuthClient();
export function AccountPanel({
  locale,
  security = false,
  messages: m,
}: {
  locale: string;
  security?: boolean;
  messages: UiMessages;
}) {
  const router = useRouter();
  const profile = useRemote<Profile>('/api/v1/me');
  const sessions = useRemote<SessionSummary[]>(
    security ? '/api/v1/me/sessions' : null,
  );
  const config = useRemote<{ google: boolean }>(
    security ? '/api/v1/auth-config' : null,
  );
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<SessionSummary | 'others' | null>(
    null,
  );
  async function action(
    task: () => Promise<unknown>,
    message = m.Common.success,
  ) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await task();
      setSuccess(message);
      profile.reload();
      sessions.reload();
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
  }
  const person = profile.data;
  return (
    <>
      <div className="workspace-title">
        <h1>
          <strong>{m.Account.title}</strong>
        </h1>
        <button
          type="button"
          className="inline-link"
          onClick={async () => {
            await authClient.signOut();
            router.replace(`/${locale}/sign-in`);
          }}
        >
          {m.Common.signOut}
        </button>
      </div>
      <div className="workspace-grid">
        <aside className="workspace-nav">
          <nav aria-label={m.Account.title}>
            <a href={`/${locale}/coffee`}>{m.Coffee.title}</a>
            <a href={`/${locale}/brews`}>{m.Coffee.brews}</a>
            <a
              href={`/${locale}/account`}
              aria-current={!security ? 'page' : undefined}
            >
              {m.Account.profile}
            </a>
            <a
              href={`/${locale}/account/security`}
              aria-current={security ? 'page' : undefined}
            >
              {m.Account.security}
            </a>
            {person?.role === 'admin' ? (
              <a href={`/${locale}/admin/users`}>{m.Account.admin}</a>
            ) : null}
          </nav>
        </aside>
        <div className="workspace-content">
          <RemoteState
            loading={profile.loading}
            error={profile.error}
            onRetry={profile.reload}
            messages={m}
          />
          <Feedback code={error} success={success} messages={m} />
          {person && !security ? (
            <section className="panel">
              <div className="profile-heading">
                {person.image ? (
                  <Image
                    src={person.image}
                    width={64}
                    height={64}
                    unoptimized
                    alt={person.name}
                    className="avatar"
                  />
                ) : (
                  <span className="avatar initials" aria-hidden="true">
                    {person.name
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((word) => word[0])
                      .join('')}
                  </span>
                )}
                <div>
                  <h2>{m.Account.profile}</h2>
                  <p className="muted">{m.Account.profileDescription}</p>
                </div>
              </div>
              <form
                key={person.name}
                className="stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void action(() =>
                    api('/api/v1/me', 'PATCH', {
                      name: String(data.get('name')),
                    }),
                  );
                }}
              >
                <Field
                  label={m.Common.name}
                  name="name"
                  defaultValue={person.name}
                  required
                  maxLength={100}
                  autoComplete="name"
                />
                <Field
                  label={m.Common.email}
                  value={person.email}
                  readOnly
                  type="email"
                  hint={m.Account.readOnly}
                />
                <button className="button fit-content" disabled={busy}>
                  {busy ? m.Common.sending : m.Common.save}
                </button>
              </form>
            </section>
          ) : null}
          {person && security ? (
            <>
              <section className="panel">
                <h2>{m.Account.providers}</h2>
                <p>
                  {person.providers
                    .map((p) =>
                      p === 'credential'
                        ? m.Account.credential
                        : m.Account.google,
                    )
                    .join(' · ')}
                </p>
                {!person.providers.includes('google') ? (
                  <button
                    className="button button-secondary"
                    disabled={busy || !config.data?.google}
                    onClick={async () => {
                      setBusy(true);
                      setError('');
                      try {
                        const result = await authClient.linkSocial({
                          provider: 'google',
                          callbackURL: `/${locale}/account/security`,
                        });
                        if (result.error) throw new Error(result.error.code);
                      } catch {
                        setError('SERVICE_UNAVAILABLE');
                        setBusy(false);
                      }
                    }}
                  >
                    {m.Account.linkGoogle}
                  </button>
                ) : null}
                {!person.providers.includes('credential') ? (
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const result = await authClient.requestPasswordReset({
                          email: person.email,
                          redirectTo: `/${locale}/reset-password`,
                        });
                        if (result.error) throw new Error(result.error.code);
                      }, m.Auth.mailSent)
                    }
                  >
                    {m.Account.addPassword}
                  </button>
                ) : null}
              </section>
              {person.providers.includes('credential') ? (
                <section className="panel">
                  <h2>{m.Account.changePassword}</h2>
                  <form
                    className="stack-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const data = new FormData(form);
                      setBusy(true);
                      setError('');
                      setSuccess('');
                      try {
                        const result = await authClient.changePassword({
                          currentPassword: String(data.get('currentPassword')),
                          newPassword: String(data.get('newPassword')),
                          revokeOtherSessions: true,
                        });
                        if (result.error) {
                          setError(authenticationError(result.error));
                          return;
                        }
                        setSuccess(m.Account.passwordUpdated);
                        form.reset();
                        sessions.reload();
                      } catch {
                        setError('SERVICE_UNAVAILABLE');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Field
                      label={m.Account.currentPassword}
                      name="currentPassword"
                      type="password"
                      required
                      autoComplete="current-password"
                    />
                    <Field
                      label={m.Account.newPassword}
                      name="newPassword"
                      type="password"
                      required
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                      hint={m.Common.passwordHint}
                    />
                    <button className="button fit-content" disabled={busy}>
                      {busy ? m.Common.sending : m.Common.save}
                    </button>
                  </form>
                </section>
              ) : null}
              <section className="panel">
                <div className="section-toolbar">
                  <h2>{m.Account.sessions}</h2>
                  <button
                    className="inline-link"
                    disabled={busy || !sessions.data?.some((s) => !s.current)}
                    onClick={() => setConfirm('others')}
                  >
                    {m.Account.revokeOthers}
                  </button>
                </div>
                <RemoteState
                  loading={sessions.loading}
                  error={sessions.error}
                  onRetry={sessions.reload}
                  messages={m}
                />
                {sessions.data?.map((item) => (
                  <article key={item.id} className="session-row">
                    <div>
                      <strong>
                        {item.current ? m.Account.current : m.Account.sessions}
                      </strong>
                      <p className="break-word">
                        {item.userAgent || m.Account.unknownDevice}
                      </p>
                      <small>
                        {m.Common.created}: {dateText(item.createdAt, locale)}
                        <br />
                        {m.Account.expires}: {dateText(item.expiresAt, locale)}
                      </small>
                    </div>
                    <button
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() => setConfirm(item)}
                    >
                      {m.Account.revoke}
                    </button>
                  </article>
                ))}
              </section>
            </>
          ) : null}
        </div>
      </div>
      {confirm ? (
        <ConfirmDialog
          title={
            confirm === 'others' ? m.Account.revokeOthers : m.Account.revoke
          }
          messages={m}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const target = confirm;
            await action(async () => {
              await api(
                '/api/v1/me/sessions' +
                  (target === 'others' ? '' : '/' + target.id),
                'DELETE',
              );
              if (target !== 'others' && target.current)
                router.replace(`/${locale}/sign-in`);
            });
            setConfirm(null);
          }}
        />
      ) : null}
    </>
  );
}
