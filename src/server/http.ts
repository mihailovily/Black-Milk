import { z } from 'zod';
import { AppError } from './errors';
import { ConfigurationError } from './config';

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
export async function endpoint(action: () => Promise<unknown>) {
  try {
    return json(await action());
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: { code: 'INVALID_INPUT' } }, 400);
    if (error instanceof AppError)
      return json({ error: { code: error.code } }, error.status);
    if (error instanceof ConfigurationError)
      return json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503);
    // Do not include database addresses, SQL or secrets in responses or logs.
    console.error(
      'Request failed',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return json({ error: { code: 'SERVICE_UNAVAILABLE' } }, 503);
  }
}
