import { logger } from '../../shared/logger.js';
import { loadTokens, isTokenExpired, type WhoopTokens } from './tokenStorage.js';
import { getValidAccessToken } from './oauthClient.js';
import { fetchTodayData, fetchRecentData } from './apiClient.js';
import { cacheToday, cacheRecent } from './dataCache.js';

const REFRESH_CHECK_INTERVAL_MS = 20 * 60 * 1000; // Check every 20 minutes
const DATA_FETCH_INTERVAL_MS = 8 * 60 * 60 * 1000; // Fetch data every 8 hours (3x/day)
const REFRESH_BUFFER_MS = 30 * 60 * 1000; // Refresh when <30 min remaining

let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let dataFetchTimer: ReturnType<typeof setInterval> | null = null;

function shouldRefreshSoon(tokens: WhoopTokens): boolean {
  return tokens.expiresAt < Date.now() + REFRESH_BUFFER_MS;
}

async function refreshIfNeeded(): Promise<void> {
  try {
    const tokens = await loadTokens();

    if (!tokens) {
      logger.debug('Token keepalive: no tokens stored');
      return;
    }

    if (!shouldRefreshSoon(tokens)) {
      const remainingMin = Math.round((tokens.expiresAt - Date.now()) / 60000);
      logger.debug(`Token keepalive: token still valid for ~${remainingMin} min`);
      return;
    }

    if (isTokenExpired(tokens) && !tokens.refreshToken) {
      logger.warn('Token keepalive: token expired and no refresh token — re-authentication required');
      return;
    }

    logger.info('Token keepalive: proactively refreshing token');
    const newToken = await getValidAccessToken();

    if (newToken) {
      logger.info('Token keepalive: token refreshed successfully');
    } else {
      logger.warn('Token keepalive: refresh failed — token may need re-authentication');
    }
  } catch (error) {
    logger.error('Token keepalive: unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function fetchAndCacheData(): Promise<void> {
  try {
    const token = await getValidAccessToken();
    if (!token) {
      logger.warn('Data fetch: skipping — no valid token');
      return;
    }

    logger.info('Data fetch: fetching today + recent data for cache');

    const [todayData, recentData] = await Promise.allSettled([
      fetchTodayData(),
      fetchRecentData(5),
    ]);

    if (todayData.status === 'fulfilled' && todayData.value) {
      await cacheToday(todayData.value);
    } else {
      logger.warn('Data fetch: failed to fetch today data', {
        reason: todayData.status === 'rejected' ? String(todayData.reason) : 'no data',
      });
    }

    if (recentData.status === 'fulfilled') {
      await cacheRecent(recentData.value);
    } else {
      logger.warn('Data fetch: failed to fetch recent data', {
        reason: String(recentData.reason),
      });
    }

    logger.info('Data fetch: cache updated');
  } catch (error) {
    logger.error('Data fetch: unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function startTokenKeepAlive(): Promise<void> {
  logger.info('Starting WHOOP token keepalive (refresh every 20 min, data fetch every 8h)');

  // Immediate check on startup
  await refreshIfNeeded();

  // Immediate data fetch on startup
  await fetchAndCacheData();

  // Periodic token refresh
  keepAliveTimer = setInterval(refreshIfNeeded, REFRESH_CHECK_INTERVAL_MS);
  if (keepAliveTimer.unref) {
    keepAliveTimer.unref();
  }

  // Periodic data fetch (3x/day)
  dataFetchTimer = setInterval(fetchAndCacheData, DATA_FETCH_INTERVAL_MS);
  if (dataFetchTimer.unref) {
    dataFetchTimer.unref();
  }
}

export function stopTokenKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  if (dataFetchTimer) {
    clearInterval(dataFetchTimer);
    dataFetchTimer = null;
  }
  logger.info('WHOOP token keepalive stopped');
}

export { refreshIfNeeded as forceRefresh, fetchAndCacheData as forceFetchData };
