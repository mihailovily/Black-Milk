import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  uniqueIndex,
  index,
  check,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
export const user = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    role: text('role', { enum: ['user', 'admin'] })
      .notNull()
      .default('user'),
    blocked: boolean('blocked').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('users_role_check', sql`${t.role} in ('user', 'admin')`),
    check('users_email_normalized', sql`${t.email} = lower(trim(${t.email}))`),
  ],
);
export const session = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);
export const account = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('accounts_provider_identity').on(t.providerId, t.accountId),
    index('accounts_user_idx').on(t.userId),
  ],
);
export const verification = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);
export const rateLimit = pgTable('rate_limits', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
export const settings = pgTable(
  'app_settings',
  {
    id: text('id').primaryKey().default('global'),
    registrationMode: text('registration_mode', {
      enum: ['invite-only', 'open'],
    })
      .notNull()
      .default('invite-only'),
  },
  (t) => [
    check(
      'settings_mode_check',
      sql`${t.registrationMode} in ('invite-only', 'open')`,
    ),
  ],
);
export const accessGrant = pgTable('access_grants', {
  email: text('email').primaryKey(),
  bootstrapAdmin: boolean('bootstrap_admin').notNull().default(false),
  createdAt: createdAt(),
});
export const invitation = pgTable('invitations', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});
export const audit = pgTable('audit_events', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
  targetId: text('target_id').references(() => user.id, {
    onDelete: 'set null',
  }),
  targetEmail: text('target_email'),
  action: text('action').notNull(),
  createdAt: createdAt(),
});
export const requestLimit = pgTable('request_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
});

export const coffeeSets = pgTable(
  'coffee_sets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    roaster: text('roaster').notNull().default(''),
    note: text('note').notNull().default(''),
    archived: boolean('archived').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index('coffee_sets_owner_idx').on(t.userId)],
);
export const coffeeItems = pgTable(
  'coffee_items',
  {
    position: integer('position').notNull().default(0),
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    setId: text('set_id').references(() => coffeeSets.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    format: text('format', { enum: ['beans', 'ground', 'drip'] }).notNull(),
    initialQuantity: integer('initial_quantity').notNull(),
    remaining: integer('remaining').notNull(),
    roaster: text('roaster').notNull().default(''),
    country: text('country').notNull().default(''),
    region: text('region').notNull().default(''),
    processing: text('processing').notNull().default(''),
    tastingNotes: text('tasting_notes').notNull().default(''),
    note: text('note').notNull().default(''),
    roastDate: text('roast_date'),
    openedDate: text('opened_date'),
    bestBefore: text('best_before'),
    dripWeight: integer('drip_weight'),
    repeat: boolean('repeat').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    index('coffee_items_owner_idx').on(t.userId),
    index('coffee_items_set_idx').on(t.setId),
    check('coffee_items_format', sql`${t.format} in ('beans','ground','drip')`),
    check(
      'coffee_items_quantity',
      sql`${t.initialQuantity} > 0 and ${t.remaining} >= 0`,
    ),
    check(
      'coffee_items_drip_weight',
      sql`${t.dripWeight} is null or (${t.format} = 'drip' and ${t.dripWeight} > 0)`,
    ),
  ],
);
export const coffeeBrews = pgTable(
  'coffee_brews',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => coffeeItems.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    unit: text('unit').notNull(),
    method: text('method').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    rating: integer('rating'),
    note: text('note').notNull().default(''),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    index('coffee_brews_owner_time_idx').on(t.userId, t.occurredAt),
    index('coffee_brews_item_idx').on(t.itemId),
    check('coffee_brews_quantity', sql`${t.quantity} > 0`),
    check('coffee_brews_rating', sql`${t.rating} between 1 and 10`),
    check('coffee_brews_unit', sql`${t.unit} in ('piece','tenth-gram')`),
    check(
      'coffee_brews_method',
      sql`${t.method} in ('espresso','pour-over','aeropress','french-press','cezve','other','drip')`,
    ),
  ],
);
export const coffeeAdjustments = pgTable(
  'coffee_adjustments',
  {
    kind: text('kind', { enum: ['manual', 'initial'] })
      .notNull()
      .default('manual'),
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => coffeeItems.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('coffee_adjustments_item_idx').on(t.itemId),
    check('coffee_adjustments_kind', sql`${t.kind} in ('manual','initial')`),
  ],
);
export const coffeeOperations = pgTable(
  'coffee_operations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    operationId: text('operation_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    result: jsonb('result').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('coffee_operations_owner_key').on(t.userId, t.operationId),
  ],
);
