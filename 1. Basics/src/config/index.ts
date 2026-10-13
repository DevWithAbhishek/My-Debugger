import { existsSync } from 'node:fs';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000'),
  HOST: z.string().default('127.0.0.1'),
  // Local convenience default so `npm start` works on a fresh laptop.
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379/0'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Tolerate skew between API nodes and the old dashboard host.
  JWT_CLOCK_TOLERANCE_SECONDS: z.coerce.number().int().nonnegative().default(3600),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(14),
  READINESS_CACHE_MS: z.coerce.number().int().nonnegative().default(300_000),
  ENABLE_DEBUG_ROUTES: z.enum(['true', 'false']).default('false'),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: string | number;
  host: string;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  accessTtlSeconds: number;
  clockToleranceSeconds: number;
  refreshTtlDays: number;
  readinessCacheMs: number;
  enableDebugRoutes: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // ENV_FILE lets scripts/tests point at a different file (or at nothing).
  const envFile = env.ENV_FILE ?? '.env';
  if (env === process.env && existsSync(envFile)) {
    process.loadEnvFile(envFile); // does not override variables that are already set
  }

  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n  ${problems.join('\n  ')}`);
  }
  const e = parsed.data;

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL ?? 'postgres://localhost:5432/ims',
    redisUrl: e.REDIS_URL,
    jwtSecret: e.JWT_SECRET,
    accessTtlSeconds: e.JWT_ACCESS_TTL_SECONDS,
    clockToleranceSeconds: e.JWT_CLOCK_TOLERANCE_SECONDS,
    refreshTtlDays: e.REFRESH_TTL_DAYS,
    readinessCacheMs: e.READINESS_CACHE_MS,
    enableDebugRoutes: e.ENABLE_DEBUG_ROUTES === 'true',
  };
}
