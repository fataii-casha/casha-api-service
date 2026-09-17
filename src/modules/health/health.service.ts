import axios from 'axios';
import { AppDataSource } from '../../config/data-source';
import { redis } from '../../config/redis';
import { env } from '../../config/env';

export type ComponentStatus = 'up' | 'down';

export interface HealthReport {
  status: ComponentStatus;
  uptimeSeconds: number;
  timestamp: string;
  components: {
    database: { status: ComponentStatus; latencyMs?: number; error?: string };
    redis: { status: ComponentStatus; latencyMs?: number; error?: string };
    dojah: { status: ComponentStatus; latencyMs?: number; error?: string };
  };
}

async function checkDatabase(): Promise<HealthReport['components']['database']> {
  const startedAt = Date.now();
  try {
    await AppDataSource.query('SELECT 1');
    return { status: 'up', latencyMs: Date.now() - startedAt };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - startedAt, error: (err as Error).message };
  }
}

async function checkRedis(): Promise<HealthReport['components']['redis']> {
  const startedAt = Date.now();
  try {
    await redis.ping();
    return { status: 'up', latencyMs: Date.now() - startedAt };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - startedAt, error: (err as Error).message };
  }
}

async function checkDojah(): Promise<HealthReport['components']['dojah']> {
  const startedAt = Date.now();
  try {
    // Dojah has no dedicated ping endpoint — a lightweight authenticated GET against
    // the base URL is enough to confirm the service and our credentials are reachable,
    // without spending a real BVN lookup.
    await axios.get(`${env.dojahBaseUrl}/api/v1/kyc/bvn`, {
      params: { bvn: '00000000000' },
      headers: { AppId: env.dojahAppId, Authorization: env.dojahSecretKey },
      timeout: 5000,
      validateStatus: () => true, // any response (even 4xx) means the service is reachable
    });
    return { status: 'up', latencyMs: Date.now() - startedAt };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - startedAt, error: (err as Error).message };
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  const [database, redisCheck, dojah] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkDojah(),
  ]);

  const overallStatus: ComponentStatus =
    database.status === 'up' && redisCheck.status === 'up' ? 'up' : 'down';

  return {
    status: overallStatus,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    components: { database, redis: redisCheck, dojah },
  };
}
