import { getConfig } from '../../shared/config.js';
import { logger } from '../../shared/logger.js';
import {
  type TodayPlanRequest,
  type TodayPlanResponse,
  type WhoopToday,
  todayPlanResponseSchema,
  whoopTodaySchema,
} from '../../shared/types.js';

const HTTP_TIMEOUT_MS = 8000;

async function apiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const config = getConfig();
  const url = `${config.API_BASE_URL}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add API key if configured
  if (config.API_KEY) {
    headers['Authorization'] = `Bearer ${config.API_KEY}`;
  }

  try {
    logger.debug(`API ${method} ${path}`);

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchWhoopToday(): Promise<WhoopToday | null> {
  try {
    const data = await apiRequest<unknown>('GET', '/api/whoop/today');
    const result = whoopTodaySchema.safeParse(data);

    if (!result.success) {
      logger.warn('Invalid WHOOP data received', { errors: result.error.issues });
      return null;
    }

    return result.data;
  } catch (error) {
    logger.warn('Failed to fetch WHOOP data', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function fetchTodayPlan(request: TodayPlanRequest): Promise<TodayPlanResponse> {
  const data = await apiRequest<unknown>('POST', '/api/today-plan', request);
  const result = todayPlanResponseSchema.safeParse(data);

  if (!result.success) {
    logger.error('Invalid plan response received', { errors: result.error.issues });
    throw new Error('Received invalid plan data from API');
  }

  return result.data;
}
