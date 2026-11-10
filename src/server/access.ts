import { eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import { accessGrant, settings, user } from './db/schema';
import { normalizeEmail } from './config';
import { AppError } from './errors';

export async function registrationAllowed(email: string) {
  const db = getDb();
  const [mode] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, 'global'));
  const [grant] = await db
    .select()
    .from(accessGrant)
    .where(eq(accessGrant.email, normalizeEmail(email)));
  return mode?.registrationMode === 'open' || Boolean(grant);
}

export async function grantBootstrapRole(userId: string) {
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM app_settings WHERE id = 'global' FOR UPDATE`,
    );
    const [person] = await tx.select().from(user).where(eq(user.id, userId));
    if (!person?.emailVerified || person.blocked) return;
    const [grant] = await tx
      .select()
      .from(accessGrant)
      .where(eq(accessGrant.email, person.email));
    if (grant?.bootstrapAdmin) {
      await tx
        .update(user)
        .set({ role: 'admin', updatedAt: new Date() })
        .where(eq(user.id, userId));
      await tx
        .update(accessGrant)
        .set({ bootstrapAdmin: false })
        .where(eq(accessGrant.email, person.email));
    }
  });
}

export async function bootstrapAdmin(email: string) {
  await getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM app_settings WHERE id = 'global' FOR UPDATE`,
    );
    const admins = await tx
      .select({ id: user.id })
      .from(user)
      .where(sql`${user.role} = 'admin' AND ${user.blocked} = false`);
    if (admins.length) throw new AppError('CONFLICT', 409);
    const pending = await tx
      .select()
      .from(accessGrant)
      .where(eq(accessGrant.bootstrapAdmin, true));
    if (pending.some((p) => p.email !== normalizeEmail(email)))
      throw new AppError('CONFLICT', 409);
    await tx
      .insert(accessGrant)
      .values({ email: normalizeEmail(email), bootstrapAdmin: true })
      .onConflictDoUpdate({
        target: accessGrant.email,
        set: { bootstrapAdmin: true },
      });
    await tx
      .update(user)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(
        sql`${user.email} = ${normalizeEmail(email)} AND ${user.emailVerified} = true AND ${user.blocked} = false`,
      );
  });
}
