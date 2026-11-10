import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import { startTestDatabase } from '../support/database';
import { TEST_PASSWORD } from '../support/constants';

let database: Awaited<ReturnType<typeof startTestDatabase>>;
let server: Server;
let oidc: Server;
let app: typeof import('../../src/app/api/v1/[...segments]/route');
let authRoute: typeof import('../../src/app/api/auth/[...all]/route');
let access: typeof import('../../src/server/access');
let db: typeof import('../../src/server/db');
const base = 'http://127.0.0.1:3400';
const mails: import('../../src/server/mail').Mail[] = [];
let identity = {
  id: 'google-user',
  name: 'Google User',
  email: 'google@blackmilk.test',
  emailVerified: true,
};
const codes = new Map<string, typeof identity>();

class Browser {
  cookies = new Map<string, string>();
  async request(
    path: string,
    method = 'GET',
    body?: unknown,
    withOrigin = true,
  ) {
    const response = await fetch(path.startsWith('http') ? path : base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(withOrigin ? { Origin: base } : {}),
        Cookie: [...this.cookies].map(([k, v]) => k + '=' + v).join('; '),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const index = pair.indexOf('=');
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  async signIn(email: string, password = TEST_PASSWORD) {
    const response = await this.request('/api/auth/sign-in/email', 'POST', {
      email,
      password,
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response;
  }
}
async function grant(email: string, bootstrap = false) {
  await database.pool.query(
    'INSERT INTO access_grants (email,bootstrap_admin) VALUES ($1,$2) ON CONFLICT (email) DO UPDATE SET bootstrap_admin=$2',
    [email, bootstrap],
  );
}
async function resetLimits() {
  await database.pool.query('TRUNCATE rate_limits, request_limits');
}
function mailLink(email: string) {
  const mail = [...mails].reverse().find((item) => item.to === email);
  assert.ok(mail);
  const match = mail.text.match(/https?:\/\/\S+/);
  assert.ok(match);
  return new URL(match[0]);
}
async function register(email: string, name = 'Coffee Member') {
  const browser = new Browser();
  const response = await browser.request('/api/auth/sign-up/email', 'POST', {
    email,
    password: TEST_PASSWORD,
    name,
    callbackURL: base + '/ru/verify-email',
  });
  assert.equal(response.status, 200, await response.clone().text());
  const link = mailLink(email);
  assert.equal((await browser.request(link.toString())).status, 302);
  await browser.signIn(email);
  return browser;
}
before(async () => {
  database = await startTestDatabase();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: database.url,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: base,
    TEST_OIDC_URL: 'http://127.0.0.1:3401',
  });
  const mail = await import('../../src/server/mail');
  mail.setTestMailTransport(async (message) => {
    mails.push(message);
  });
  app = await import('../../src/app/api/v1/[...segments]/route');
  authRoute = await import('../../src/app/api/auth/[...all]/route');
  access = await import('../../src/server/access');
  db = await import('../../src/server/db');
  server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers))
        if (value)
          headers.set(name, Array.isArray(value) ? value.join(',') : value);
      const request = new Request(base + incoming.url, {
        method: incoming.method,
        headers,
        ...(body ? { body } : {}),
      });
      const route = incoming.url?.startsWith('/api/auth/') ? authRoute : app;
      const handler = route[incoming.method as 'GET' | 'POST'];
      const response = await handler(request);
      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') outgoing.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoing.setHeader('set-cookie', cookies);
      outgoing.end(await response.text());
    } catch (error) {
      console.error(error);
      outgoing.writeHead(500).end();
    }
  });
  await new Promise<void>((resolve) =>
    server.listen(3400, '127.0.0.1', resolve),
  );
  oidc = createServer(async (request, response) => {
    const url = new URL(request.url || '', 'http://127.0.0.1:3401');
    if (url.pathname === '/authorize') {
      const redirect = new URL(url.searchParams.get('redirect_uri')!);
      const code = randomUUID();
      codes.set(code, { ...identity });
      redirect.searchParams.set('code', code);
      redirect.searchParams.set('state', url.searchParams.get('state')!);
      response.writeHead(302, { Location: redirect.toString() }).end();
      return;
    }
    if (url.pathname === '/token') {
      const chunks = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const data = new URLSearchParams(Buffer.concat(chunks).toString());
      const code = data.get('code')!;
      if (!codes.has(code)) {
        response.writeHead(400).end();
        return;
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          access_token: code,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      );
      return;
    }
    if (url.pathname === '/userinfo') {
      const code = request.headers.authorization?.slice(7) || '';
      const person = codes.get(code);
      response.writeHead(person ? 200 : 401, {
        'Content-Type': 'application/json',
      });
      response.end(JSON.stringify(person || {}));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => oidc.listen(3401, '127.0.0.1', resolve));
});
after(async () => {
  server?.closeAllConnections();
  oidc?.closeAllConnections();
  await Promise.all([
    server
      ? new Promise<void>((resolve) => server.close(() => resolve()))
      : undefined,
    oidc
      ? new Promise<void>((resolve) => oidc.close(() => resolve()))
      : undefined,
  ]);
  await db?.closeDb();
  await database?.stop();
});

