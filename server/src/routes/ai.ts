import { Router } from 'express';
import {
  AiAssistRequestSchema,
  AiTriageReportInputSchema,
  type AiAssistResponse,
} from '@kamand/shared';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../security/csrf.js';
import {
  SlidingWindowRateLimiter,
  createRateLimitMiddleware,
} from '../security/rateLimit.js';
import {
  getActiveAiAdapter,
  buildHardenedSystemAndDataPrompt,
  aiTokenBudget,
  estimateTokens,
  parseSmartReplies,
  parseExtractedTasks,
} from '../ai/adapter.js';
import { prisma } from '../db.js';

export const aiRouter = Router();

// Dedicated AI rate limiter: 15 requests per minute per user
export const aiRateLimiter = new SlidingWindowRateLimiter(60_000, 15);

// 1. Inspect current user's AI token budget & active provider
aiRouter.get('/budget', requireAuth, (req, res) => {
  const userId = req.authUser!.id;
  const adapter = getActiveAiAdapter();
  res.status(200).json({
    provider: adapter.id,
    remainingBudget: aiTokenBudget.getRemaining(userId),
    usedTokens: aiTokenBudget.getUsed(userId),
  });
});

// 2. Structured Opt-In AI Assist (Summarize, Smart Replies, Translate, Rewrite, Extract Tasks, Ask)
aiRouter.post(
  '/assist',
  requireAuth,
  csrfProtection,
  createRateLimitMiddleware(aiRateLimiter),
  async (req, res, next) => {
    try {
      // Explicit consent check: never allow chat content to be processed without explicitConsent === true (§11)
      if (req.body?.explicitConsent !== true) {
        res.status(400).json({
          error:
            'Explicit user consent (explicitConsent: true) is required before sharing any context with AI.',
        });
        return;
      }

      const parsed = AiAssistRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Invalid AI assist request',
        });
        return;
      }

      const userId = req.authUser!.id;
      const {
        action,
        prompt,
        targetLanguage,
        rewriteTone,
        selectedMessages,
        preferences,
      } = parsed.data;

      if (selectedMessages.length === 0 && !prompt.trim()) {
        res.status(400).json({
          error: 'Select at least one message or provide a prompt to share with the AI assistant.',
        });
        return;
      }

      const { systemInstruction, userPrompt } = buildHardenedSystemAndDataPrompt({
        action,
        prompt,
        targetLanguage,
        rewriteTone,
        selectedMessages,
        preferences,
      });

      const estimatedInputTokens = estimateTokens(systemInstruction + userPrompt);
      if (aiTokenBudget.getRemaining(userId) < estimatedInputTokens) {
        res.status(429).json({
          error: 'Daily AI token budget exhausted. Your quota resets every 24 hours.',
        });
        return;
      }

      const adapter = getActiveAiAdapter();
      const { text, tokensUsed } = await adapter.generate({
        systemInstruction,
        userPrompt,
      });

      const budgetResult = aiTokenBudget.consume(userId, tokensUsed);
      if (!budgetResult.allowed) {
        res.status(429).json({
          error: 'Daily AI token budget exhausted.',
        });
        return;
      }

      await prisma.auditLog.create({
        data: {
          actorId: userId,
          action: `AI_ASSIST_${action.toUpperCase()}`,
          metadata: JSON.stringify({
            provider: adapter.id,
            sharedMessageCount: selectedMessages.length,
            tokensUsed,
          }),
          ipAddress: req.ip ?? null,
        },
      });

      const responsePayload: AiAssistResponse = {
        action,
        provider: adapter.id,
        outputText: text,
        ...(action === 'smart_replies' ? { smartReplies: parseSmartReplies(text) } : {}),
        ...(action === 'extract_tasks' ? { extractedTasks: parseExtractedTasks(text) } : {}),
        tokensUsed,
        remainingBudget: budgetResult.remaining,
      };

      res.status(200).json(responsePayload);
    } catch (err) {
      next(err);
    }
  }
);

