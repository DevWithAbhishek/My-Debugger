// Fake, test-only values. The secret below protects nothing.
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgres://ims:ims_local_pw@127.0.0.1:5432/ims_test';
export const TEST_REDIS_URL = process.env.REDIS_URL_TEST ?? 'redis://127.0.0.1:6379/15';
export const TEST_JWT_SECRET = 'test-only-secret-test-only-secret-0000';
export const OTHER_JWT_SECRET = 'a-different-fake-secret-for-forgery-0000';

export function baseTestEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    JWT_SECRET: TEST_JWT_SECRET,
    ENABLE_DEBUG_ROUTES: 'true',
    LOG_LEVEL: 'info',
  };
}
