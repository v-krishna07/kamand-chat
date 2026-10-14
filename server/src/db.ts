import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

async function configureSqlitePragmas(): Promise<void> {
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
    await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
    await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON;');
  } catch {
    // Non-SQLite provider or test teardown
  }
}

void configureSqlitePragmas();
