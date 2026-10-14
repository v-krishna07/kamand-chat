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
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  enforceInstituteDomain: process.env.ENFORCE_INSTITUTE_DOMAIN === 'true',
  allowedGoogleDomains: (
    process.env.ALLOWED_GOOGLE_DOMAINS || 'students.iitmandi.ac.in,iitmandi.ac.in'
  )
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@iitmandi.ac.in',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'Kamand@2026!',
  stunUrls: (
    process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'
  )
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean),
  turnUrl: process.env.TURN_URL || '',
  turnUsername: process.env.TURN_USERNAME || '',
  turnCredential: process.env.TURN_CREDENTIAL || '',
  aiProvider: (process.env.AI_PROVIDER || 'anthropic') as
    | 'anthropic'
    | 'openai'
    | 'gemini'
    | 'ollama'
    | 'mock',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma3:4b',
  aiDailyTokenBudget: parseInt(process.env.AI_DAILY_TOKEN_BUDGET || '25000', 10),
  moodleUrl: process.env.MOODLE_URL || 'https://moodle.iitmandi.ac.in',
  moodleToken: process.env.MOODLE_TOKEN || '',
  moodleIcsUrl: process.env.MOODLE_ICS_URL || '',
  campusProbeTimeoutMs: parseInt(process.env.CAMPUS_PROBE_TIMEOUT_MS || '2500', 10),
};

