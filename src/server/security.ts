import { createHash } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { getAuth } from './auth';
import { getDb } from './db';
import { requestLimit, session, user } from './db/schema';
import { getConfig } from './config';
import { AppError } from './errors';

export async function requireSession(headers: Headers, admin = false) {
  const current = await getAuth().api.getSession({ headers });
  if (!current) throw new AppError('UNAUTHORIZED', 401);
  const [person] = await getDb()
    .select()
    .from(user)
    .where(eq(user.id, current.user.id));
  const [active] = await getDb()
    .select({ id: session.id })
    .from(session)
    .where(
      and(
        eq(session.id, current.session.id),
        gt(session.expiresAt, new Date()),
      ),
    );
  if (!person || !active) throw new AppError('UNAUTHORIZED', 401);
  if (person.blocked) throw new AppError('ACCOUNT_BLOCKED', 403);
  if (!person.emailVerified || (admin && person.role !== 'admin'))
    throw new AppError('FORBIDDEN', 403);
  return { user: person, sessionId: current.session.id };
}
export function checkOrigin(request: Request) {
  if (request.headers.get('origin') !== getConfig().baseUrl)
    throw new AppError('FORBIDDEN', 403);
}
export async function limitRequest(
  request: Request,
  purpose: string,
  max = 10,
) {
  // Never trust caller-supplied forwarding headers on a self-hosted server.
  // Per-account limits and a shared anonymous bucket are consistent across replicas.
  const key = createHash('sha256').update(purpose).digest('hex');
  const result = await getDb()
    .execute(sql`INSERT INTO request_limits (key, count, reset_at) VALUES (${key}, 1, now() + interval '1 minute')
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN request_limits.reset_at <= now() THEN 1 ELSE request_limits.count + 1 END,
    reset_at = CASE WHEN request_limits.reset_at <= now() THEN now() + interval '1 minute' ELSE request_limits.reset_at END RETURNING count`);
  if (Number(result.rows[0]?.count) > max)
    throw new AppError('RATE_LIMITED', 429);
}
export async function clearExpiredLimits() {
  await getDb()
    .delete(requestLimit)
    .where(sql`${requestLimit.resetAt} < now() - interval '1 day'`);
}
