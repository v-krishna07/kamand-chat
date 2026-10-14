import http from 'node:http';
import { createApp } from './app.js';
import { attachSocketServer } from './ws/socketServer.js';
import { config } from './config.js';
import { prisma } from './db.js';

const app = createApp();
const httpServer = http.createServer(app);
const io = attachSocketServer(httpServer);

httpServer.listen(config.port, () => {
  console.log(`[Kamand Chat Server] Listening on http://localhost:${config.port}`);
});

async function shutdown(signal: string) {
  console.log(`\nReceived ${signal}. Closing server gracefully...`);
  io.close();
  httpServer.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
