'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  Profile,
  RegistrationMode,
  SessionSummary,
} from '@/contracts/account';
import type { UiMessages } from './ui-messages';
import { api, errorCode } from './api-client';
import { useRemote } from './use-remote';
import { Field } from './field';
import { ConfirmDialog } from './confirm-dialog';
import {
  WorkspaceNav,
  Pagination,
  RemoteState,
  Feedback,
  dateText,
} from './workspace-ui';

export type AdminSection =
  'users' | 'invitations' | 'access-grants' | 'settings' | 'audit' | 'detail';
type Page<T> = { items: T[]; page: number; total: number; pageSize: number };
type Invitation = {
  id: string;
  email: string;
  name: string;
  expiresAt: string;
  createdAt: string;
};
type Grant = { email: string; createdAt: string };
type Event = {
  id: string;
  action: string;
  actorName: string | null;
  targetEmail: string | null;
  targetId: string | null;
  createdAt: string;
};
type Confirmation = {
  title: string;
  email?: string;
  run: (value: string) => Promise<unknown>;
  after?: () => void;
};

export function AdminPanel({
  locale,
  section,
  userId,
  messages: m,
}: {
  locale: string;
  section: AdminSection;
  userId?: string;
  messages: UiMessages;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const me = useRemote<Profile>('/api/v1/me');
  const users = useRemote<Page<Profile>>(
    section === 'users' ? `/api/v1/admin/users?page=${page}${filters}` : null,
  );
  const person = useRemote<Profile>(
    section === 'detail' ? `/api/v1/admin/users/${userId}` : null,
  );
  const sessions = useRemote<SessionSummary[]>(
    section === 'detail' ? `/api/v1/admin/users/${userId}/sessions` : null,
  );
  const invites = useRemote<Invitation[]>(
    section === 'invitations' ? '/api/v1/admin/invitations' : null,
  );
  const grants = useRemote<Grant[]>(
    section === 'access-grants' ? '/api/v1/admin/access-grants' : null,
  );
  const settings = useRemote<{ registrationMode: RegistrationMode }>(
    section === 'settings' ? '/api/v1/admin/settings' : null,
  );
  const events = useRemote<Page<Event>>(
    section === 'audit' ? `/api/v1/admin/audit?page=${page}` : null,
  );
  async function perform(
    run: () => Promise<unknown>,
    message = m.Common.success,
  ) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await run();
      setSuccess(message);
      for (const remote of [
        users,
        person,
        sessions,
        invites,
        grants,
        settings,
        events,
      ])
        remote.reload();
      return true;
    } catch (e) {
      setError(errorCode(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const title =
    section === 'detail'
      ? person.data?.name || m.Admin.users
      : m.Admin[section];
  const remote =
    section === 'users'
      ? users
      : section === 'detail'
        ? person
        : section === 'invitations'
          ? invites
          : section === 'access-grants'
            ? grants
            : section === 'settings'
              ? settings
              : events;
  const detail = person.data;
  const ownAccount = detail?.id === me.data?.id;
  return (
    <>
      <div className="workspace-title">
        <h1>
          <strong>{m.Admin.title}</strong>
        </h1>
        <a className="inline-link" href={`/${locale}/account`}>
          {m.Common.account}
        </a>
      </div>
      <div className="workspace-grid admin-workspace">
        <WorkspaceNav
          locale={locale}
          selected={section === 'detail' ? 'users' : section}
          admin
          messages={m}
        />
        <div className="workspace-content">
          <div className="section-toolbar">
            <h2>{title}</h2>
            {section === 'users' ? (
              <button
                className="button"
                onClick={() => setCreating((value) => !value)}
              >
                {creating ? m.Common.cancel : m.Admin.create}
              </button>
            ) : null}
          </div>
          <Feedback code={error} success={success} messages={m} />
          {creating && section === 'users' ? (
            <section className="panel">
              <h3>{m.Admin.create}</h3>
              <p className="muted">{m.Admin.createDescription}</p>
              <form
                className="stack-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = new FormData(form);
                  if (
                    await perform(
                      () =>
                        api('/api/v1/admin/users', 'POST', {
                          name: String(data.get('name')),
                          email: String(data.get('email')),
                          locale,
                        }),
                      m.Admin.createdInvite,
                    )
                  ) {
                    form.reset();
                    setCreating(false);
                  }
                }}
              >
                <Field
                  label={m.Common.name}
                  name="name"
                  required
                  maxLength={100}
                />
                <Field
                  label={m.Common.email}
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                />
                <button className="button fit-content" disabled={busy}>
                  {busy ? m.Common.sending : m.Admin.create}
                </button>
              </form>
            </section>
          ) : null}
          {section === 'users' ? (
            <form
              className="admin-filters"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const query = new URLSearchParams({
                  q: String(data.get('q')),
                  role: String(data.get('role')),
                  status: String(data.get('status')),
                });
                setFilters('&' + query);
                setPage(1);
              }}
            >
              <Field
                label={m.Admin.search}
                name="q"
                type="search"
                maxLength={100}
              />
              <div className="form-field">
                <label htmlFor="filter-role">{m.Admin.role}</label>
                <select name="role" id="filter-role">
                  <option value="">{m.Admin.allRoles}</option>
                  <option value="user">{m.Admin.user}</option>
                  <option value="admin">{m.Admin.admin}</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="filter-status">{m.Admin.status}</label>
                <select name="status" id="filter-status">
                  <option value="">{m.Admin.allStatuses}</option>
                  <option value="active">{m.Admin.active}</option>
                  <option value="blocked">{m.Admin.blocked}</option>
                </select>
              </div>
              <button className="button" disabled={busy}>
                {m.Admin.apply}
              </button>
            </form>
          ) : null}
          <RemoteState
            loading={remote.loading}
            error={remote.error}
            onRetry={remote.reload}
            messages={m}
          />
          {users.data && section === 'users' ? (
            <>
              <div className="data-list">
                <div className="data-header user-grid" aria-hidden="true">
                  <span>{m.Common.name}</span>
                  <span>{m.Common.email}</span>
                  <span>{m.Admin.role}</span>
                  <span>{m.Admin.status}</span>
                  <span>{m.Common.actions}</span>
                </div>
                {users.data.items.length === 0 ? (
                  <p className="panel">
                    {filters ? m.Common.noResults : m.Common.empty}
                  </p>
                ) : (
                  users.data.items.map((item) => (
                    <article className="data-row user-grid" key={item.id}>
                      <div>
                        <span className="mobile-label">{m.Common.name}</span>
                        <strong>{item.name}</strong>
                      </div>
                      <div className="break-word">
                        <span className="mobile-label">{m.Common.email}</span>
                        {item.email}
                      </div>
                      <div>
                        <span className="mobile-label">{m.Admin.role}</span>
                        {item.role === 'admin' ? m.Admin.admin : m.Admin.user}
                      </div>
                      <div>
                        <span className="mobile-label">{m.Admin.status}</span>
                        <span
                          className={
                            'status-badge ' +
                            (item.blocked ? 'status-error' : '')
                          }
                        >
                          {item.blocked
                            ? m.Admin.blocked
                            : item.emailVerified
                              ? m.Admin.active
                              : m.Admin.unverified}
                        </span>
                      </div>
                      <a
                        className="inline-link"
                        href={`/${locale}/admin/users/${item.id}`}
                      >
                        {m.Admin.view}
                      </a>
                    </article>
                  ))
                )}
              </div>
              <Pagination
                page={page}
                total={users.data.total}
                setPage={setPage}
                messages={m}
              />
            </>
          ) : null}
          {detail && section === 'detail' ? (
            <>
              <a className="inline-link" href={`/${locale}/admin/users`}>
                {m.Common.back}
              </a>
              <section className="panel">
                <p className="break-word">{detail.email}</p>
                <p className="muted">
                  {m.Common.created}: {dateText(detail.createdAt, locale)}
                </p>
                <p>
                  {m.Account.providers}:{' '}
                  {detail.providers
                    .map((p) =>
                      p === 'credential'
                        ? m.Account.credential
                        : m.Account.google,
                    )
                    .join(' · ')}
                </p>
                <form
                  key={detail.name + detail.role}
                  className="stack-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    const body = {
                      name: String(data.get('name')),
                      role: ownAccount ? detail.role : String(data.get('role')),
                    };
                    const run = () =>
                      api(`/api/v1/admin/users/${userId}`, 'PATCH', body);
                    if (body.role !== detail.role)
                      setConfirmation({ title: m.Admin.role, run });
                    else void perform(run);
                  }}
                >
                  <Field
                    label={m.Common.name}
                    name="name"
                    defaultValue={detail.name}
                    required
                    maxLength={100}
                  />
                  <div className="form-field">
                    <label htmlFor="user-role">{m.Admin.role}</label>
                    <select
                      name="role"
                      id="user-role"
                      defaultValue={detail.role}
                      disabled={ownAccount}
                    >
                      <option value="user">{m.Admin.user}</option>
                      <option value="admin">{m.Admin.admin}</option>
                    </select>
                  </div>
                  <button className="button fit-content" disabled={busy}>
                    {m.Common.save}
                  </button>
                </form>
                <div className="danger-actions">
                  <button
                    className="button button-secondary"
                    disabled={busy || ownAccount}
                    onClick={() =>
                      setConfirmation({
                        title: detail.blocked ? m.Admin.unblock : m.Admin.block,
                        run: () =>
                          api(`/api/v1/admin/users/${userId}`, 'PATCH', {
                            blocked: !detail.blocked,
                          }),
                      })
                    }
                  >
                    {detail.blocked ? m.Admin.unblock : m.Admin.block}
                  </button>
                  <button
                    className="button button-danger"
                    disabled={busy || ownAccount}
                    onClick={() =>
                      setConfirmation({
                        title: m.Admin.delete,
                        email: detail.email,
                        run: (email) =>
                          api(`/api/v1/admin/users/${userId}`, 'DELETE', {
                            email,
                          }),
                        after: () => router.replace(`/${locale}/admin/users`),
                      })
                    }
                  >
                    {m.Admin.delete}
                  </button>
                </div>
              </section>
              <section className="panel">
                <div className="section-toolbar">
                  <h3>{m.Account.sessions}</h3>
                  <button
                    className="inline-link"
                    disabled={busy || !sessions.data?.length}
                    onClick={() =>
                      setConfirmation({
                        title: m.Admin.revokeAll,
                        run: () =>
                          api(
                            `/api/v1/admin/users/${userId}/sessions`,
                            'DELETE',
                          ),
                      })
                    }
                  >
                    {m.Admin.revokeAll}
                  </button>
                </div>
                <RemoteState
                  loading={sessions.loading}
                  error={sessions.error}
                  onRetry={sessions.reload}
                  messages={m}
                />
                {sessions.data?.length === 0 ? <p>{m.Common.empty}</p> : null}
                {sessions.data?.map((item) => (
                  <article className="session-row" key={item.id}>
                    <div>
                      <p className="break-word">
                        {item.userAgent || m.Account.unknownDevice}
                      </p>
                      <small>
                        {dateText(item.createdAt, locale)} —{' '}
                        {dateText(item.expiresAt, locale)}
                      </small>
                    </div>
                    <button
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() =>
                        setConfirmation({
                          title: m.Account.revoke,
                          run: () =>
                            api(
                              `/api/v1/admin/users/${userId}/sessions/${item.id}`,
                              'DELETE',
                            ),
                        })
                      }
                    >
                      {m.Account.revoke}
                    </button>
                  </article>
                ))}
              </section>
            </>
          ) : null}
          {invites.data && section === 'invitations' ? (
            <>
              <div className="data-list">
                {invites.data.length === 0 ? (
                  <p className="panel">{m.Common.empty}</p>
                ) : (
                  invites.data.slice((page - 1) * 20, page * 20).map((item) => (
                    <article key={item.id} className="data-row invitation-grid">
                      <div>
                        <strong>{item.name}</strong>
                        <p className="break-word">{item.email}</p>
                      </div>
                      <div>
                        <span className="mobile-label">{m.Admin.expires}</span>
                        {dateText(item.expiresAt, locale)}
                      </div>
                      <div className="row-actions">
                        <button
                          className="inline-link"
                          disabled={busy}
                          onClick={() =>
                            void perform(
                              () =>
                                api(
                                  `/api/v1/admin/invitations/${item.id}/resend`,
                                  'POST',
                                  {
                                    name: item.name,
                                    email: item.email,
                                    locale,
                                  },
                                ),
                              m.Auth.mailSent,
                            )
                          }
                        >
                          {m.Admin.resend}
                        </button>
                        <button
                          className="inline-link danger-text"
                          disabled={busy}
                          onClick={() =>
                            setConfirmation({
                              title: m.Admin.cancelInvite,
                              run: () =>
                                api(
                                  `/api/v1/admin/invitations/${item.id}`,
                                  'DELETE',
                                ),
                            })
                          }
                        >
                          {m.Admin.cancelInvite}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <Pagination
                page={page}
                total={invites.data.length}
                setPage={setPage}
                messages={m}
              />
            </>
          ) : null}
          {section === 'access-grants' ? (
            <section className="panel">
              <p className="muted">{m.Admin.grantDescription}</p>
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const email = String(new FormData(form).get('email'));
                  if (
                    await perform(() =>
                      api('/api/v1/admin/access-grants', 'POST', { email }),
                    )
                  )
                    form.reset();
                }}
              >
                <Field
                  label={m.Common.email}
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                />
                <button className="button" disabled={busy}>
                  {m.Admin.grant}
                </button>
              </form>
            </section>
          ) : null}
          {grants.data && section === 'access-grants' ? (
            <>
              <div className="data-list">
                {grants.data.length === 0 ? (
                  <p className="panel">{m.Common.empty}</p>
                ) : (
                  grants.data.slice((page - 1) * 20, page * 20).map((item) => (
                    <article key={item.email} className="data-row grant-grid">
                      <strong className="break-word">{item.email}</strong>
                      <span>{dateText(item.createdAt, locale)}</span>
                      <button
                        className="inline-link danger-text"
                        disabled={busy}
                        onClick={() =>
                          setConfirmation({
                            title: m.Admin.revokeGrant,
                            run: () =>
                              api(
                                '/api/v1/admin/access-grants/' +
                                  encodeURIComponent(item.email),
                                'DELETE',
                              ),
                          })
                        }
                      >
                        {m.Admin.revokeGrant}
                      </button>
                    </article>
                  ))
                )}
              </div>
              <Pagination
                page={page}
                total={grants.data.length}
                setPage={setPage}
                messages={m}
              />
            </>
          ) : null}
          {settings.data && section === 'settings' ? (
            <section className="panel">
              <p className="muted">{m.Admin.modeDescription}</p>
              <form
                key={settings.data.registrationMode}
                className="stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const registrationMode = String(
                    new FormData(e.currentTarget).get('registrationMode'),
                  );
                  setConfirmation({
                    title: m.Admin.registrationMode,
                    run: () =>
                      api('/api/v1/admin/settings', 'PATCH', {
                        registrationMode,
                      }),
                  });
                }}
              >
                <div className="form-field">
                  <label htmlFor="registration-mode">
                    {m.Admin.registrationMode}
                  </label>
                  <select
                    name="registrationMode"
                    id="registration-mode"
                    defaultValue={settings.data.registrationMode}
                  >
                    <option value="invite-only">
                      {m.Admin['invite-only']}
                    </option>
                    <option value="open">{m.Admin.open}</option>
                  </select>
                </div>
                <button className="button fit-content" disabled={busy}>
                  {m.Common.save}
                </button>
              </form>
            </section>
          ) : null}
          {events.data && section === 'audit' ? (
            <>
              <div className="data-list">
                <div className="data-header audit-grid" aria-hidden="true">
                  <span>{m.Common.created}</span>
                  <span>{m.Admin.actor}</span>
                  <span>{m.Admin.action}</span>
                  <span>{m.Admin.target}</span>
                </div>
                {events.data.items.length === 0 ? (
                  <p className="panel">{m.Common.empty}</p>
                ) : (
                  events.data.items.map((item) => (
                    <article key={item.id} className="data-row audit-grid">
                      <div>
                        <span className="mobile-label">{m.Common.created}</span>
                        {dateText(item.createdAt, locale)}
                      </div>
                      <div>
                        <span className="mobile-label">{m.Admin.actor}</span>
                        {item.actorName || m.Admin.deleted}
                      </div>
                      <div>
                        <span className="mobile-label">{m.Admin.action}</span>
                        {m.AuditActions[
                          item.action as keyof typeof m.AuditActions
                        ] || item.action}
                      </div>
                      <div className="break-word">
                        <span className="mobile-label">{m.Admin.target}</span>
                        {item.targetEmail ||
                          (item.targetId ? (
                            <a
                              className="inline-link"
                              href={`/${locale}/admin/users/${item.targetId}`}
                            >
                              {m.Admin.view}
                            </a>
                          ) : item.action.startsWith('registration.') ? (
                            '—'
                          ) : (
                            m.Admin.deleted
                          ))}
                      </div>
                    </article>
                  ))
                )}
              </div>
              <Pagination
                page={page}
                total={events.data.total}
                setPage={setPage}
                messages={m}
              />
            </>
          ) : null}
        </div>
      </div>
      {confirmation ? (
        <ConfirmDialog
          title={confirmation.title}
          email={confirmation.email}
          messages={m}
          onCancel={() => setConfirmation(null)}
          onConfirm={async (value) => {
            const current = confirmation;
            if (await perform(() => current.run(value))) current.after?.();
            setConfirmation(null);
          }}
        />
      ) : null}
    </>
  );
}
