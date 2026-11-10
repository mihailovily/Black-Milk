import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { and, count, desc, eq, gt, ilike, ne, or, sql } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { getDb } from './db';
import {
  user,
  session,
  account,
  accessGrant,
  settings,
  invitation,
  audit,
  verification,
} from './db/schema';
import { AppError } from './errors';
import { getConfig, normalizeEmail } from './config';
import { assertMailAvailable, sendMail } from './mail';

export const emailInput = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform(normalizeEmail);
export const nameInput = z.string().trim().min(1).max(100);
export const passwordInput = z.string().min(12).max(128);
const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const profileFields = {
  id: user.id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
  image: user.image,
  role: user.role,
  blocked: user.blocked,
  createdAt: user.createdAt,
};
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function record(
  tx: Tx,
  actorId: string,
  action: string,
  targetId?: string,
  targetEmail?: string,
) {
  await tx
    .insert(audit)
    .values({ id: randomUUID(), actorId, action, targetId, targetEmail });
}
async function adminTransaction<T>(
  actorId: string,
  action: (tx: Tx) => Promise<T>,
) {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM app_settings WHERE id = 'global' FOR UPDATE`,
    );
    const [actor] = await tx.select().from(user).where(eq(user.id, actorId));
    if (
      !actor ||
      actor.blocked ||
      actor.role !== 'admin' ||
      !actor.emailVerified
    )
      throw new AppError('FORBIDDEN', 403);
    return action(tx);
  });
}
export async function getProfile(id: string) {
  const [person] = await getDb()
    .select(profileFields)
    .from(user)
    .where(eq(user.id, id));
  if (!person) throw new AppError('NOT_FOUND', 404);
  const providers = await getDb()
    .select({ provider: account.providerId })
    .from(account)
    .where(eq(account.userId, id));
  return { ...person, providers: providers.map((p) => p.provider) };
}
export async function updateProfile(id: string, input: unknown) {
  const { name } = z.object({ name: nameInput }).strict().parse(input);
  await getDb()
    .update(user)
    .set({ name, updatedAt: new Date() })
    .where(eq(user.id, id));
  return getProfile(id);
}
export async function listSessions(id: string, currentId?: string) {
  const rows = await getDb()
    .select({
      id: session.id,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    })
    .from(session)
    .where(and(eq(session.userId, id), gt(session.expiresAt, new Date())))
    .orderBy(desc(session.createdAt));
  return rows.map((row) => ({ ...row, current: row.id === currentId }));
}
export async function revokeSessions(
  userId: string,
  currentId: string,
  targetId?: string,
) {
  const condition = targetId
    ? eq(session.id, targetId)
    : ne(session.id, currentId);
  await getDb()
    .delete(session)
    .where(and(eq(session.userId, userId), condition));
  return { success: true };
}
export async function listUsers(url: URL) {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(url.searchParams.get('page') || 1);
  const query = z
    .string()
    .max(100)
    .parse(url.searchParams.get('q') || '');
  const role = z
    .enum(['', 'user', 'admin'])
    .parse(url.searchParams.get('role') || '');
  const status = z
    .enum(['', 'active', 'blocked'])
    .parse(url.searchParams.get('status') || '');
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
  const condition = and(
    query
      ? or(ilike(user.name, pattern), ilike(user.email, pattern))
      : undefined,
    role ? eq(user.role, role) : undefined,
    status ? eq(user.blocked, status === 'blocked') : undefined,
  );
  const [total] = await getDb()
    .select({ count: count() })
    .from(user)
    .where(condition);
  const items = await getDb()
    .select(profileFields)
    .from(user)
    .where(condition)
    .orderBy(desc(user.createdAt), user.id)
    .limit(20)
    .offset((page - 1) * 20);
  return { items, page, total: total.count, pageSize: 20 };
}
export async function updateUser(
  actorId: string,
  targetId: string,
  input: unknown,
) {
  const changes = z
    .object({
      name: nameInput.optional(),
      role: z.enum(['user', 'admin']).optional(),
      blocked: z.boolean().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0)
    .parse(input);
  return adminTransaction(actorId, async (tx) => {
    const [target] = await tx.select().from(user).where(eq(user.id, targetId));
    if (!target) throw new AppError('NOT_FOUND', 404);
    const removesAdmin =
      target.role === 'admin' &&
      !target.blocked &&
      (changes.role === 'user' || changes.blocked === true);
    if (
      actorId === targetId &&
      (changes.role === 'user' || changes.blocked === true)
    )
      throw new AppError('SELF_ACTION', 409);
    if (removesAdmin) {
      const [admins] = await tx
        .select({ count: count() })
        .from(user)
        .where(
          and(
            eq(user.role, 'admin'),
            eq(user.blocked, false),
            eq(user.emailVerified, true),
          ),
        );
      if (admins.count <= 1) throw new AppError('LAST_ADMIN', 409);
    }
    if (changes.role === 'admin' && !target.emailVerified)
      throw new AppError('CONFLICT', 409);
    await tx
      .update(user)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(user.id, targetId));
    if (
      changes.blocked === true ||
      (changes.role && changes.role !== target.role)
    )
      await tx.delete(session).where(eq(session.userId, targetId));
    await record(
      tx,
      actorId,
      changes.blocked === true
        ? 'user.blocked'
        : changes.blocked === false
          ? 'user.unblocked'
          : changes.role
            ? 'user.role_changed'
            : 'user.updated',
      targetId,
    );
    return { success: true };
  });
}
export async function deleteUser(
  actorId: string,
  targetId: string,
  input: unknown,
) {
  const { email } = z.object({ email: emailInput }).strict().parse(input);
  return adminTransaction(actorId, async (tx) => {
    if (actorId === targetId) throw new AppError('SELF_ACTION', 409);
    const [target] = await tx.select().from(user).where(eq(user.id, targetId));
    if (!target) throw new AppError('NOT_FOUND', 404);
    if (target.email !== email) throw new AppError('INVALID_INPUT');
    if (target.role === 'admin' && !target.blocked) {
      const [admins] = await tx
        .select({ count: count() })
        .from(user)
        .where(
          and(
            eq(user.role, 'admin'),
            eq(user.blocked, false),
            eq(user.emailVerified, true),
          ),
        );
      if (admins.count <= 1) throw new AppError('LAST_ADMIN', 409);
    }
    await tx.delete(accessGrant).where(eq(accessGrant.email, target.email));
    await tx.delete(invitation).where(eq(invitation.email, target.email));
    await tx
      .delete(verification)
      .where(
        or(
          eq(verification.identifier, target.email),
          eq(verification.value, targetId),
          sql`${verification.value} LIKE ${'%' + targetId + '%'}`,
        ),
      );
    await tx
      .update(audit)
      .set({ targetEmail: null })
      .where(eq(audit.targetEmail, target.email));
    await record(tx, actorId, 'user.deleted', targetId);
    await tx.delete(user).where(eq(user.id, targetId));
    return { success: true };
  });
}
export async function adminRevokeSessions(
  actorId: string,
  targetId: string,
  sessionId?: string,
) {
  return adminTransaction(actorId, async (tx) => {
    const [target] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, targetId));
    if (!target) throw new AppError('NOT_FOUND', 404);
    await tx
      .delete(session)
      .where(
        and(
          eq(session.userId, targetId),
          sessionId ? eq(session.id, sessionId) : undefined,
        ),
      );
    await record(tx, actorId, 'user.sessions_revoked', targetId);
    return { success: true };
  });
}
export async function getSettings() {
  const [value] = await getDb()
    .select()
    .from(settings)
    .where(eq(settings.id, 'global'));
  if (!value) throw new AppError('SERVICE_UNAVAILABLE', 503);
  return value;
}
export async function updateSettings(actorId: string, input: unknown) {
  const data = z
    .object({ registrationMode: z.enum(['invite-only', 'open']) })
    .strict()
    .parse(input);
  return adminTransaction(actorId, async (tx) => {
    await tx.update(settings).set(data).where(eq(settings.id, 'global'));
    await record(tx, actorId, 'registration.' + data.registrationMode);
    return data;
  });
}
export async function listGrants() {
  return getDb()
    .select({ email: accessGrant.email, createdAt: accessGrant.createdAt })
    .from(accessGrant)
    .orderBy(desc(accessGrant.createdAt));
}
export async function changeGrant(
  actorId: string,
  email: string,
  remove = false,
) {
  email = emailInput.parse(email);
  return adminTransaction(actorId, async (tx) => {
    if (remove) {
      await tx.delete(accessGrant).where(eq(accessGrant.email, email));
      await tx.delete(invitation).where(eq(invitation.email, email));
    } else await tx.insert(accessGrant).values({ email }).onConflictDoNothing();
    await record(
      tx,
      actorId,
      remove ? 'access.revoked' : 'access.granted',
      undefined,
      email,
    );
    return { success: true };
  });
}
export async function listInvitations() {
  return getDb()
    .select({
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })
    .from(invitation)
    .orderBy(desc(invitation.createdAt));
}
export async function inviteUser(
  actorId: string,
  input: unknown,
  resendId?: string,
) {
  assertMailAvailable();
  const data = z
    .object({
      email: emailInput,
      name: nameInput,
      locale: z.enum(['ru', 'en']).default('ru'),
    })
    .strict()
    .parse(input);
  const token = randomBytes(32).toString('base64url');
  await adminTransaction(actorId, async (tx) => {
    if (resendId) {
      const [previous] = await tx
        .select()
        .from(invitation)
        .where(eq(invitation.id, resendId));
      if (!previous || previous.email !== data.email)
        throw new AppError('NOT_FOUND', 404);
    }
    const [existing] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, data.email));
    if (existing) throw new AppError('CONFLICT', 409);
    await tx
      .insert(accessGrant)
      .values({ email: data.email })
      .onConflictDoNothing();
    await tx
      .insert(invitation)
      .values({
        id: randomUUID(),
        email: data.email,
        name: data.name,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 86400000),
      })
      .onConflictDoUpdate({
        target: invitation.email,
        set: {
          name: data.name,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    await record(
      tx,
      actorId,
      resendId ? 'invitation.resent' : 'invitation.created',
      undefined,
      data.email,
    );
  });
  // Persist first: failed delivery can be retried without creating an active account.
  await sendMail({
    to: data.email,
    subject: 'Black&Milk — активация / activation',
    text: `Создайте пароль / Create your password:\n${getConfig().baseUrl}/${data.locale}/activate?token=${token}`,
  });
  return { success: true };
}
export async function cancelInvitation(actorId: string, id: string) {
  return adminTransaction(actorId, async (tx) => {
    const [target] = await tx
      .select()
      .from(invitation)
      .where(eq(invitation.id, id));
    if (!target) throw new AppError('NOT_FOUND', 404);
    await tx.delete(invitation).where(eq(invitation.id, id));
    await tx.delete(accessGrant).where(eq(accessGrant.email, target.email));
    await record(tx, actorId, 'invitation.cancelled', undefined, target.email);
    return { success: true };
  });
}
export async function inspectActivation(token: string) {
  z.string().min(40).max(100).parse(token);
  const [pending] = await getDb()
    .select({ name: invitation.name, email: invitation.email })
    .from(invitation)
    .where(
      and(
        eq(invitation.tokenHash, hash(token)),
        gt(invitation.expiresAt, new Date()),
      ),
    );
  if (!pending) throw new AppError('INVALID_TOKEN');
  return pending;
}
export async function activate(input: unknown) {
  const { token, password } = z
    .object({ token: z.string().min(40).max(100), password: passwordInput })
    .strict()
    .parse(input);
  const passwordHash = await hashPassword(password);
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM app_settings WHERE id = 'global' FOR UPDATE`,
    );
    const [pending] = await tx
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.tokenHash, hash(token)),
          gt(invitation.expiresAt, new Date()),
        ),
      )
      .for('update');
    if (!pending) throw new AppError('INVALID_TOKEN');
    const [grant] = await tx
      .select()
      .from(accessGrant)
      .where(eq(accessGrant.email, pending.email));
    if (!grant) throw new AppError('INVITE_REQUIRED', 403);
    const [existing] = await tx
      .select()
      .from(user)
      .where(eq(user.email, pending.email));
    if (existing) throw new AppError('CONFLICT', 409);
    const id = randomUUID();
    await tx.insert(user).values({
      id,
      name: pending.name,
      email: pending.email,
      emailVerified: true,
      role: grant.bootstrapAdmin ? 'admin' : 'user',
    });
    await tx.insert(account).values({
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: 'credential',
      password: passwordHash,
    });
    await tx
      .update(accessGrant)
      .set({ bootstrapAdmin: false })
      .where(eq(accessGrant.email, pending.email));
    await tx.delete(invitation).where(eq(invitation.id, pending.id));
    return { success: true };
  });
}
export async function listAudit(url: URL) {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(url.searchParams.get('page') || 1);
  const [total] = await getDb().select({ count: count() }).from(audit);
  const items = await getDb()
    .select({
      id: audit.id,
      action: audit.action,
      actorName: user.name,
      targetId: audit.targetId,
      targetEmail: audit.targetEmail,
      createdAt: audit.createdAt,
    })
    .from(audit)
    .leftJoin(user, eq(audit.actorId, user.id))
    .orderBy(desc(audit.createdAt), audit.id)
    .limit(20)
    .offset((page - 1) * 20);
  return { items, page, total: total.count, pageSize: 20 };
}
