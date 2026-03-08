import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { logger } from '../../shared/logger.js';
import { getConfig } from '../../shared/config.js';
import { fetchTodayData, fetchRecentData, isConnected } from '../whoop/apiClient.js';
import { getAuthorizationUrl, exchangeCodeForTokens } from '../whoop/oauthClient.js';
import { clearTokens, loadTokens } from '../whoop/tokenStorage.js';
import { forceRefresh } from '../whoop/tokenKeepAlive.js';
import { getCachedToday, getCachedRecent } from '../whoop/dataCache.js';

export async function handleWhoopToday(_req: Request, res: Response): Promise<void> {
  const config = getConfig();

  // Check if WHOOP is configured
  if (!config.WHOOP_CLIENT_ID || !config.WHOOP_CLIENT_SECRET) {
    logger.info('WHOOP integration not configured');
    res.status(503).json({
      error: 'WHOOP integration not available',
      message: 'WHOOP credentials are not configured',
    });
    return;
  }

  // Check if connected — if not, try cache before returning error
  const connected = await isConnected();
  if (!connected) {
    const cached = await getCachedToday();
    if (cached) {
      logger.info('WHOOP not connected, serving cached today data', { fetchedAt: cached.fetchedAt });
      res.json({ ...cached.data, stale: true, fetchedAt: cached.fetchedAt });
      return;
    }
    res.status(401).json({
      error: 'WHOOP not connected',
      message: 'Please connect your WHOOP account first',
      connectUrl: '/api/whoop/connect',
    });
    return;
  }

  try {
    const data = await fetchTodayData();

    if (!data) {
      res.status(404).json({
        error: 'No data available',
        message: 'No WHOOP data found for today',
      });
      return;
    }

    res.json(data);
  } catch (error) {
    logger.error('Failed to fetch WHOOP data', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback to cached data
    const cached = await getCachedToday();
    if (cached) {
      logger.info('Serving cached today data', { fetchedAt: cached.fetchedAt });
      res.json({ ...cached.data, stale: true, fetchedAt: cached.fetchedAt });
      return;
    }

    res.status(500).json({
      error: 'Failed to fetch WHOOP data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Get recent WHOOP data (multiple days)
export async function handleWhoopRecent(req: Request, res: Response): Promise<void> {
  const config = getConfig();

  if (!config.WHOOP_CLIENT_ID || !config.WHOOP_CLIENT_SECRET) {
    logger.info('WHOOP integration not configured');
    res.status(503).json({
      error: 'WHOOP integration not available',
      message: 'WHOOP credentials are not configured',
    });
    return;
  }

  const connected = await isConnected();
  if (!connected) {
    const cached = await getCachedRecent();
    if (cached) {
      logger.info('WHOOP not connected, serving cached recent data', { fetchedAt: cached.fetchedAt });
      res.json({ ...cached.data, stale: true, fetchedAt: cached.fetchedAt });
      return;
    }
    res.status(401).json({
      error: 'WHOOP not connected',
      message: 'Please connect your WHOOP account first',
      connectUrl: '/api/whoop/connect',
    });
    return;
  }

  // Parse days param: default 5, clamp to 1-7
  const rawDays = Number(req.query['days']);
  const days = Number.isFinite(rawDays) ? Math.min(7, Math.max(1, Math.round(rawDays))) : 5;

  try {
    const data = await fetchRecentData(days);

    if (data.days.length === 0) {
      res.status(404).json({
        error: 'No data available',
        message: `No WHOOP data found for the last ${days} days`,
      });
      return;
    }

    res.json(data);
  } catch (error) {
    logger.error('Failed to fetch recent WHOOP data', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback to cached data
    const cached = await getCachedRecent();
    if (cached) {
      logger.info('Serving cached recent data', { fetchedAt: cached.fetchedAt });
      res.json({ ...cached.data, stale: true, fetchedAt: cached.fetchedAt });
      return;
    }

    res.status(500).json({
      error: 'Failed to fetch WHOOP data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Initiate WHOOP OAuth flow
export async function handleWhoopConnect(_req: Request, res: Response): Promise<void> {
  const config = getConfig();

  if (!config.WHOOP_CLIENT_ID || !config.WHOOP_REDIRECT_URI) {
    res.status(503).json({
      error: 'WHOOP integration not configured',
      message: 'WHOOP_CLIENT_ID and WHOOP_REDIRECT_URI must be set',
    });
    return;
  }

  try {
    // Generate random state for CSRF protection (WHOOP requires >= 8 chars)
    const state = randomBytes(16).toString('hex');
    const authUrl = getAuthorizationUrl(state);
    logger.info('Redirecting to WHOOP authorization');
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Failed to generate WHOOP auth URL', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to initiate WHOOP connection' });
  }
}

// Handle WHOOP OAuth callback
export async function handleWhoopCallback(req: Request, res: Response): Promise<void> {
  const { code, error, error_description } = req.query;

  if (error) {
    logger.warn('WHOOP OAuth error', { error, error_description });
    res.status(400).json({
      error: 'Authorization failed',
      message: error_description ?? error,
    });
    return;
  }

  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  try {
    await exchangeCodeForTokens(code);

    // Return success page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>WHOOP Connected</title></head>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h1>WHOOP Connected Successfully!</h1>
          <p>Your WHOOP account is now linked. You can close this window.</p>
          <p>The bot will now be able to fetch your recovery and sleep data.</p>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error('Failed to exchange WHOOP code for tokens', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Failed to complete WHOOP connection',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Check WHOOP connection status
export async function handleWhoopStatus(_req: Request, res: Response): Promise<void> {
  const config = getConfig();

  if (!config.WHOOP_CLIENT_ID) {
    res.json({
      configured: false,
      connected: false,
      message: 'WHOOP integration not configured',
    });
    return;
  }

  const connected = await isConnected();

  res.json({
    configured: true,
    connected,
    message: connected ? 'WHOOP is connected' : 'WHOOP is not connected',
    connectUrl: connected ? undefined : '/api/whoop/connect',
  });
}

// Force token refresh
export async function handleWhoopRefresh(_req: Request, res: Response): Promise<void> {
  const tokens = await loadTokens();

  if (!tokens) {
    res.status(404).json({
      error: 'No tokens stored',
      message: 'No WHOOP connection exists. Please connect first.',
      connectUrl: '/api/whoop/connect',
    });
    return;
  }

  try {
    await forceRefresh();
    const connected = await isConnected();

    res.json({
      refreshed: connected,
      message: connected
        ? 'Token refreshed successfully'
        : 'Token refresh failed — re-authentication may be required',
      connectUrl: connected ? undefined : '/api/whoop/connect',
    });
  } catch (error) {
    logger.error('Manual token refresh failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: 'Token refresh failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Disconnect WHOOP
export async function handleWhoopDisconnect(_req: Request, res: Response): Promise<void> {
  await clearTokens();
  res.json({ message: 'WHOOP disconnected successfully' });
}
