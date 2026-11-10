export class ClientError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
    signal,
  });
  const data = await response.json();
  if (!response.ok)
    throw new ClientError(
      data.error?.code || data.code || data.message || 'SERVICE_UNAVAILABLE',
      response.status,
    );
  return data;
}
export function errorCode(error: unknown) {
  return error instanceof ClientError ? error.code : 'SERVICE_UNAVAILABLE';
}
export function authenticationError(error: {
  status?: number;
  code?: string;
  message?: string;
}) {
  if (error.status === 429) return 'RATE_LIMITED';
  const code =
    error.message && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : error.code || 'SERVICE_UNAVAILABLE';
  if (code.startsWith('USER_ALREADY_EXISTS')) return 'USER_ALREADY_EXISTS';
  return code;
}