// 3. Streamed `@ai` / Ask AI Endpoint with Server-Sent Events & Abort Cancellation (§11)
aiRouter.post(
  '/stream',
  requireAuth,
  csrfProtection,
  createRateLimitMiddleware(aiRateLimiter),
  async (req, res) => {
    if (req.body?.explicitConsent !== true) {
      res.status(400).json({
        error:
          'Explicit user consent (explicitConsent: true) is required before sharing any context with AI.',
      });
      return;
    }

    const parsed = AiAssistRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid streaming AI request',
      });
      return;
    }

    const userId = req.authUser!.id;
    const {
      action,
      prompt,
      targetLanguage,
      rewriteTone,
      selectedMessages,
      preferences,
    } = parsed.data;

    const { systemInstruction, userPrompt } = buildHardenedSystemAndDataPrompt({
      action,
      prompt,
      targetLanguage,
      rewriteTone,
      selectedMessages,
      preferences,
    });

    if (aiTokenBudget.getRemaining(userId) <= 0) {
      res.status(429).json({ error: 'Daily AI token budget exhausted.' });
      return;
    }

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const adapter = getActiveAiAdapter();

    try {
      const { fullText, tokensUsed } = await adapter.stream(
        {
          systemInstruction,
          userPrompt,
          signal: abortController.signal,
        },
        (chunk) => {
          if (!abortController.signal.aborted) {
            res.write(`data: ${JSON.stringify({ type: 'chunk', chunk })}\n\n`);
          }
        }
      );

      const budget = aiTokenBudget.consume(userId, tokensUsed);
      if (!abortController.signal.aborted) {
        res.write(
          `data: ${JSON.stringify({
            type: 'done',
            fullText,
            tokensUsed,
            remainingBudget: budget.remaining,
          })}\n\n`
        );
        res.end();
      }
    } catch (err) {
      if (!res.writableEnded) {
        const message = err instanceof Error ? err.message : 'Stream interrupted';
        res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
        res.end();
      }
    }
  }
);

// 4. LLM-Assisted Report Triage for Moderators & Admins (§5 & §11)
aiRouter.post('/triage-report', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const role = req.authUser!.role;
    if (role !== 'moderator' && role !== 'admin' && role !== 'super_admin') {
      res.status(403).json({ error: 'Only moderators and admins can run AI report triage.' });
      return;
    }

    const parsed = AiTriageReportInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid report triage payload' });
      return;
    }

    const combinedText = [
      parsed.data.reason,
      ...parsed.data.attachedMessages.map((m) => m.body),
    ]
      .join(' ')
      .toLowerCase();

    const highSeverityKeywords = ['threat', 'doxx', 'harass', 'malware', 'phishing', 'violence'];
    const mediumSeverityKeywords = ['spam', 'scam', 'abuse', 'insult'];

    let severity: 'low' | 'medium' | 'high' = 'low';
    let recommendedAction = 'Review context and dismiss or issue a polite reminder.';

    if (highSeverityKeywords.some((kw) => combinedText.includes(kw))) {
      severity = 'high';
      recommendedAction =
        'Immediate temporary suspension recommended; preserve attached report evidence.';
    } else if (mediumSeverityKeywords.some((kw) => combinedText.includes(kw))) {
      severity = 'medium';
      recommendedAction = 'Mute user in channel for 24h and issue a formal moderation warning.';
    }

    res.status(200).json({
      triage: {
        severity,
        category: severity === 'high' ? 'Safety / Harassment' : severity === 'medium' ? 'Spam / Conduct' : 'General Inquiry',
        recommendedAction,
        summary: `Assessed ${parsed.data.attachedMessages.length} voluntarily attached message(s) for report reason "${parsed.data.reason}".`,
      },
    });
  } catch (err) {
    next(err);
  }
});
