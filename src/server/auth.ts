import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { genericOAuth } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import * as schema from './db/schema';
import { getConfig, googleEnabled, normalizeEmail } from './config';
import { grantBootstrapRole, registrationAllowed } from './access';
import { assertMailAvailable, sendMail } from './mail';

function createAuth() {
  const config = getConfig();
  return betterAuth({
    appName: 'Black&Milk',
    baseURL: config.baseUrl,
    secret: config.secret,
    trustedOrigins: [config.baseUrl],
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema,
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: 'Black&Milk — восстановление / password reset',
          text: `Установите пароль / Set your password:\n${url}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: 'Black&Milk — подтвердите email / verify email',
          text: `Подтвердите адрес / Verify your address:\n${url}`,
        });
      },
    },
    socialProviders: googleEnabled()
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            mapProfileToUser: (profile) => {
              if (!profile.email_verified)
                throw new APIError('FORBIDDEN', {
                  message: 'EMAIL_NOT_VERIFIED',
                });
              return {
                email: normalizeEmail(profile.email),
                emailVerified: true,
              };
            },
          },
        }
      : {},
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
      },
    },
    plugins:
      process.env.NODE_ENV === 'test' && process.env.TEST_OIDC_URL
        ? [
            genericOAuth({
              config: [
                {
                  providerId: 'test-oidc',
                  clientId: 'black-milk-test',
                  clientSecret: 'test-only-secret',
                  authorizationUrl: process.env.TEST_OIDC_URL + '/authorize',
                  tokenUrl: process.env.TEST_OIDC_URL + '/token',
                  scopes: ['openid', 'email'],
                  getUserInfo: async (tokens) => {
                    const response = await fetch(
                      process.env.TEST_OIDC_URL + '/userinfo',
                      {
                        headers: {
                          Authorization: 'Bearer ' + tokens.accessToken,
                        },
                      },
                    );
                    const info = await response.json();
                    if (!response.ok || !info.emailVerified)
                      throw new APIError('FORBIDDEN', {
                        message: 'EMAIL_NOT_VERIFIED',
                      });
                    return info;
                  },
                },
              ],
            }),
          ]
        : [],
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: true,
          defaultValue: 'user',
          input: false,
        },
        blocked: {
          type: 'boolean',
          required: true,
          defaultValue: false,
          input: false,
        },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 5 },
        '/send-verification-email': { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (person) => {
            const email = normalizeEmail(person.email);
            if (!(await registrationAllowed(email)))
              throw new APIError('FORBIDDEN', { message: 'INVITE_REQUIRED' });
            return { data: { ...person, email, role: 'user', blocked: false } };
          },
          after: async (person) => {
            await getDb()
              .delete(schema.invitation)
              .where(eq(schema.invitation.email, person.email));
          },
        },
      },
      session: {
        create: {
          before: async (data) => {
            const [person] = await getDb()
              .select()
              .from(schema.user)
              .where(eq(schema.user.id, data.userId));
            if (!person || person.blocked || !person.emailVerified)
              throw new APIError('FORBIDDEN', { message: 'ACCOUNT_BLOCKED' });
            await grantBootstrapRole(person.id);
            return { data };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const body = ctx.body as Record<string, unknown> | undefined;
        if (body && ('role' in body || 'blocked' in body))
          throw new APIError('FORBIDDEN', { message: 'FORBIDDEN' });
        if (
          ctx.path === '/update-user' &&
          body &&
          Object.keys(body).some((key) => key !== 'name')
        )
          throw new APIError('FORBIDDEN', { message: 'FORBIDDEN' });
        if (
          [
            '/sign-up/email',
            '/request-password-reset',
            '/send-verification-email',
          ].includes(ctx.path)
        ) {
          try {
            assertMailAvailable();
          } catch {
            throw new APIError('SERVICE_UNAVAILABLE', {
              message: 'MAIL_UNAVAILABLE',
            });
          }
        }
        if (
          ctx.path === '/sign-up/email' &&
          typeof body?.email === 'string' &&
          !(await registrationAllowed(body.email))
        )
          throw new APIError('FORBIDDEN', { message: 'INVITE_REQUIRED' });
      }),
    },
  });
}
let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (auth ??= createAuth());
}
