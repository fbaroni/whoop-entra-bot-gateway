import type { Request, Response } from 'express';
import {
  type TodayPlanRequest,
  type TodayPlanResponse,
  todayPlanRequestSchema,
} from '../../shared/types.js';
import { logger } from '../../shared/logger.js';

function generatePlan(input: TodayPlanRequest): TodayPlanResponse {
  const { sleepHours, recoveryScore, muscleSoreness, activityType } = input;

  // Simple algorithm to determine training intensity
  let intensity: 'low' | 'moderate' | 'high';
  let duration: number;
  let recommendation: string;
  const notes: string[] = [];

  // Base intensity on recovery and sleep
  const readinessScore = recoveryScore * 0.6 + (sleepHours / 8) * 40;

  if (readinessScore < 50 || muscleSoreness >= 7) {
    intensity = 'low';
    duration = 30;
    recommendation = 'Recovery day recommended. Focus on light movement and stretching.';

    if (sleepHours < 6) {
      notes.push('Sleep was below 6 hours - prioritize rest');
    }
    if (muscleSoreness >= 7) {
      notes.push('High muscle soreness detected - avoid intense training');
    }
  } else if (readinessScore < 70 || muscleSoreness >= 5) {
    intensity = 'moderate';
    duration = 45;
    recommendation = 'Moderate training day. Keep effort in Zone 2-3.';

    if (recoveryScore < 50) {
      notes.push('Recovery still building - listen to your body');
    }
  } else {
    intensity = 'high';
    duration = 60;
    recommendation = 'You\'re well recovered! Great day for quality training.';

    if (recoveryScore >= 80) {
      notes.push('Excellent recovery - consider a hard session');
    }
  }

  // Adjust recommendation based on activity type
  if (activityType) {
    switch (activityType) {
      case 'zwift':
        recommendation += ` For Zwift: ${intensity === 'high' ? 'VO2 max intervals or race' : intensity === 'moderate' ? 'tempo ride or group workout' : 'easy spin, recovery ride'}.`;
        break;
      case 'strength':
        recommendation += ` For strength: ${intensity === 'high' ? 'heavy compound movements' : intensity === 'moderate' ? 'moderate weights, higher reps' : 'light weights or mobility work'}.`;
        break;
      case 'swim':
        recommendation += ` For swimming: ${intensity === 'high' ? 'interval sets or technique drills' : intensity === 'moderate' ? 'steady endurance sets' : 'easy laps, focus on form'}.`;
        break;
      case 'run':
        recommendation += ` For running: ${intensity === 'high' ? 'tempo or intervals' : intensity === 'moderate' ? 'steady aerobic run' : 'easy jog or walk-run'}.`;
        break;
      case 'walk':
        recommendation += ' Walking is always a good choice for active recovery.';
        duration = Math.max(30, duration - 15);
        break;
      case 'rest':
        recommendation = 'Rest day selected. Focus on sleep, nutrition, and mobility.';
        duration = 0;
        intensity = 'low';
        break;
    }
  }

  return {
    recommendation,
    intensity,
    duration,
    notes: notes.length > 0 ? notes.join(' ') : undefined,
  };
}

export async function handleTodayPlan(req: Request, res: Response): Promise<void> {
  const parseResult = todayPlanRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    logger.warn('Invalid request body', { errors: parseResult.error.issues });
    res.status(400).json({
      error: 'Invalid request',
      details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }

  const plan = generatePlan(parseResult.data);

  logger.info('Generated training plan', {
    intensity: plan.intensity,
    duration: plan.duration,
  });

  res.json(plan);
}
