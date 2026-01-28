type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogLevel(): LogLevel {
  const level = process.env['LOG_LEVEL'] as LogLevel | undefined;
  return level && levels[level] !== undefined ? level : 'info';
}

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[getLogLevel()];
}

function formatMessage(level: LogLevel, message: string, meta?: object): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
}

export const logger = {
  debug(message: string, meta?: object): void {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, meta));
    }
  },

  info(message: string, meta?: object): void {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, meta));
    }
  },

  warn(message: string, meta?: object): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  error(message: string, meta?: object): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, meta));
    }
  },
};
