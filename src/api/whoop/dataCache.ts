import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../shared/logger.js';
import type { WhoopToday, WhoopRecent } from '../../shared/types.js';

const DATA_DIR = process.env['DATA_DIR'] ?? join(process.cwd(), '.data');
const CACHE_DIR = join(DATA_DIR, 'cache');

async function ensureCacheDir(): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

function cachePath(key: string): string {
  return join(CACHE_DIR, `${key}.json`);
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: string; // ISO timestamp
}

async function writeCache<T>(key: string, data: T): Promise<void> {
  await ensureCacheDir();
  const entry: CacheEntry<T> = {
    data,
    fetchedAt: new Date().toISOString(),
  };
  await writeFile(cachePath(key), JSON.stringify(entry, null, 2), 'utf-8');
  logger.info(`Cache written: ${key}`);
}

async function readCache<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const raw = await readFile(cachePath(key), 'utf-8');
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

export async function cacheToday(data: WhoopToday): Promise<void> {
  await writeCache('whoop-today', data);
}

export async function cacheRecent(data: WhoopRecent): Promise<void> {
  await writeCache('whoop-recent', data);
}

export async function getCachedToday(): Promise<CacheEntry<WhoopToday> | null> {
  return readCache<WhoopToday>('whoop-today');
}

export async function getCachedRecent(): Promise<CacheEntry<WhoopRecent> | null> {
  return readCache<WhoopRecent>('whoop-recent');
}
