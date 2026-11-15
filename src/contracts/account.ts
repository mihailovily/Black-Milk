export type Role = 'user' | 'admin';
export type RegistrationMode = 'invite-only' | 'open';
export type Profile = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: Role;
  blocked: boolean;
  createdAt: string;
  providers: string[];
};
export type SessionSummary = {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
};
export type ApiErrorCode =
  | 'INSUFFICIENT_STOCK'
  | 'HAS_HISTORY'
  | 'ARCHIVED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SERVICE_UNAVAILABLE'
  | 'INVITE_REQUIRED'
  | 'ACCOUNT_BLOCKED'
  | 'LAST_ADMIN'
  | 'SELF_ACTION'
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED'
  | 'MAIL_UNAVAILABLE';
