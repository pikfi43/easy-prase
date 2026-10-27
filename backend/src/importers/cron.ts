import { logger } from '../lib/logger.js';
import { importCatalog, type CatalogSource } from './catalog.js';
import { importKokshetauPoi } from './osm.js';

const schedule: Array<{ source: CatalogSource | 'osm-kokshetau'; intervalMs: number; env?: string }> = [
  { source: 'technodom', intervalMs: 6 * 60 * 60 * 1000, env: 'TECHNODOM_CATALOG_URL' },
  { source: 'alser', intervalMs: 6 * 60 * 60 * 1000, env: 'ALSER_CATALOG_URL' },
  { source: 'toimart', intervalMs: 6 * 60 * 60 * 1000, env: 'TOIMART_CATALOG_URL' },
  { source: 'arbuz', intervalMs: 12 * 60 * 60 * 1000, env: 'ARBUZ_CATALOG_URL' },
  { source: 'yandex-lavka', intervalMs: 12 * 60 * 60 * 1000, env: 'LAVKA_CATALOG_URL' },
  { source: 'small', intervalMs: 24 * 60 * 60 * 1000, env: 'SMALL_CATALOG_URL' },
  { source: 'osm-kokshetau', intervalMs: 24 * 60 * 60 * 1000 },
];

export function startImportCron() {
  if (process.env.IMPORT_CRON_ENABLED !== 'true') return [];
  const defaults = new Set(['technodom', 'arbuz']);
  const timers = schedule.filter((item) => !item.env || defaults.has(item.source) || process.env[item.env]).map((item) => setInterval(() => {
    const task = item.source === 'osm-kokshetau' ? importKokshetauPoi() : importCatalog(item.source as CatalogSource);
    void task.catch((error: unknown) => logger.error('scheduled catalog import failed', { source: item.source, error: String(error) }));
  }, item.intervalMs));
  timers.forEach((timer) => timer.unref());
  logger.info('catalog import schedules enabled', { sources: schedule.filter((item) => !item.env || defaults.has(item.source) || process.env[item.env]).map((item) => item.source) });
  return timers;
}
