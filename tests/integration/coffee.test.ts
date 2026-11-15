import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { startTestDatabase } from '../support/database';
import type { CoffeeItem, CoffeeSet, Brew } from '../../src/contracts/coffee';

let database: Awaited<ReturnType<typeof startTestDatabase>>;
let route: typeof import('../../src/app/api/v1/[...segments]/route');
let auth: typeof import('../../src/app/api/auth/[...all]/route');
let db: typeof import('../../src/server/db');
const base = 'http://127.0.0.1:3405';
const owner = randomUUID(),
  other = randomUUID();
let cookie = '',
  otherCookie = '';
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  session = cookie,
  origin = base,
) {
  return route[method as 'GET' | 'POST' | 'PATCH' | 'DELETE'](
    new Request(base + '/api/v1/' + path, {
      method,
      headers: {
        Cookie: session,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
async function ok<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await request(path, method, body);
  assert.equal(res.status, 200, await res.clone().text());
  return res.json();
}
async function error(
  path: string,
  method: string,
  body: unknown,
  code: string,
  session = cookie,
  origin = base,
) {
  const res = await request(path, method, body, session, origin);
  assert.ok(res.status >= 400, await res.clone().text());
  assert.equal((await res.json()).error.code, code);
}
const stock = (name = 'Brazil', format = 'beans', initialQuantity = 2500) => ({
  name,
  format,
  initialQuantity,
  roaster: 'Roaster',
  country: 'Brazil',
  note: 'keep this note',
});
const brew = (item: CoffeeItem, quantity = 150) => ({
  itemId: item.id,
  quantity,
  unit: item.unit,
  method: item.format === 'drip' ? 'drip' : 'pour-over',
  occurredAt: new Date().toISOString(),
  operationId: randomUUID(),
});
before(async () => {
  database = await startTestDatabase();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: database.url,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: base,
  });
  route = await import('../../src/app/api/v1/[...segments]/route');
  auth = await import('../../src/app/api/auth/[...all]/route');
  db = await import('../../src/server/db');
  const password = await hashPassword('CoffeeTestPassword123!');
  for (const id of [owner, other]) {
    await database.pool.query(
      'INSERT INTO users (id,name,email,email_verified) VALUES ($1,$2,$3,true)',
      [id, 'Member', id + '@blackmilk.test'],
    );
    await database.pool.query(
      "INSERT INTO accounts (id,user_id,account_id,provider_id,password) VALUES ($1,$2,$2,'credential',$3)",
      [randomUUID(), id, password],
    );
    const response = await auth.POST(
      new Request(base + '/api/auth/sign-in/email', {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: id + '@blackmilk.test',
          password: 'CoffeeTestPassword123!',
        }),
      }),
    );
    assert.equal(response.status, 200);
    const cookies = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    if (id === owner) cookie = cookies;
    else otherCookie = cookies;
  }
});
after(async () => {
  await db?.closeDb();
  await database?.stop();
});

