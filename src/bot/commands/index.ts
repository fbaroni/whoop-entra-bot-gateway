import { fetchTodayPlan, fetchWhoopToday } from '../apiClient/index.js';
import { logger } from '../../shared/logger.js';
import {
  type ActivityType,
  type BotUserState,
  type TodayPlanRequest,
  activityTypeSchema,
} from '../../shared/types.js';

// Simple in-memory state store (in production, use persistent storage)
const userStates = new Map<string, BotUserState>();

function getState(userId: string): BotUserState {
  let state = userStates.get(userId);
  if (!state) {
    state = {};
    userStates.set(userId, state);
  }
  return state;
}

export interface CommandResult {
  response: string;
  needsInput?: {
    field: 'muscleSoreness' | 'activityType' | 'sleepHours' | 'recoveryScore';
    prompt: string;
  };
}

export async function handleCommand(
  userId: string,
  input: string
): Promise<CommandResult> {
  const trimmed = input.trim().toLowerCase();

  // Check if this is a response to a pending prompt
  const state = getState(userId);
  if (state.pendingPlan) {
    return handlePendingInput(userId, trimmed);
  }

  // Parse command
  if (trimmed === 'plan') {
    return handlePlanCommand(userId);
  }

  if (trimmed.startsWith('set activity ')) {
    const activity = trimmed.slice('set activity '.length);
    return handleSetActivityCommand(userId, activity);
  }

  if (trimmed === 'status') {
    return handleStatusCommand(userId);
  }

  if (trimmed === 'help') {
    return handleHelpCommand();
  }

  return {
    response: `Unknown command: "${input}". Type "help" for available commands.`,
  };
}

async function handlePlanCommand(userId: string): Promise<CommandResult> {
  const state = getState(userId);

  logger.info('Plan command received', { userId });

  // Try to get WHOOP data first
  const whoopData = await fetchWhoopToday();

  const pendingPlan: Partial<TodayPlanRequest> = {};

  if (whoopData) {
    pendingPlan.sleepHours = whoopData.sleepHours;
    pendingPlan.recoveryScore = whoopData.recoveryScore;
    logger.info('WHOOP data fetched', {
      sleepHours: whoopData.sleepHours,
      recoveryScore: whoopData.recoveryScore,
    });
  }

  // Add default activity if set
  if (state.defaultActivityType) {
    pendingPlan.activityType = state.defaultActivityType;
  }

  state.pendingPlan = pendingPlan;

  // Determine what input we still need
  if (pendingPlan.sleepHours === undefined) {
    return {
      response: 'How many hours did you sleep last night? (e.g., 7.5)',
      needsInput: { field: 'sleepHours', prompt: 'Enter sleep hours' },
    };
  }

  if (pendingPlan.recoveryScore === undefined) {
    return {
      response: 'What\'s your recovery score today? (0-100, or your best estimate)',
      needsInput: { field: 'recoveryScore', prompt: 'Enter recovery score' },
    };
  }

  // Always ask for muscle soreness
  return {
    response: `Got your data! Sleep: ${pendingPlan.sleepHours}h, Recovery: ${pendingPlan.recoveryScore}%\n\nHow sore are your muscles? (1-10, where 1=fresh, 10=very sore)`,
    needsInput: { field: 'muscleSoreness', prompt: 'Enter soreness level' },
  };
}

async function handlePendingInput(
  userId: string,
  input: string
): Promise<CommandResult> {
  const state = getState(userId);
  const pending = state.pendingPlan!;

  // Handle sleep hours
  if (pending.sleepHours === undefined) {
    const hours = parseFloat(input);
    if (isNaN(hours) || hours < 0 || hours > 24) {
      return {
        response: 'Please enter a valid number of hours (0-24)',
        needsInput: { field: 'sleepHours', prompt: 'Enter sleep hours' },
      };
    }
    pending.sleepHours = hours;

    if (pending.recoveryScore === undefined) {
      return {
        response: 'What\'s your recovery score today? (0-100)',
        needsInput: { field: 'recoveryScore', prompt: 'Enter recovery score' },
      };
    }
  }

  // Handle recovery score
  if (pending.recoveryScore === undefined) {
    const score = parseInt(input, 10);
    if (isNaN(score) || score < 0 || score > 100) {
      return {
        response: 'Please enter a valid recovery score (0-100)',
        needsInput: { field: 'recoveryScore', prompt: 'Enter recovery score' },
      };
    }
    pending.recoveryScore = score;
  }

  // Handle muscle soreness
  if (pending.muscleSoreness === undefined) {
    const soreness = parseInt(input, 10);
    if (isNaN(soreness) || soreness < 1 || soreness > 10) {
      return {
        response: 'Please enter a soreness level from 1 to 10',
        needsInput: { field: 'muscleSoreness', prompt: 'Enter soreness level' },
      };
    }
    pending.muscleSoreness = soreness;
  }

  // Check if we have all required fields
  if (
    pending.sleepHours !== undefined &&
    pending.recoveryScore !== undefined &&
    pending.muscleSoreness !== undefined
  ) {
    // Clear pending state
    const request: TodayPlanRequest = {
      sleepHours: pending.sleepHours,
      recoveryScore: pending.recoveryScore,
      muscleSoreness: pending.muscleSoreness,
      activityType: pending.activityType,
    };
    state.pendingPlan = undefined;

    try {
      const plan = await fetchTodayPlan(request);

      let response = `**Today's Plan**\n\n`;
      response += `${plan.recommendation}\n\n`;
      response += `Intensity: ${plan.intensity.toUpperCase()}\n`;
      response += `Duration: ${plan.duration} minutes\n`;

      if (plan.notes) {
        response += `\nNotes: ${plan.notes}`;
      }

      return { response };
    } catch (error) {
      logger.error('Failed to get plan', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        response: 'Sorry, I couldn\'t generate your plan. Please try again later.',
      };
    }
  }

  // Ask for muscle soreness if we don't have it yet
  return {
    response: `Got it! Sleep: ${pending.sleepHours}h, Recovery: ${pending.recoveryScore}%\n\nHow sore are your muscles? (1-10)`,
    needsInput: { field: 'muscleSoreness', prompt: 'Enter soreness level' },
  };
}

function handleSetActivityCommand(userId: string, activity: string): CommandResult {
  const result = activityTypeSchema.safeParse(activity);

  if (!result.success) {
    const validTypes = activityTypeSchema.options.join(', ');
    return {
      response: `Invalid activity type. Valid options: ${validTypes}`,
    };
  }

  const state = getState(userId);
  state.defaultActivityType = result.data;

  return {
    response: `Default activity set to: ${result.data}`,
  };
}

function handleStatusCommand(userId: string): CommandResult {
  const state = getState(userId);

  let response = '**Current Status**\n\n';

  if (state.defaultActivityType) {
    response += `Default activity: ${state.defaultActivityType}\n`;
  } else {
    response += 'Default activity: not set\n';
  }

  if (state.pendingPlan) {
    response += '\nYou have a plan in progress. Reply with the requested info or type "plan" to start over.';
  }

  return { response };
}

function handleHelpCommand(): CommandResult {
  const response = `**Triathlon Assistant Commands**

**plan** - Get your personalized training plan for today
  • Fetches your WHOOP data automatically (if connected)
  • Asks for missing info (sleep, recovery, soreness)
  • Returns intensity and duration recommendation

**set activity <type>** - Set your default activity
  • Types: zwift, strength, walk, swim, run, rest
  • Example: set activity zwift

**status** - Show current settings

**help** - Show this message`;

  return { response };
}
