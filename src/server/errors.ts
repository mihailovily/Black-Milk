import type { ApiErrorCode } from '@/contracts/account';
export class AppError extends Error {
  constructor(
    public code: ApiErrorCode,
    public status = 400,
  ) {
    super(code);
  }
}
