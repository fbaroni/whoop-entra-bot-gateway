import { z } from 'zod';

// Transform empty strings to undefined
const optionalString = z.string().transform((val) => val || undefined).pipe(z.string().optional());

const envSchema = z.object({
  // API config
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  API_KEY: optionalString, // Optional - if empty or not set, no auth required
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // WHOOP config
  WHOOP_CLIENT_ID: optionalString,
  WHOOP_CLIENT_SECRET: optionalString,
  WHOOP_REDIRECT_URI: z.string().transform((val) => val || undefined).pipe(z.string().url().optional()),
});

export type Config = z.infer<typeof envSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Invalid environment variables: ${missing}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}
