'use client';
import { useEffect, useState } from 'react';
export function SessionNavigation({
  locale,
  signIn,
  account,
}: {
  locale: string;
  signIn: string;
  account: string;
}) {
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/auth-config', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setAuthenticated(Boolean(data?.viewer)))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <a
      className="header-link session-navigation"
      href={`/${locale}/${authenticated ? 'account' : 'sign-in'}`}
    >
      {authenticated ? account : signIn}
    </a>
  );
}
