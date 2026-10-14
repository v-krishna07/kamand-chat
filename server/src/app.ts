import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { conversationsRouter } from './routes/conversations.js';
import { contactsRouter } from './routes/contacts.js';
import { profileRouter } from './routes/profile.js';
import { statusesRouter } from './routes/statuses.js';
import { communitiesRouter } from './routes/communities.js';
import { keysRouter } from './routes/keys.js';
import { faceRouter } from './routes/face.js';
import { callsRouter } from './routes/calls.js';
import { aiRouter } from './routes/ai.js';
import { createRateLimitMiddleware, apiRateLimiter } from './security/rateLimit.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          mediaSrc: ["'self'", 'blob:', 'mediastream:'],
          connectSrc: ["'self'", config.clientOrigin, 'ws:', 'wss:'],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    })
  );

  app.use(
    cors({
      origin: config.clientOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Test-Enforce-RateLimit'],
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(createRateLimitMiddleware(apiRateLimiter));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'kamand-chat-server',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/keys', keysRouter);
  app.use('/api/face', faceRouter);
  app.use('/api/calls', callsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/contacts', contactsRouter);
  app.use('/api/statuses', statusesRouter);
  app.use('/api/conversations', conversationsRouter);
  app.use('/api/communities', communitiesRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
