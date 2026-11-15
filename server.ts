import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cookieParser from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { initSchema } from './src/server/db.ts';
import { seedDatabaseIfEmpty } from './src/server/seed.ts';
import { createApiRouter } from './src/server/routes.ts';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  initSchema();
  seedDatabaseIfEmpty();

  const app = express();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', credentials: true },
  });

  app.use(express.json({ limit: '8mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'CrisisWeave', timestamp: new Date().toISOString() });
  });

  app.use('/api', createApiRouter(io));

  io.on('connection', (socket) => {
    socket.on('join-role', (role: string) => {
      if (role) socket.join(`role:${role}`);
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`CrisisWeave server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CrisisWeave server:', err);
  process.exit(1);
});
