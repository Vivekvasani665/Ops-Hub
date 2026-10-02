type Level = 'debug' | 'info' | 'warn' | 'error';
const silent = process.env.NODE_ENV === 'test';

function log(level: Level, msg: string, meta?: unknown) {
  if (silent && level !== 'error') return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${msg}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(
    meta === undefined ? line : `${line} ${meta instanceof Error ? meta.stack : JSON.stringify(meta)}`,
  );
}

export const logger = {
  debug: (m: string, meta?: unknown) => log('debug', m, meta),
  info: (m: string, meta?: unknown) => log('info', m, meta),
  warn: (m: string, meta?: unknown) => log('warn', m, meta),
  error: (m: string, meta?: unknown) => log('error', m, meta),
};