test('accounts, access control and administration on PostgreSQL', async (t) => {
  const anonymous = new Browser();
  let admin: Browser;
  let member: Browser;
  let adminId: string;
  let memberId: string;
  await t.test(
    'closed registration, anonymous access and CSRF are enforced server-side',
    async () => {
      assert.equal((await anonymous.request('/api/v1/me')).status, 401);
      assert.equal(
        (
          await anonymous.request('/api/auth/sign-up/email', 'POST', {
            name: 'No access',
            email: 'denied@blackmilk.test',
            password: TEST_PASSWORD,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await anonymous.request(
            '/api/auth/sign-up/email',
            'POST',
            {
              name: 'No origin',
              email: 'denied@blackmilk.test',
              password: TEST_PASSWORD,
            },
            false,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await anonymous.request(
            '/api/v1/admin/settings',
            'PATCH',
            { registrationMode: 'open' },
            false,
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    'bootstrap requires verified ownership; email registration and verification work',
    async () => {
      await access.bootstrapAdmin('admin@blackmilk.test');
      const unverified = new Browser();
      const signup = await unverified.request(
        '/api/auth/sign-up/email',
        'POST',
        {
          name: 'Admin',
          email: 'admin@blackmilk.test',
          password: TEST_PASSWORD,
          callbackURL: base + '/ru/verify-email',
        },
      );
      assert.equal(signup.status, 200, await signup.clone().text());
      assert.equal(
        (
          await unverified.request('/api/auth/sign-in/email', 'POST', {
            email: 'admin@blackmilk.test',
            password: TEST_PASSWORD,
          })
        ).status,
        403,
      );
      const row = await database.pool.query(
        'SELECT role FROM users WHERE email=$1',
        ['admin@blackmilk.test'],
      );
      assert.equal(row.rows[0].role, 'user');
      assert.equal(
        (await unverified.request(mailLink('admin@blackmilk.test').toString()))
          .status,
        302,
      );
      await unverified.signIn('admin@blackmilk.test');
      admin = unverified;
      const profile = await (await admin.request('/api/v1/me')).json();
      assert.equal(profile.role, 'admin');
      adminId = profile.id;
      await grant('member@blackmilk.test');
      member = await register('member@blackmilk.test');
      memberId = (await (await member.request('/api/v1/me')).json()).id;
    },
  );
  await t.test(
    'profile is isolated; standard auth endpoints cannot grant privilege or change avatar',
    async () => {
      assert.equal((await member.request('/api/v1/admin/users')).status, 403);
      assert.equal(
        (
          await member.request('/api/v1/me', 'PATCH', {
            name: 'New name',
            role: 'admin',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await member.request('/api/auth/update-user', 'POST', {
            role: 'admin',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await member.request('/api/auth/update-user', 'POST', {
            image: 'https://example.test/avatar',
          })
        ).status,
        403,
      );
      assert.equal(
        (await member.request('/api/v1/me', 'PATCH', { name: 'My coffee' }))
          .status,
        200,
      );
      assert.equal(
        (await (await member.request('/api/v1/me')).json()).role,
        'user',
      );
    },
  );
  await t.test(
    'sessions are listed without tokens and cannot be revoked by another user',
    async () => {
      const second = new Browser();
      await second.signIn('member@blackmilk.test');
      const list = await (await member.request('/api/v1/me/sessions')).json();
      assert.ok(list.length >= 2);
      assert.equal('token' in list[0], false);
      const own = await (await admin.request('/api/v1/me/sessions')).json();
      await member.request('/api/v1/me/sessions/' + own[0].id, 'DELETE');
      assert.equal((await admin.request('/api/v1/me')).status, 200);
      await member.request('/api/v1/me/sessions', 'DELETE');
      assert.equal((await second.request('/api/v1/me')).status, 401);
    },
  );
  await t.test(
    'role changes and blocking immediately invalidate access',
    async () => {
      assert.equal(
        (
          await admin.request('/api/v1/admin/users/' + memberId, 'PATCH', {
            role: 'admin',
          })
        ).status,
        200,
      );
      assert.equal((await member.request('/api/v1/me')).status, 401);
      await member.signIn('member@blackmilk.test');
      assert.equal((await member.request('/api/v1/admin/users')).status, 200);
      await admin.request('/api/v1/admin/users/' + memberId, 'PATCH', {
        role: 'user',
      });
      await member.signIn('member@blackmilk.test');
      await admin.request('/api/v1/admin/users/' + memberId, 'PATCH', {
        blocked: true,
      });
      assert.ok(
        [401, 403].includes((await member.request('/api/v1/me')).status),
      );
      assert.equal(
        (
          await member.request('/api/auth/sign-in/email', 'POST', {
            email: 'member@blackmilk.test',
            password: TEST_PASSWORD,
          })
        ).status,
        403,
      );
      await admin.request('/api/v1/admin/users/' + memberId, 'PATCH', {
        blocked: false,
      });
      await member.signIn('member@blackmilk.test');
    },
  );
  await t.test(
    'email activation is atomic, expires, resends and cannot be replayed',
    async () => {
      const input = {
        email: 'activate@blackmilk.test',
        name: 'New member',
        locale: 'en',
      };
      assert.equal(
        (await admin.request('/api/v1/admin/users', 'POST', input)).status,
        200,
      );
      const old = mailLink(input.email).searchParams.get('token');
      const rows = await (
        await admin.request('/api/v1/admin/invitations')
      ).json();
      await admin.request(
        '/api/v1/admin/invitations/' + rows[0].id + '/resend',
        'POST',
        input,
      );
      assert.equal(
        (
          await anonymous.request('/api/v1/activate', 'POST', {
            token: old,
            password: TEST_PASSWORD,
          })
        ).status,
        400,
      );
      const token = mailLink(input.email).searchParams.get('token');
      const results = await Promise.all([
        anonymous.request('/api/v1/activate', 'POST', {
          token,
          password: TEST_PASSWORD,
        }),
        anonymous.request('/api/v1/activate', 'POST', {
          token,
          password: TEST_PASSWORD,
        }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
      await new Browser().signIn(input.email);
      await admin.request('/api/v1/admin/users', 'POST', {
        ...input,
        email: 'expired@blackmilk.test',
      });
      const expired = mailLink('expired@blackmilk.test').searchParams.get(
        'token',
      );
      await database.pool.query(
        "UPDATE invitations SET expires_at=now()-interval '1 day' WHERE email=$1",
        ['expired@blackmilk.test'],
      );
      assert.equal(
        (
          await anonymous.request('/api/v1/activate', 'POST', {
            token: expired,
            password: TEST_PASSWORD,
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    'open mode permits new registrations; closing it keeps existing accounts',
    async () => {
      await admin.request('/api/v1/admin/settings', 'PATCH', {
        registrationMode: 'open',
      });
      const open = await register('open@blackmilk.test');
      await admin.request('/api/v1/admin/settings', 'PATCH', {
        registrationMode: 'invite-only',
      });
      assert.equal((await open.request('/api/v1/me')).status, 200);
      assert.equal(
        (
          await anonymous.request('/api/auth/sign-up/email', 'POST', {
            email: 'again-denied@blackmilk.test',
            name: 'Denied',
            password: TEST_PASSWORD,
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    'password reset consumes its token and revokes every previous session',
    async () => {
      await resetLimits();
      const result = await anonymous.request(
        '/api/auth/request-password-reset',
        'POST',
        {
          email: 'member@blackmilk.test',
          redirectTo: base + '/ru/reset-password',
        },
      );
      assert.equal(result.status, 200, await result.clone().text());
      const mailed = mailLink('member@blackmilk.test');
      const redirect = await anonymous.request(mailed.toString());
      assert.equal(redirect.status, 302);
      const token = new URL(
        redirect.headers.get('location')!,
        base,
      ).searchParams.get('token');
      assert.ok(token);
      assert.equal(
        (
          await anonymous.request('/api/auth/reset-password', 'POST', {
            token,
            newPassword: TEST_PASSWORD + '2',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await anonymous.request('/api/auth/reset-password', 'POST', {
            token,
            newPassword: TEST_PASSWORD,
          })
        ).status,
        400,
      );
      assert.equal((await member.request('/api/v1/me')).status, 401);
      await member.signIn('member@blackmilk.test', TEST_PASSWORD + '2');
    },
  );
  await t.test(
    'OAuth uses state, verified identity, invitation policy and explicit linking',
    async () => {
      await resetLimits();
      async function oauth(
        browser: Browser,
        email: string,
        verified = true,
        link = false,
      ) {
        await resetLimits();
        identity = {
          id: email,
          name: 'Google member',
          email,
          emailVerified: verified,
        };
        const start = await browser.request(
          link ? '/api/auth/link-social' : '/api/auth/sign-in/social',
          'POST',
          { provider: 'test-oidc', callbackURL: base + '/ru/account' },
        );
        assert.equal(start.status, 200, await start.clone().text());
        const data = await start.json();
        const authorization = await browser.request(data.url);
        assert.equal(authorization.status, 302);
        return browser.request(authorization.headers.get('location')!);
      }
      const denied = new Browser();
      await oauth(denied, 'no-invite-google@blackmilk.test');
      assert.equal((await denied.request('/api/v1/me')).status, 401);
      await grant('google@blackmilk.test');
      const google = new Browser();
      await oauth(google, 'google@blackmilk.test');
      assert.equal((await google.request('/api/v1/me')).status, 200);
      const implicit = new Browser();
      await oauth(implicit, 'member@blackmilk.test');
      assert.equal((await implicit.request('/api/v1/me')).status, 401);
      await oauth(member, 'member@blackmilk.test', true, true);
      const profile = await (await member.request('/api/v1/me')).json();
      assert.ok(profile.providers.includes('test-oidc'));
      await grant('unverified-google@blackmilk.test');
      const unverified = new Browser();
      await oauth(unverified, 'unverified-google@blackmilk.test', false);
      assert.equal((await unverified.request('/api/v1/me')).status, 401);
      const production = spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          "import { getAuth } from './src/server/auth.ts'; process.exit(getAuth().options.plugins?.some(p => p.id === 'generic-oauth') ? 1 : 0);",
        ],
        {
          env: { ...process.env, NODE_ENV: 'production' },
          encoding: 'utf8',
          timeout: 10_000,
        },
      );
      assert.equal(
        production.status,
        0,
        'The test OAuth provider must not be registered in production',
      );
    },
  );
  await t.test(
    'self protection and concurrent admin changes preserve an active administrator',
    async () => {
      await resetLimits();
      await admin.request('/api/v1/admin/users/' + memberId, 'PATCH', {
        role: 'admin',
      });
      await member.signIn('member@blackmilk.test', TEST_PASSWORD + '2');
      assert.equal(
        (
          await admin.request('/api/v1/admin/users/' + adminId, 'DELETE', {
            email: 'admin@blackmilk.test',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await admin.request('/api/v1/admin/users/' + adminId, 'PATCH', {
            blocked: true,
          })
        ).status,
        409,
      );
      const result = await Promise.all([
        admin.request('/api/v1/admin/users/' + memberId, 'PATCH', {
          role: 'user',
        }),
        member.request('/api/v1/admin/users/' + adminId, 'PATCH', {
          role: 'user',
        }),
      ]);
      assert.ok(result.some((r) => r.status === 200));
      assert.ok(result.some((r) => [401, 403].includes(r.status)));
      const rows = await database.pool.query(
        "SELECT count(*)::int AS count FROM users WHERE role='admin' AND blocked=false AND email_verified=true",
      );
      assert.equal(rows.rows[0].count, 1);
      // Restore a known admin through the operator connection only for subsequent assertions.
      await database.pool.query("UPDATE users SET role='admin' WHERE id=$1", [
        adminId,
      ]);
      await admin.signIn('admin@blackmilk.test');
    },
  );
  await t.test(
    'deletion removes credentials, sessions, grants, pending tokens and identifying audit data',
    async () => {
      await resetLimits();
      const target = await database.pool.query(
        'SELECT id FROM users WHERE email=$1',
        ['activate@blackmilk.test'],
      );
      const id = target.rows[0].id;
      assert.equal(
        (
          await admin.request('/api/v1/admin/users/' + id, 'DELETE', {
            email: 'wrong@blackmilk.test',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await admin.request('/api/v1/admin/users/' + id, 'DELETE', {
            email: 'activate@blackmilk.test',
          })
        ).status,
        200,
      );
      for (const table of ['users', 'accounts', 'sessions']) {
        const key = table === 'users' ? 'id' : 'user_id';
        assert.equal(
          (
            await database.pool.query(
              `SELECT count(*)::int AS count FROM ${table} WHERE ${key}=$1`,
              [id],
            )
          ).rows[0].count,
          0,
        );
      }
      assert.equal(
        (
          await database.pool.query(
            'SELECT count(*)::int AS count FROM access_grants WHERE email=$1',
            ['activate@blackmilk.test'],
          )
        ).rows[0].count,
        0,
      );
      assert.equal(
        (
          await database.pool.query(
            'SELECT count(*)::int AS count FROM audit_events WHERE target_email=$1',
            ['activate@blackmilk.test'],
          )
        ).rows[0].count,
        0,
      );
      assert.ok(
        (await (await admin.request('/api/v1/admin/audit')).json()).total > 0,
      );
    },
  );
  await t.test('request limits persist across clients', async () => {
    await resetLimits();
    const { limitRequest } = await import('../../src/server/security');
    for (let index = 0; index < 3; index++)
      await limitRequest(new Request(base), 'shared-test', 3);
    await assert.rejects(
      () => limitRequest(new Request(base), 'shared-test', 3),
      { code: 'RATE_LIMITED' },
    );
    for (let index = 0; index < 10; index++) {
      const response = await anonymous.request(
        '/api/auth/sign-in/email',
        'POST',
        { email: 'member@blackmilk.test', password: 'Wrong-coffee-password!' },
      );
      assert.equal(response.status, 401);
    }
    assert.equal(
      (
        await new Browser().request('/api/auth/sign-in/email', 'POST', {
          email: 'member@blackmilk.test',
          password: 'Wrong-coffee-password!',
        })
      ).status,
      429,
    );
  });
});
