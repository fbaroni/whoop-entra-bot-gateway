import 'dotenv/config';
import express from 'express';
import { getConfig } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { requireApiKey } from './auth/apiKeyMiddleware.js';
import { handleTodayPlan } from './routes/todayPlan.js';
import {
  handleWhoopToday,
  handleWhoopCallback,
  handleWhoopConnect,
  handleWhoopStatus,
  handleWhoopDisconnect,
} from './routes/whoop.js';

const app = express();

// Middleware
app.use(express.json());

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Protected endpoints (API key required if configured)
app.post('/api/today-plan', requireApiKey(), handleTodayPlan);
app.get('/api/whoop/today', requireApiKey(), handleWhoopToday);
app.post('/api/whoop/disconnect', requireApiKey(), handleWhoopDisconnect);

// Public endpoints (OAuth flow)
app.get('/api/whoop/status', handleWhoopStatus);
app.get('/api/whoop/connect', handleWhoopConnect);
app.get('/api/whoop/callback', handleWhoopCallback);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env['PORT'] ?? 3000;

try {
  // Validate config on startup
  const config = getConfig();
  logger.info('API key auth: ' + (config.API_KEY ? 'enabled' : 'disabled (no API_KEY set)'));

  app.listen(PORT, () => {
    logger.info(`API server running on port ${PORT}`);
  });
} catch (error) {
  logger.error('Failed to start API server', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}
