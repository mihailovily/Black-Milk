import { randomUUID, createHash } from 'node:crypto';
import { and, eq, sql, desc, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { brewMethods, coffeeUnit } from '../contracts/coffee';
import { getDb } from './db';
import {
  coffeeItems as items,
  coffeeSets as sets,
  coffeeBrews as brews,
  coffeeAdjustments as adjustments,
  coffeeOperations as operations,
  user,
} from './db/schema';
import { AppError } from './errors';

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
type Item = typeof items.$inferSelect;
const text = z.string().trim().max(5000);
const short = z.string().trim().max(200);
const quantity = z.number().int().positive().max(100_000_000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
  })
  .nullable();
const itemFields = {
  name: short.min(1),
  format: z.enum(['beans', 'ground', 'drip']),
  initialQuantity: quantity,
  roaster: short.default(''),
  country: short.default(''),
  region: short.default(''),
  processing: short.default(''),
  tastingNotes: text.default(''),
  note: text.default(''),
  roastDate: date.default(null),
  openedDate: date.default(null),
  bestBefore: date.default(null),
  dripWeight: quantity.nullable().default(null),
  repeat: z.boolean().default(false),
  setId: z.string().uuid().nullable().default(null),
};
const itemInput = z.object(itemFields).strict();
const itemPatch = itemInput
  .partial()
  .extend({
    version: z.number().int().positive(),
    archived: z.boolean().optional(),
  })
  .strict();
const setFields = {
  name: short.min(1),
  roaster: short.default(''),
  note: text.default(''),
};
const setInput = z
  .object({
    ...setFields,
    items: z
      .array(itemInput.omit({ setId: true }))
      .min(1)
      .max(100),
  })
  .strict();
const setPatch = z
  .object(setFields)
  .partial()
  .extend({
    version: z.number().int().positive(),
    archived: z.boolean().optional(),
  })
  .strict();
const brewInput = z
  .object({
    itemId: z.string().uuid(),
    quantity,
    unit: z.enum(['piece', 'tenth-gram']),
    method: z.enum(brewMethods),
    occurredAt: z.iso.datetime({ offset: true }),
    rating: z.number().int().min(1).max(10).nullable().default(null),
    note: text.default(''),
  })
  .strict();
const versionInput = z
  .object({ version: z.number().int().positive() })
  .strict();
