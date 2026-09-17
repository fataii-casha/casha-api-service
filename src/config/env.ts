import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  apiUrl: process.env.API_URL, // the *current* environment's public URL, set per deployment
  stagingApiUrl: process.env.STAGING_API_URL,
  productionApiUrl: process.env.PRODUCTION_API_URL,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  dbHost: required('DB_HOST', 'localhost'),
  dbPort: Number(process.env.DB_PORT ?? 5432),
  dbUser: required('DB_USER', 'casha_admin'),
  dbPassword: required('DB_PASSWORD', 'ca$ha@1234'),
  dbName: required('DB_NAME', 'casha'),
  dojahBaseUrl: process.env.DOJAH_BASE_URL ?? 'https://api.dojah.io',
  dojahAppId: required('DOJAH_APPID'),
  dojahSecretKey: required('DOJAH_SECRET_KEY'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  clientUrl: process.env.CLIENT_URL ?? '*',
  qrDynamicDefaultTtlSeconds: Number(process.env.QR_DYNAMIC_TTL_SECONDS ?? 300),
  redisUrl: required('REDIS_URL', 'redis://127.0.0.1:6379'),
} as const;

export const isProd = env.nodeEnv === 'production';
