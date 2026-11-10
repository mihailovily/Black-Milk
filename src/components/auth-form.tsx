'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createAuthClient } from 'better-auth/react';
import type { UiMessages } from './ui-messages';
import { api, errorCode, authenticationError } from './api-client';
import { Field } from './field';

export type AuthPage =
  | 'sign-in'
  | 'sign-up'
  | 'forgot-password'
  | 'reset-password'
  | 'verify-email'
  | 'activate';
type Config = {
  configured: boolean;
  google: boolean;
  registrationMode: 'invite-only' | 'open' | null;
};
const authClient = createAuthClient();
export function AuthForm({
  locale,
  mode,
  token,
  initialError,
  verified,
  messages: m,
}: {
  locale: string;
  mode: AuthPage;
  token?: string;
  initialError?: string;
  verified?: boolean;
  messages: UiMessages;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState(initialError?.toUpperCase() || '');
  const [success, setSuccess] = useState(verified ? m.Auth.emailVerified : '');
  const [busy, setBusy] = useState(false);
  const [activation, setActivation] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Config>('/api/v1/auth-config')
      .then(setConfig)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorCode(e));
      });
    if (mode === 'activate' && token)
      api<{ name: string; email: string }>(
        '/api/v1/activate?token=' + encodeURIComponent(token),
      )
        .then((data) => {
          if (!controller.signal.aborted) setActivation(data);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorCode(e));
        });
    return () => controller.abort();
  }, [mode, token, retry]);
  const href = (page: string) => `/${locale}/${page}`;
  const message =
    m.Errors[error as keyof typeof m.Errors] || m.Errors.SERVICE_UNAVAILABLE;
  const passwordNeeded = [
    'sign-in',
    'sign-up',
    'reset-password',
    'activate',
  ].includes(mode);
  const emailNeeded = [
    'sign-in',
    'sign-up',
    'forgot-password',
    'verify-email',
  ].includes(mode);
  const invalidToken = ['activate', 'reset-password'].includes(mode) && !token;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email') || '');
    const password = String(values.get('password') || '');
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (mode === 'activate') {
        await api('/api/v1/activate', 'POST', { token, password });
        setSuccess(m.Auth.passwordSaved);
      }
      if (mode === 'sign-in') {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) throw new Error(authenticationError(result.error));
        router.replace(href('account'));
      }
      if (mode === 'sign-up') {
        const result = await authClient.signUp.email({
          email,
          password,
          name: String(values.get('name') || ''),
          callbackURL: href('verify-email?verified=1'),
        });
        if (result.error) throw new Error(authenticationError(result.error));
        setSuccess(m.Auth.verifySent);
      }
      if (mode === 'forgot-password') {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: href('reset-password'),
        });
        if (result.error) throw new Error(authenticationError(result.error));
        setSuccess(m.Auth.mailSent);
      }
      if (mode === 'verify-email') {
        const result = await authClient.sendVerificationEmail({
          email,
          callbackURL: href('verify-email?verified=1'),
        });
        if (result.error) throw new Error(authenticationError(result.error));
        setSuccess(m.Auth.mailSent);
      }
      if (mode === 'reset-password') {
        const result = await authClient.resetPassword({
          token,
          newPassword: password,
        });
        if (result.error) throw new Error(authenticationError(result.error));
        setSuccess(m.Auth.passwordSaved);
      }
    } catch (e) {
      setError(
        e instanceof Error && !(e.name === 'ClientError')
          ? e.message.toUpperCase()
          : errorCode(e),
      );
    } finally {
      setBusy(false);
    }
  }
  const complete = Boolean(
    success && ['activate', 'reset-password', 'sign-up'].includes(mode),
  );
  return (
    <div className="auth-panel panel">
      <p className="muted">{m.Auth.description}</p>
      {config?.registrationMode && ['sign-in', 'sign-up'].includes(mode) ? (
        <p className="notice">
          {config.registrationMode === 'invite-only'
            ? m.Auth.inviteOnly
            : m.Auth.open}
        </p>
      ) : null}
      {config && !config.configured ? (
        <p className="notice notice-error" role="status">
          {m.Auth.configuredMissing}
        </p>
      ) : null}
      {error ? (
        <div className="notice notice-error" role="alert">
          <p>{message}</p>
          {error === 'SERVICE_UNAVAILABLE' ? (
            <button
              className="inline-link"
              type="button"
              onClick={() => {
                setError('');
                setRetry((v) => v + 1);
              }}
            >
              {m.Common.retry}
            </button>
          ) : null}
        </div>
      ) : null}
      {success ? (
        <p className="notice notice-success" role="status">
          {success}
        </p>
      ) : null}
      {invalidToken ? (
        <p className="notice notice-error" role="alert">
          {m.Auth.tokenMissing}
        </p>
      ) : null}
      {activation ? (
        <p>
          {m.Auth.activationFor}: <strong>{activation.name}</strong>
          <br />
          <span>{activation.email}</span>
        </p>
      ) : null}
      {['sign-in', 'sign-up'].includes(mode) ? (
        <>
          <button
            className="button button-secondary full-width"
            disabled={busy || !config?.google}
            type="button"
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const result = await authClient.signIn.social({
                  provider: 'google',
                  callbackURL: href('account'),
                  errorCallbackURL: href('sign-in'),
                });
                if (result.error)
                  throw new Error(authenticationError(result.error));
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'SERVICE_UNAVAILABLE',
                );
                setBusy(false);
              }
            }}
          >
            {m.Auth.google}
          </button>
          {config?.configured && !config.google ? (
            <p className="form-hint">{m.Auth.googleMissing}</p>
          ) : null}
          <p className="form-divider">{m.Auth.or}</p>
        </>
      ) : null}
      {!complete ? (
        <form className="stack-form" onSubmit={submit} aria-busy={busy}>
          {mode === 'sign-up' ? (
            <Field
              label={m.Common.name}
              name="name"
              required
              maxLength={100}
              autoComplete="name"
            />
          ) : null}
          {emailNeeded ? (
            <Field
              label={m.Common.email}
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
            />
          ) : null}
          {passwordNeeded ? (
            <Field
              label={m.Common.password}
              name="password"
              type="password"
              required
              minLength={mode === 'sign-in' ? undefined : 12}
              maxLength={128}
              autoComplete={
                mode === 'sign-in' ? 'current-password' : 'new-password'
              }
              hint={mode !== 'sign-in' ? m.Common.passwordHint : undefined}
            />
          ) : null}
          <button
            className="button full-width"
            disabled={
              busy ||
              !config?.configured ||
              invalidToken ||
              (mode === 'activate' && !activation)
            }
          >
            {busy
              ? m.Common.sending
              : mode === 'sign-in'
                ? m.Common.signIn
                : mode === 'sign-up'
                  ? m.Auth.signUpTitle
                  : mode === 'verify-email'
                    ? m.Auth.resendVerification
                    : mode === 'forgot-password'
                      ? m.Auth.sendReset
                      : m.Auth.setPassword}
          </button>
        </form>
      ) : null}
      <div className="auth-links">
        {mode === 'sign-in' ? (
          <>
            <a href={href('forgot-password')}>{m.Auth.forgot}</a>
            <a href={href('sign-up')}>{m.Auth.noAccount}</a>
            <a href={href('verify-email')}>{m.Auth.resendVerification}</a>
          </>
        ) : (
          <a href={href('sign-in')}>{m.Auth.haveAccount}</a>
        )}
      </div>
    </div>
  );
}