function fail(
  code:
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'INVALID_INPUT'
    | 'INSUFFICIENT_STOCK'
    | 'HAS_HISTORY'
    | 'ARCHIVED',
  status = 409,
): never {
  throw new AppError(code, status);
}
function checkVersion(actual: number, expected: number) {
  if (actual !== expected) fail('CONFLICT');
}
async function ownedItem(tx: Tx, owner: string, id: string) {
  const [row] = await tx
    .select()
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, owner)))
    .for('update');
  if (!row) fail('NOT_FOUND', 404);
  return row;
}
async function ownedSet(tx: Tx, owner: string, id: string) {
  const [row] = await tx
    .select()
    .from(sets)
    .where(and(eq(sets.id, id), eq(sets.userId, owner)))
    .for('update');
  if (!row) fail('NOT_FOUND', 404);
  return row;
}
// The owner row serializes all coffee mutations, including membership changes and
// operation retries. It also coordinates with account deletion. Item locks follow
// the same stable order when a brew moves between stocks.
async function write<T>(owner: string, task: (tx: Tx) => Promise<T>) {
  return getDb().transaction(async (tx) => {
    const [person] = await tx
      .select()
      .from(user)
      .where(eq(user.id, owner))
      .for('update');
    if (!person) throw new AppError('UNAUTHORIZED', 401);
    if (person.blocked || !person.emailVerified)
      throw new AppError('FORBIDDEN', 403);
    return task(tx);
  });
}
async function replay<T>(
  tx: Tx,
  owner: string,
  input: { operationId: string },
  kind: string,
  task: () => Promise<T>,
): Promise<T> {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ kind, ...input }))
    .digest('hex');
  const [existing] = await tx
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.userId, owner),
        eq(operations.operationId, input.operationId),
      ),
    );
  if (existing) {
    if (existing.fingerprint !== fingerprint) fail('CONFLICT');
    return existing.result as T;
  }
  const result = await task();
  await tx.insert(operations).values({
    id: randomUUID(),
    userId: owner,
    operationId: input.operationId,
    fingerprint,
    result: JSON.parse(JSON.stringify(result)),
  });
  return result;
}
function presentItem(row: Item) {
  return { ...row, unit: coffeeUnit(row.format) };
}
async function touchSet(tx: Tx, id: string | null) {
  if (id)
    await tx
      .update(sets)
      .set({ version: sql`${sets.version}+1` })
      .where(eq(sets.id, id));
}
async function insertItem(
  tx: Tx,
  owner: string,
  input: z.infer<typeof itemInput>,
  position?: number,
) {
  if (input.format !== 'drip' && input.dripWeight !== null)
    fail('INVALID_INPUT', 400);
  if (input.setId) {
    const group = await ownedSet(tx, owner, input.setId);
    if (group.archived) fail('ARCHIVED');
  }
  const [last] = input.setId
    ? await tx
        .select({ position: items.position })
        .from(items)
        .where(eq(items.setId, input.setId))
        .orderBy(desc(items.position))
        .limit(1)
    : [];
  const [row] = await tx
    .insert(items)
    .values({
      ...input,
      id: randomUUID(),
      userId: owner,
      remaining: input.initialQuantity,
      position: position ?? (last ? last.position + 1 : 0),
    })
    .returning();
  await touchSet(tx, input.setId);
  return presentItem(row);
}
export async function createItem(owner: string, raw: unknown) {
  const input = itemInput.parse(raw);
  return write(owner, (tx) => insertItem(tx, owner, input));
}
export async function getItem(owner: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, owner)));
  if (!row) fail('NOT_FOUND', 404);
  const history = await getDb()
    .select()
    .from(adjustments)
    .where(and(eq(adjustments.itemId, id), eq(adjustments.userId, owner)))
    .orderBy(desc(adjustments.createdAt));
  const [brew] = await getDb()
    .select({ id: brews.id })
    .from(brews)
    .where(eq(brews.itemId, id))
    .limit(1);
  return {
    ...presentItem(row),
    adjustments: history,
    hasHistory: Boolean(brew || history.length),
  };
}
export async function updateItem(owner: string, id: string, raw: unknown) {
  const { version, ...parsed } = itemPatch.parse(raw);
  const patch = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => Object.hasOwn(raw as object, key)),
  ) as typeof parsed;
  return write(owner, async (tx) => {
    const row = await ownedItem(tx, owner, id);
    checkVersion(row.version, version);
    const next = { ...row, ...patch };
    if (next.format !== 'drip' && next.dripWeight !== null)
      fail('INVALID_INPUT', 400);
    if (next.setId) {
      const group = await ownedSet(tx, owner, next.setId);
      if (
        group.archived &&
        (!row.archived || patch.archived === false || next.setId !== row.setId)
      )
        fail('ARCHIVED');
    }
    if (next.format !== row.format) {
      const [b] = await tx
        .select({ id: brews.id })
        .from(brews)
        .where(eq(brews.itemId, id))
        .limit(1);
      const [a] = await tx
        .select({ id: adjustments.id })
        .from(adjustments)
        .where(eq(adjustments.itemId, id))
        .limit(1);
      if (b || a) fail('HAS_HISTORY');
    }
    const remaining =
      row.remaining + next.initialQuantity - row.initialQuantity;
    if (remaining < 0) fail('INSUFFICIENT_STOCK');
    if (remaining > 100_000_000) fail('INVALID_INPUT', 400);
    const [last] =
      next.setId && next.setId !== row.setId
        ? await tx
            .select({ position: items.position })
            .from(items)
            .where(eq(items.setId, next.setId))
            .orderBy(desc(items.position))
            .limit(1)
        : [];
    const [result] = await tx
      .update(items)
      .set({
        ...patch,
        remaining,
        version: row.version + 1,
        ...(next.setId !== row.setId
          ? { position: last ? last.position + 1 : 0 }
          : {}),
      })
      .where(eq(items.id, id))
      .returning();
    if (
      next.initialQuantity !== row.initialQuantity &&
      next.format === row.format
    )
      await tx.insert(adjustments).values({
        id: randomUUID(),
        userId: owner,
        itemId: id,
        delta: next.initialQuantity - row.initialQuantity,
        reason: 'initial-quantity-change',
        kind: 'initial',
      });
    await touchSet(tx, row.setId);
    if (next.setId !== row.setId) await touchSet(tx, next.setId);
    return presentItem(result);
  });
}
export async function deleteItem(owner: string, id: string, raw: unknown) {
  const { version } = versionInput.parse(raw);
  return write(owner, async (tx) => {
    const row = await ownedItem(tx, owner, id);
    checkVersion(row.version, version);
    const [b] = await tx
      .select({ id: brews.id })
      .from(brews)
      .where(eq(brews.itemId, id))
      .limit(1);
    const [a] = await tx
      .select({ id: adjustments.id })
      .from(adjustments)
      .where(eq(adjustments.itemId, id))
      .limit(1);
    if (b || a) fail('HAS_HISTORY');
    await tx.delete(items).where(eq(items.id, id));
    await touchSet(tx, row.setId);
    return { ok: true };
  });
}
export async function createSet(owner: string, raw: unknown) {
  const { items: children, ...input } = setInput.parse(raw);
  const id = await write(owner, async (tx) => {
    const id = randomUUID();
    await tx.insert(sets).values({ ...input, id, userId: owner });
    for (const [index, child] of children.entries())
      await insertItem(tx, owner, { ...child, setId: id }, index);
    return id;
  });
  return getSet(owner, id);
}
function presentSet(row: typeof sets.$inferSelect, children: Item[]) {
  return {
    ...row,
    items: children.map(presentItem),
    totals: {
      pieces: children
        .filter((i) => i.format === 'drip')
        .reduce((s, i) => s + i.remaining, 0),
      tenthGrams: children
        .filter((i) => i.format !== 'drip')
        .reduce((s, i) => s + i.remaining, 0),
      finished: children.filter((i) => i.remaining === 0).length,
    },
  };
}
export async function getSet(owner: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(sets)
    .where(and(eq(sets.id, id), eq(sets.userId, owner)));
  if (!row) fail('NOT_FOUND', 404);
  const children = await getDb()
    .select()
    .from(items)
    .where(and(eq(items.setId, id), eq(items.userId, owner)))
    .orderBy(items.position, items.createdAt, items.id);
  return presentSet(row, children);
}
export async function updateSet(owner: string, id: string, raw: unknown) {
  const { version, ...parsed } = setPatch.parse(raw);
  const patch = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => Object.hasOwn(raw as object, key)),
  ) as typeof parsed;
  await write(owner, async (tx) => {
    const row = await ownedSet(tx, owner, id);
    checkVersion(row.version, version);
    await tx
      .update(sets)
      .set({ ...patch, version: row.version + 1 })
      .where(eq(sets.id, id));
    if (patch.archived === true)
      await tx
        .update(items)
        .set({ archived: true, version: sql`${items.version}+1` })
        .where(and(eq(items.setId, id), eq(items.userId, owner)));
  });
  return getSet(owner, id);
}
export async function deleteSet(owner: string, id: string, raw: unknown) {
  const { version } = versionInput.parse(raw);
  return write(owner, async (tx) => {
    const row = await ownedSet(tx, owner, id);
    checkVersion(row.version, version);
    await tx
      .update(items)
      .set({ setId: null, version: sql`${items.version}+1` })
      .where(and(eq(items.setId, id), eq(items.userId, owner)));
    await tx.delete(sets).where(eq(sets.id, id));
    return { ok: true };
  });
}
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: short.default(''),
  format: z.enum(['', 'beans', 'ground', 'drip']).default(''),
  status: z
    .enum(['available', 'finished', 'archived', 'all'])
    .default('available'),
  repeat: z.enum(['', 'true']).default(''),
  sort: z.enum(['newest', 'expiry']).default('newest'),
  flat: z.enum(['', 'true']).default(''),
});
function matches(row: Item, query: z.infer<typeof listQuery>) {
  return (
    (!query.format || row.format === query.format) &&
    (!query.repeat || row.repeat) &&
    (query.status === 'all' ||
      (query.status === 'archived'
        ? row.archived
        : !row.archived &&
          (query.status === 'available'
            ? row.remaining > 0
            : row.remaining === 0)))
  );
}
function searched(
  row: { name: string; roaster: string; country?: string; region?: string },
  q: string,
) {
  return (
    !q ||
    [row.name, row.roaster, row.country, row.region]
      .join(' ')
      .toLocaleLowerCase()
      .includes(q.toLocaleLowerCase())
  );
}
export async function listInventory(owner: string, url: URL, onlySets = false) {
  const query = listQuery.parse(Object.fromEntries(url.searchParams));
  const [stocks, groups] = await Promise.all([
    getDb()
      .select()
      .from(items)
      .where(eq(items.userId, owner))
      .orderBy(items.position, items.createdAt, items.id),
    getDb().select().from(sets).where(eq(sets.userId, owner)),
  ]);
  const entries: (
    | { kind: 'item'; item: ReturnType<typeof presentItem> }
    | { kind: 'set'; set: ReturnType<typeof presentSet> }
  )[] = [];
  if (!onlySets)
    for (const row of stocks)
      if (
        (query.flat === 'true' || !row.setId) &&
        matches(row, query) &&
        searched(row, query.q)
      )
        entries.push({ kind: 'item', item: presentItem(row) });
  if (query.flat !== 'true')
    for (const row of groups) {
      const children = stocks.filter((i) => i.setId === row.id);
      const statusMatch =
        query.status === 'all' ||
        (query.status === 'archived'
          ? row.archived || children.some((i) => i.archived)
          : !row.archived);
      const childMatches = children.some(
        (i) =>
          matches(i, query) && (searched(row, query.q) || searched(i, query.q)),
      );
      if (
        statusMatch &&
        (childMatches ||
          (!children.length &&
            !query.format &&
            !query.repeat &&
            searched(row, query.q) &&
            (query.status === 'all' || query.status === 'archived')))
      )
        entries.push({ kind: 'set', set: presentSet(row, children) });
    }
  const value = (e: (typeof entries)[number]) =>
    e.kind === 'item' ? e.item : e.set;
  const expiry = (e: (typeof entries)[number]) =>
    e.kind === 'item'
      ? e.item.bestBefore
      : e.set.items
          .filter((i) => matches(i, query))
          .map((i) => i.bestBefore)
          .filter(Boolean)
          .sort()[0];
  entries.sort((a, b) =>
    query.sort === 'expiry'
      ? (expiry(a) || '9999').localeCompare(expiry(b) || '9999') ||
        value(a).id.localeCompare(value(b).id)
      : +value(b).createdAt - +value(a).createdAt ||
        value(a).id.localeCompare(value(b).id),
  );
  return {
    items: entries.slice((query.page - 1) * 20, query.page * 20),
    total: entries.length,
    page: query.page,
  };
}
function validateBrew(item: Item, input: z.infer<typeof brewInput>) {
  if (
    coffeeUnit(item.format) !== input.unit ||
    (item.format === 'drip') !== (input.method === 'drip')
  )
    fail('INVALID_INPUT', 400);
}
async function balance(tx: Tx, row: Item, delta: number) {
  const remaining = row.remaining + delta;
  if (remaining < 0) fail('INSUFFICIENT_STOCK');
  if (remaining > 100_000_000) fail('INVALID_INPUT', 400);
  await tx
    .update(items)
    .set({ remaining, version: sql`${items.version}+1` })
    .where(eq(items.id, row.id));
  await touchSet(tx, row.setId);
}
export async function createBrew(owner: string, raw: unknown) {
  const input = brewInput.extend({ operationId: z.string().uuid() }).parse(raw);
  return write(owner, (tx) =>
    replay(tx, owner, input, 'brew', async () => {
      const { operationId: _key, ...data } = input;
      void _key;
      const row = await ownedItem(tx, owner, data.itemId);
      validateBrew(row, data);
      if (row.archived) fail('ARCHIVED');
      await balance(tx, row, -data.quantity);
      const [result] = await tx
        .insert(brews)
        .values({
          ...data,
          id: randomUUID(),
          userId: owner,
          occurredAt: new Date(data.occurredAt),
        })
        .returning();
      return { ...result, itemName: row.name };
    }),
  );
}
export async function updateBrew(
  owner: string,
  id: string,
  raw: unknown,
  remove = false,
) {
  const input = remove
    ? versionInput.parse(raw)
    : brewInput.extend({ version: z.number().int().positive() }).parse(raw);
  return write(owner, async (tx) => {
    const [old] = await tx
      .select()
      .from(brews)
      .where(and(eq(brews.id, id), eq(brews.userId, owner)))
      .for('update');
    if (!old) fail('NOT_FOUND', 404);
    checkVersion(old.version, input.version);
    const next = remove
      ? null
      : (input as z.infer<typeof brewInput> & { version: number });
    const ids = [
      ...new Set([old.itemId, ...(next ? [next.itemId] : [])]),
    ].sort();
    const locked = new Map<string, Item>();
    for (const itemId of ids)
      locked.set(itemId, await ownedItem(tx, owner, itemId));
    const source = locked.get(old.itemId)!;
    if (next) {
      const target = locked.get(next.itemId)!;
      validateBrew(target, next);
      if (target.archived && target.id !== source.id) fail('ARCHIVED');
      if (target.id === source.id)
        await balance(tx, source, old.quantity - next.quantity);
      else {
        await balance(tx, source, old.quantity);
        await balance(tx, target, -next.quantity);
      }
      const [result] = await tx
        .update(brews)
        .set({
          ...next,
          occurredAt: new Date(next.occurredAt),
          version: old.version + 1,
        })
        .where(eq(brews.id, id))
        .returning();
      return { ...result, itemName: target.name };
    }
    await balance(tx, source, old.quantity);
    await tx.delete(brews).where(eq(brews.id, id));
    return { ok: true };
  });
}
export async function listBrews(owner: string, url: URL) {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .default(1)
    .parse(url.searchParams.get('page') || undefined);
  const itemId = url.searchParams.get('itemId'),
    setId = url.searchParams.get('setId');
  const conditions = [eq(brews.userId, owner)];
  if (itemId) {
    const owned = await getItem(owner, itemId);
    conditions.push(eq(brews.itemId, owned.id));
  }
  if (setId) {
    const owned = await getSet(owner, setId);
    if (!owned.items.length) return { items: [], total: 0, page };
    conditions.push(
      inArray(
        brews.itemId,
        owned.items.map((i) => i.id),
      ),
    );
  }
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const rows = await getDb()
    .select({ brew: brews, itemName: items.name })
    .from(brews)
    .innerJoin(items, eq(items.id, brews.itemId))
    .where(and(...conditions))
    .orderBy(desc(brews.occurredAt), brews.id);
  const filtered = rows.filter(
    (r) => !q || `${r.itemName} ${r.brew.note}`.toLowerCase().includes(q),
  );
  return {
    items: filtered
      .slice((page - 1) * 20, page * 20)
      .map((r) => ({ ...r.brew, itemName: r.itemName })),
    total: filtered.length,
    page,
  };
}
export async function getBrew(owner: string, id: string) {
  const [row] = await getDb()
    .select({ brew: brews, itemName: items.name })
    .from(brews)
    .innerJoin(items, eq(items.id, brews.itemId))
    .where(and(eq(brews.id, id), eq(brews.userId, owner)));
  if (!row) fail('NOT_FOUND', 404);
  return { ...row.brew, itemName: row.itemName };
}
export async function adjustItem(owner: string, id: string, raw: unknown) {
  const input = z
    .object({
      operationId: z.string().uuid(),
      version: z.number().int().positive(),
      mode: z.enum(['delta', 'actual']),
      quantity: z.number().int().min(-100_000_000).max(100_000_000),
      reason: text.min(1),
    })
    .strict()
    .parse(raw);
  return write(owner, (tx) =>
    replay(tx, owner, input, 'adjust:' + id, async () => {
      const row = await ownedItem(tx, owner, id);
      checkVersion(row.version, input.version);
      if (input.mode === 'actual' && input.quantity < 0)
        fail('INVALID_INPUT', 400);
      const delta =
        input.mode === 'actual'
          ? input.quantity - row.remaining
          : input.quantity;
      await balance(tx, row, delta);
      const [result] = await tx
        .insert(adjustments)
        .values({
          id: randomUUID(),
          userId: owner,
          itemId: id,
          delta,
          reason: input.reason,
        })
        .returning();
      return result;
    }),
  );
}
