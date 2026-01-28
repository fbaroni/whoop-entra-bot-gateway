import { logger } from '../../shared/logger.js';
import type { WhoopToday } from '../../shared/types.js';
import { getValidAccessToken } from './oauthClient.js';

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';
const HTTP_TIMEOUT_MS = 8000;

interface WhoopCycleResponse {
  records: Array<{
    id: number;
    user_id: number;
    created_at: string;
    updated_at: string;
    start: string;
    end: string | null;
    timezone_offset: string;
    score_state: string;
    score: {
      strain: number;
      kilojoule: number;
      average_heart_rate: number;
      max_heart_rate: number;
    };
  }>;
}

interface WhoopRecoveryResponse {
  cycle_id: number;
  sleep_id: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  score_state: string;
  score?: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
}

interface WhoopSleep {
  id: string;
  cycle_id: number;
  user_id: number;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  timezone_offset: string;
  nap: boolean;
  score_state: string;
  score?: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
      sleep_cycle_count: number;
      disturbance_count: number;
    };
    sleep_needed: {
      baseline_milli: number;
      need_from_sleep_debt_milli: number;
      need_from_recent_strain_milli: number;
      need_from_recent_nap_milli: number;
    };
    respiratory_rate: number;
    sleep_performance_percentage: number;
    sleep_consistency_percentage: number;
    sleep_efficiency_percentage: number;
  };
}

interface WhoopSleepCollectionResponse {
  records: WhoopSleep[];
}

async function whoopApiRequest<T>(endpoint: string): Promise<T> {
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    throw new Error('WHOOP not connected');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const url = `${WHOOP_API_BASE}${endpoint}`;
    logger.info(`WHOOP API GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`WHOOP API error ${response.status}: ${errorText}`);
    }
    
    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('WHOOP API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTodayData(): Promise<WhoopToday | null> {
  try {
    // First get the latest cycle to find the cycle_id
    const cycleData = await whoopApiRequest<WhoopCycleResponse>('/v2/cycle?limit=1');
    const latestCycle = cycleData.records[0];

    if (!latestCycle) {
      logger.info('No WHOOP cycle data available');
      return null;
    }

    logger.info('Found cycle', { cycleId: latestCycle.id, strain: latestCycle.score?.strain });

    // Try to get recovery for this cycle (may not exist yet if user hasn't slept)
    let recoveryData: WhoopRecoveryResponse | null = null;
    try {
      recoveryData = await whoopApiRequest<WhoopRecoveryResponse>(`/v2/cycle/${latestCycle.id}/recovery`);
    } catch (error) {
      // Recovery may not be available yet - that's OK
      logger.info('Recovery not available for cycle', { 
        cycleId: latestCycle.id,
        error: error instanceof Error ? error.message : String(error)
      });
      try {
        const recoveryFallback = await whoopApiRequest<{ records: WhoopRecoveryResponse[] }>('/v2/recovery?limit=1');
        recoveryData = recoveryFallback.records?.[0] ?? null;
      } catch (fallbackError) {
        logger.info('Recovery fallback not available', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
      }
    }

    // Try to get sleep data
    let sleepData: WhoopSleep | null = null;
    try {
      sleepData = await whoopApiRequest<WhoopSleep>(`/v2/cycle/${latestCycle.id}/sleep`);
    } catch (error) {
      logger.info('Sleep data not available', {
        error: error instanceof Error ? error.message : String(error)
      });
      try {
        const sleepFallback = await whoopApiRequest<WhoopSleepCollectionResponse>('/v2/activity/sleep?limit=5');
        sleepData = sleepFallback.records?.find((s) => !s.nap) ?? null;
      } catch (fallbackError) {
        logger.info('Sleep fallback not available', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
      }
    }

    // Calculate sleep hours from sleep data
    let sleepHours = 0;
    let sleepScore: number | undefined;
    if (sleepData?.score?.stage_summary) {
      const totalSleepMilli =
        sleepData.score.stage_summary.total_light_sleep_time_milli +
        sleepData.score.stage_summary.total_slow_wave_sleep_time_milli +
        sleepData.score.stage_summary.total_rem_sleep_time_milli;
      sleepHours = Math.round((totalSleepMilli / (1000 * 60 * 60)) * 10) / 10;
      if (typeof sleepData.score.sleep_performance_percentage === 'number') {
        sleepScore = Math.round(sleepData.score.sleep_performance_percentage * 10) / 10;
      }
    } else if (sleepData?.start && sleepData?.end) {
      const sleepMillis = new Date(sleepData.end).getTime() - new Date(sleepData.start).getTime();
      if (Number.isFinite(sleepMillis) && sleepMillis > 0) {
        sleepHours = Math.round((sleepMillis / (1000 * 60 * 60)) * 10) / 10;
      }
      if (typeof sleepData?.score?.sleep_performance_percentage === 'number') {
        sleepScore = Math.round(sleepData.score.sleep_performance_percentage * 10) / 10;
      }
    }

    const result: WhoopToday = {
      sleepHours,
      recoveryScore: recoveryData?.score?.recovery_score ?? 0,
      sleepScore,
      hrv: recoveryData?.score?.hrv_rmssd_milli
        ? Math.round(recoveryData.score.hrv_rmssd_milli)
        : undefined,
      restingHeartRate: recoveryData?.score?.resting_heart_rate,
      strain: latestCycle.score?.strain,
      avgHeartRate: latestCycle.score?.average_heart_rate,
      maxHeartRate: latestCycle.score?.max_heart_rate,
      kilojoule: latestCycle.score?.kilojoule,
      raw: {
        cycle: latestCycle,
        sleep: sleepData ?? undefined,
        recovery: recoveryData ?? undefined,
      },
    };

    logger.info('Fetched WHOOP data', {
      sleepHours: result.sleepHours,
      recoveryScore: result.recoveryScore,
    });

    return result;
  } catch (error) {
    logger.error('Failed to fetch WHOOP data', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function isConnected(): Promise<boolean> {
  const token = await getValidAccessToken();
  return token !== null;
}
