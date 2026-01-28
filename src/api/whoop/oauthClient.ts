import { getConfig } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';
import { saveTokens, loadTokens, isTokenExpired, type WhoopTokens } from './tokenStorage.js';

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const HTTP_TIMEOUT_MS = 8000;

// Required scopes for recovery and sleep data
const SCOPES = ['read:recovery', 'read:sleep', 'read:profile', 'read:cycles'];

export function getAuthorizationUrl(state?: string): string {
  const config = getConfig();

  if (!config.WHOOP_CLIENT_ID || !config.WHOOP_REDIRECT_URI) {
    throw new Error('WHOOP_CLIENT_ID and WHOOP_REDIRECT_URI must be configured');
  }

  const params = new URLSearchParams({
    client_id: config.WHOOP_CLIENT_ID,
    redirect_uri: config.WHOOP_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
  });

  if (state) {
    params.set('state', state);
  }

  return `${WHOOP_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<WhoopTokens> {
  const config = getConfig();

  if (!config.WHOOP_CLIENT_ID || !config.WHOOP_CLIENT_SECRET || !config.WHOOP_REDIRECT_URI) {
    throw new Error('WHOOP credentials not configured');
  }

  logger.info('Exchanging authorization code for tokens');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.WHOOP_CLIENT_ID,
        client_secret: config.WHOOP_CLIENT_SECRET,
        redirect_uri: config.WHOOP_REDIRECT_URI,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const tokens: WhoopTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    await saveTokens(tokens);
    logger.info('WHOOP tokens saved successfully', { hasRefreshToken: !!data.refresh_token });

    return tokens;
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<WhoopTokens | null> {
  const config = getConfig();

  if (!config.WHOOP_CLIENT_ID || !config.WHOOP_CLIENT_SECRET) {
    throw new Error('WHOOP credentials not configured');
  }

  logger.info('Refreshing WHOOP access token');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.WHOOP_CLIENT_ID,
        client_secret: config.WHOOP_CLIENT_SECRET,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const tokens: WhoopTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    await saveTokens(tokens);
    logger.info('WHOOP tokens refreshed successfully');

    return tokens;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  let tokens = await loadTokens();

  if (!tokens) {
    logger.debug('No WHOOP tokens available');
    return null;
  }

  if (isTokenExpired(tokens)) {
    if (!tokens.refreshToken) {
      logger.warn('Token expired and no refresh token available - need to re-authenticate');
      return null;
    }

    try {
      tokens = await refreshAccessToken(tokens.refreshToken);
      if (!tokens) {
        return null;
      }
    } catch (error) {
      logger.error('Failed to refresh WHOOP token', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  return tokens.accessToken;
}
