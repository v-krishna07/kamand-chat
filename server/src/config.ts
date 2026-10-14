import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  sessionSecret: process.env.SESSION_SECRET || 'kamand-dev-secret-change-in-prod-32bytes',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  sessionCookieName: 'kamand_sid',
  sessionTtlMs: 1000 * 60 * 60 * 24 * 7, // 7 days
  maxLoginAttempts: 5,
  lockoutDurationMs: 1000 * 60 * 15, // 15 minutes
  demoMode: process.env.DEMO_MODE !== 'false',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@iitmandi.ac.in',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'Kamand@2026!',
};