test('coffee inventory and transactional accounting', async (t) => {
  t.beforeEach(async () => {
    await database.pool.query('TRUNCATE request_limits, rate_limits');
  });
  await t.test(
    'grams: create, edit, transfer and remove a brew with exact stock returns',
    async () => {
      const a = await ok<CoffeeItem>('coffee-items', 'POST', stock()),
        b = await ok<CoffeeItem>(
          'coffee-items',
          'POST',
          stock('Ground', 'ground', 1000),
        );
      const made = await ok<Brew>('brews', 'POST', brew(a));
      assert.equal(
        (await ok<CoffeeItem>('coffee-items/' + a.id)).remaining,
        2350,
      );
      const changed = await ok<Brew>('brews/' + made.id, 'PATCH', {
        itemId: a.id,
        quantity: 180,
        unit: a.unit,
        method: 'espresso',
        occurredAt: made.occurredAt,
        rating: 8,
        note: 'nice',
        version: made.version,
      });
      assert.equal(
        (await ok<CoffeeItem>('coffee-items/' + a.id)).remaining,
        2320,
      );
      const moved = await ok<Brew>('brews/' + made.id, 'PATCH', {
        itemId: b.id,
        quantity: 180,
        unit: b.unit,
        method: 'pour-over',
        occurredAt: made.occurredAt,
        version: changed.version,
      });
      assert.equal(
        (await ok<CoffeeItem>('coffee-items/' + a.id)).remaining,
        2500,
      );
      assert.equal(
        (await ok<CoffeeItem>('coffee-items/' + b.id)).remaining,
        820,
      );
      await ok('brews/' + made.id, 'DELETE', { version: moved.version });
      assert.equal(
        (await ok<CoffeeItem>('coffee-items/' + b.id)).remaining,
        1000,
      );
    },
  );
  await t.test(
    'mixed set tracks individual drip origins and bean stock, including component search',
    async () => {
      const group = await ok<CoffeeSet>('coffee-sets', 'POST', {
        name: 'World Cup 2026',
        roaster: 'Ekaterina',
        items: [
          stock('Brazil drip', 'drip', 3),
          stock('Guatemala drip', 'drip', 2),
          stock('Bean bag', 'beans', 2000),
        ],
      });
      const brazil = group.items[0];
      await ok('brews', 'POST', brew(brazil, 1));
      const updated = await ok<CoffeeSet>('coffee-sets/' + group.id);
      assert.equal(updated.totals.pieces, 4);
      assert.equal(updated.totals.tenthGrams, 2000);
      const found = await ok<{ items: { kind: string; set: CoffeeSet }[] }>(
        'coffee-items?q=Guatemala',
      );
      assert.ok(
        found.items.some((e) => e.kind === 'set' && e.set.id === group.id),
      );
      await error(
        'coffee-items/' + brazil.id,
        'PATCH',
        { version: 2, format: 'beans' },
        'HAS_HISTORY',
      );
      const detached = await ok<CoffeeItem>(
        'coffee-items/' + brazil.id,
        'PATCH',
        { version: 2, setId: null },
      );
      assert.equal(detached.remaining, 2);
      assert.equal(detached.roaster, 'Roaster');
      assert.equal(detached.note, 'keep this note');
      await ok('coffee-sets/' + group.id, 'DELETE', {
        version: (await ok<CoffeeSet>('coffee-sets/' + group.id)).version,
      });
      assert.equal(
        (await ok<CoffeeItem>('coffee-items/' + group.items[1].id)).setId,
        null,
      );
    },
  );
  await t.test(
    'concurrent spending of the final drip permits only one brew',
    async () => {
      const item = await ok<CoffeeItem>(
        'coffee-items',
        'POST',
        stock('Last drip', 'drip', 1),
      );
      const responses = await Promise.all([
        request('brews', 'POST', brew(item, 1)),
        request('brews', 'POST', brew(item, 1)),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (await ok<CoffeeItem>('coffee-items/' + item.id)).remaining,
        0,
      );
    },
  );
  await t.test(
    'operation retries spend once, changed payload conflicts, undo returns stock',
    async () => {
      const item = await ok<CoffeeItem>(
        'coffee-items',
        'POST',
        stock('Drips', 'drip', 3),
      );
      const input = brew(item, 1);
      const [a, b] = await Promise.all([
        ok<Brew>('brews', 'POST', input),
        ok<Brew>('brews', 'POST', input),
      ]);
      assert.equal(a.id, b.id);
      assert.equal(
        (await ok<CoffeeItem>('coffee-items/' + item.id)).remaining,
        2,
      );
      await error('brews', 'POST', { ...input, quantity: 2 }, 'CONFLICT');
      await ok('brews/' + a.id, 'DELETE', { version: a.version });
      assert.equal(
        (await ok<CoffeeItem>('coffee-items/' + item.id)).remaining,
        3,
      );
      const retried = await ok<Brew>('brews', 'POST', input);
      assert.equal(retried.id, a.id);
      assert.equal(
        (await ok<CoffeeItem>('coffee-items/' + item.id)).remaining,
        3,
      );
    },
  );
  await t.test(
    'adjustments, initial quantity changes and stale versions preserve all invariants',
    async () => {
      let item = await ok<CoffeeItem>('coffee-items', 'POST', stock());
      await ok('brews', 'POST', brew(item));
      item = await ok<CoffeeItem>('coffee-items/' + item.id);
      const input = {
        operationId: randomUUID(),
        version: item.version,
        mode: 'delta',
        quantity: -50,
        reason: 'spilled',
      };
      const a = await ok<{ id: string }>(
        'coffee-items/' + item.id + '/adjustments',
        'POST',
        input,
      );
      const b = await ok<{ id: string }>(
        'coffee-items/' + item.id + '/adjustments',
        'POST',
        input,
      );
      assert.equal(a.id, b.id);
      await error(
        'coffee-items/' + item.id,
        'PATCH',
        { version: item.version, name: 'stale' },
        'CONFLICT',
      );
      item = await ok<CoffeeItem>('coffee-items/' + item.id);
      assert.equal(item.remaining, 2300);
      await ok('coffee-items/' + item.id + '/adjustments', 'POST', {
        operationId: randomUUID(),
        version: item.version,
        mode: 'actual',
        quantity: 2280,
        reason: 'measured',
      });
      item = await ok<CoffeeItem>('coffee-items/' + item.id);
      assert.equal(item.remaining, 2280);
      const changed = await ok<CoffeeItem>('coffee-items/' + item.id, 'PATCH', {
        version: item.version,
        initialQuantity: 2600,
      });
      assert.equal(changed.remaining, 2380);
      await error(
        'coffee-items/' + item.id,
        'PATCH',
        { version: changed.version, initialQuantity: 1 },
        'INSUFFICIENT_STOCK',
      );
      await error(
        'coffee-items/' + item.id,
        'DELETE',
        { version: changed.version },
        'HAS_HISTORY',
      );
    },
  );
  await t.test(
    'failed transfers and invalid set creation roll back every change',
    async () => {
      const a = await ok<CoffeeItem>('coffee-items', 'POST', stock()),
        b = await ok<CoffeeItem>(
          'coffee-items',
          'POST',
          stock('small', 'beans', 1),
        );
      const made = await ok<Brew>('brews', 'POST', brew(a));
      await error(
        'brews/' + made.id,
        'PATCH',
        {
          itemId: b.id,
          quantity: 100,
          unit: b.unit,
          method: 'espresso',
          occurredAt: made.occurredAt,
          version: 1,
        },
        'INSUFFICIENT_STOCK',
      );
      assert.equal(
        (await ok<CoffeeItem>('coffee-items/' + a.id)).remaining,
        2350,
      );
      assert.equal((await ok<CoffeeItem>('coffee-items/' + b.id)).remaining, 1);
      await error(
        'coffee-sets',
        'POST',
        { name: 'Rollback', items: [stock(), { ...stock(), dripWeight: 100 }] },
        'INVALID_INPUT',
      );
      const listed = await ok<{ total: number }>(
        'coffee-sets?status=all&q=Rollback',
      );
      assert.equal(listed.total, 0);
    },
  );
  await t.test(
    'validation rejects fractional pieces, invalid dates, ratings and unit mismatches',
    async () => {
      await error(
        'coffee-items',
        'POST',
        stock('fraction', 'drip', 1.5),
        'INVALID_INPUT',
      );
      await error(
        'coffee-items',
        'POST',
        { ...stock(), roastDate: '2026-02-30' },
        'INVALID_INPUT',
      );
      const draft = await ok<CoffeeItem>(
        'coffee-items',
        'POST',
        stock('Wrong format'),
      );
      const converted = await ok<CoffeeItem>(
        'coffee-items/' + draft.id,
        'PATCH',
        { version: draft.version, format: 'drip', initialQuantity: 3 },
      );
      assert.equal(converted.remaining, 3);
      assert.deepEqual(
        (await ok<{ adjustments: unknown[] }>('coffee-items/' + draft.id))
          .adjustments,
        [],
      );
      const item = await ok<CoffeeItem>('coffee-items', 'POST', stock());
      await error(
        'brews',
        'POST',
        { ...brew(item), rating: 0 },
        'INVALID_INPUT',
      );
      await error(
        'brews',
        'POST',
        { ...brew(item), unit: 'piece' },
        'INVALID_INPUT',
      );
      await error('brews', 'POST', brew(item, 99999), 'INSUFFICIENT_STOCK');
    },
  );
  await t.test(
    'archives preserve history; restoring a set does not restore its components',
    async () => {
      const group = await ok<CoffeeSet>('coffee-sets', 'POST', {
        name: 'Archive me',
        items: [stock('Archive drip', 'drip', 2)],
      });
      const item = group.items[0],
        made = await ok<Brew>('brews', 'POST', brew(item, 1));
      let latest = await ok<CoffeeSet>('coffee-sets/' + group.id);
      latest = await ok<CoffeeSet>('coffee-sets/' + group.id, 'PATCH', {
        version: latest.version,
        archived: true,
      });
      assert.equal(latest.items[0].archived, true);
      const archived = await ok<{ items: { kind: string; set: CoffeeSet }[] }>(
        'coffee-items?status=archived&q=Archive%20me',
      );
      assert.ok(
        archived.items.some((e) => e.kind === 'set' && e.set.id === group.id),
      );
      assert.equal(latest.name, 'Archive me');
      await error('brews', 'POST', brew(item, 1), 'ARCHIVED');
      await ok('brews/' + made.id, 'DELETE', { version: made.version });
      latest = await ok<CoffeeSet>('coffee-sets/' + group.id);
      latest = await ok<CoffeeSet>('coffee-sets/' + group.id, 'PATCH', {
        version: latest.version,
        archived: false,
      });
      assert.equal(latest.items[0].archived, true);
    },
  );
  await t.test(
    'private records, set membership, brews and mutations enforce ownership and Origin',
    async () => {
      const item = await ok<CoffeeItem>('coffee-items', 'POST', stock()),
        group = await ok<CoffeeSet>('coffee-sets', 'POST', {
          name: 'Private',
          items: [stock()],
        });
      const made = await ok<Brew>('brews', 'POST', brew(item));
      for (const path of [
        'coffee-items/' + item.id,
        'coffee-sets/' + group.id,
        'brews/' + made.id,
      ])
        await error(path, 'GET', undefined, 'NOT_FOUND', otherCookie);
      await error(
        'coffee-items',
        'POST',
        { ...stock(), setId: group.id },
        'NOT_FOUND',
        otherCookie,
      );
      await error('brews', 'POST', brew(item), 'NOT_FOUND', otherCookie);
      await error(
        'coffee-items/' + item.id,
        'PATCH',
        { version: 2, repeat: true },
        'FORBIDDEN',
        cookie,
        'https://wrong.test',
      );
      await error('coffee-items', 'GET', undefined, 'UNAUTHORIZED', '');
    },
  );
  await t.test(
    'server pagination and expired coffee remain usable; user deletion removes all coffee data',
    async () => {
      for (let i = 0; i < 23; i++)
        await ok('coffee-items', 'POST', {
          ...stock('pagination-' + i, 'drip', 2),
          bestBefore: '2020-01-01',
        });
      const first = await ok<{ items: unknown[]; total: number }>(
        'coffee-items?q=pagination-',
      );
      const second = await ok<{ items: unknown[] }>(
        'coffee-items?q=pagination-&page=2',
      );
      assert.equal(first.total, 23);
      assert.equal(first.items.length, 20);
      assert.equal(second.items.length, 3);
      const expired = await ok<CoffeeItem>('coffee-items', 'POST', {
        ...stock('Expired drip', 'drip', 2),
        bestBefore: '2020-01-01',
      });
      await ok('brews', 'POST', brew(expired, 1));
      await database.pool.query('DELETE FROM users WHERE id=$1', [owner]);
      for (const table of [
        'coffee_items',
        'coffee_sets',
        'coffee_brews',
        'coffee_adjustments',
        'coffee_operations',
      ])
        assert.equal(
          (
            await database.pool.query(
              `SELECT count(*) FROM ${table} WHERE user_id=$1`,
              [owner],
            )
          ).rows[0].count,
          '0',
        );
    },
  );
});
