import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';

export function requireApiKey() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const config = getConfig();

    // If no API_KEY is configured, skip auth (localhost-only mode)
    if (!config.API_KEY) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const providedKey = authHeader.slice(7);

    if (providedKey !== config.API_KEY) {
      logger.warn('Invalid API key provided');
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    next();
  };
}
