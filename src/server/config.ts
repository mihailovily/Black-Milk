export class ConfigurationError extends Error {
  constructor() {
    super('SERVICE_UNAVAILABLE');
  }
}

export function getConfig() {
  const { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL } = process.env;
  if (
    !DATABASE_URL ||
    !BETTER_AUTH_SECRET ||
    BETTER_AUTH_SECRET.length < 32 ||
    BETTER_AUTH_SECRET.startsWith('replace-') ||
    !BETTER_AUTH_URL
  )
    throw new ConfigurationError();
  const url = new URL(BETTER_AUTH_URL);
  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(url.hostname)
  )
    throw new ConfigurationError();
  return {
    databaseUrl: DATABASE_URL,
    secret: BETTER_AUTH_SECRET,
    baseUrl: url.origin,
  };
}

export function googleEnabled() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
