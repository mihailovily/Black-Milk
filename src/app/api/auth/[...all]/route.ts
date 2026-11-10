import { getAuth } from '@/server/auth';
import { getDb } from '@/server/db';
import { user } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { endpoint } from '@/server/http';
import { checkOrigin, limitRequest } from '@/server/security';
import { AppError } from '@/server/errors';
import { normalizeEmail } from '@/server/config';

export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  let response: Response | undefined;
  const failure = await endpoint(async () => {
    if (request.method !== 'GET') {
      checkOrigin(request);
      await limitRequest(request, 'auth-writes', 120);
      const route = new URL(request.url).pathname
        .split('/')
        .slice(-2)
        .join('/');
      const perAddress =
        route === 'sign-in/email'
          ? 10
          : route === 'sign-up/email' ||
              route.endsWith('/request-password-reset') ||
              route.endsWith('/send-verification-email')
            ? 5
            : 0;
      if (perAddress) {
        const body = await request
          .clone()
          .json()
          .catch(() => null);
        if (typeof body?.email === 'string' && body.email.length <= 254)
          await limitRequest(
            request,
            route + ':' + normalizeEmail(body.email),
            perAddress,
          );
      }
    }
    const auth = getAuth();
    const current = await auth.api.getSession({ headers: request.headers });
    if (current && !new URL(request.url).pathname.endsWith('/sign-out')) {
      const [person] = await getDb()
        .select({ blocked: user.blocked })
        .from(user)
        .where(eq(user.id, current.user.id));
      if (!person || person.blocked) throw new AppError('ACCOUNT_BLOCKED', 403);
    }
    response = await auth.handler(request);
    return null;
  });
  if (!response) return failure;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}
export const GET = handle;
export const POST = handle;
