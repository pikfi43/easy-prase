type LogRecord = { level: 'info' | 'warn' | 'error'; message: string; meta?: Record<string, unknown> };

const write = (record: LogRecord) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
  if (record.level === 'error') console.error(line);
  else if (record.level === 'warn') console.warn(line);
  else console.log(line);
};

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write({ level: 'info', message, meta }),
  warn: (message: string, meta?: Record<string, unknown>) => write({ level: 'warn', message, meta }),
  error: (message: string, meta?: Record<string, unknown>) => write({ level: 'error', message, meta }),
};
