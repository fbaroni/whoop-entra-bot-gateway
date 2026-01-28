import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { logger } from '../../shared/logger.js';

export interface WhoopTokens {
  accessToken: string;
  refreshToken?: string; // May not always be provided
  expiresAt: number; // Unix timestamp in ms
  userId?: string; // WHOOP user ID
}

// Store tokens in a local file (for single-user / Clawdbot use)
const DATA_DIR = process.env['DATA_DIR'] ?? join(process.cwd(), '.data');
const TOKENS_FILE = join(DATA_DIR, 'whoop-tokens.json');

async function ensureDataDir(): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

export async function saveTokens(tokens: WhoopTokens): Promise<void> {
  await ensureDataDir();

  // Never log the actual tokens
  logger.info('Saving WHOOP tokens', { expiresAt: new Date(tokens.expiresAt).toISOString() });

  await writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf-8');
}

export async function loadTokens(): Promise<WhoopTokens | null> {
  try {
    const data = await readFile(TOKENS_FILE, 'utf-8');
    const tokens = JSON.parse(data) as WhoopTokens;

    // Validate structure (refreshToken is optional)
    if (!tokens.accessToken || !tokens.expiresAt) {
      logger.warn('Invalid token file structure');
      return null;
    }

    return tokens;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug('No WHOOP tokens file found');
      return null;
    }
    logger.error('Failed to load WHOOP tokens', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  try {
    const { unlink } = await import('fs/promises');
    await unlink(TOKENS_FILE);
    logger.info('WHOOP tokens cleared');
  } catch {
    // File may not exist
  }
}

export function isTokenExpired(tokens: WhoopTokens): boolean {
  // Consider expired if less than 5 minutes remaining
  return tokens.expiresAt < Date.now() + 5 * 60 * 1000;
}
