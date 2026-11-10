import type { HealthResponse } from '@/contracts/health';

export function getHealth(): HealthResponse {
  return { status: 'ok' };
}
