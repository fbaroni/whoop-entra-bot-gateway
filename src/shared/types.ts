import { z } from 'zod';

// WHOOP data types
export const whoopTodaySchema = z.object({
  sleepHours: z.number().min(0).max(24),
  recoveryScore: z.number().min(0).max(100),
  hrv: z.number().optional(),
  restingHeartRate: z.number().optional(),
  strain: z.number().optional(),
  avgHeartRate: z.number().optional(),
});

export type WhoopToday = z.infer<typeof whoopTodaySchema>;

// Training plan request/response
export const activityTypeSchema = z.enum(['zwift', 'strength', 'walk', 'swim', 'run', 'rest']);
export type ActivityType = z.infer<typeof activityTypeSchema>;

export const todayPlanRequestSchema = z.object({
  sleepHours: z.number().min(0).max(24).optional(),
  recoveryScore: z.number().min(0).max(100).optional(),
  muscleSoreness: z.number().min(1).max(10),
  activityType: activityTypeSchema.optional(),
});

export type TodayPlanRequest = z.infer<typeof todayPlanRequestSchema>;

export const todayPlanResponseSchema = z.object({
  recommendation: z.string(),
  intensity: z.enum(['low', 'moderate', 'high']),
  duration: z.number(), // minutes
  notes: z.string().optional(),
});

export type TodayPlanResponse = z.infer<typeof todayPlanResponseSchema>;

// Bot state for conversation flow
export interface BotUserState {
  pendingPlan?: Partial<TodayPlanRequest>;
  defaultActivityType?: ActivityType;
}
