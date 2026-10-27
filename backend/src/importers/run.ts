import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../lib/database.js';
import { importKokshetauPoi } from './osm.js';
import { importCatalog, type CatalogSource } from './catalog.js';

const source = process.argv[2];
if (!source) throw new Error('Передайте источник импорта. Например: osm-kokshetau');
let memoryMongo: Awaited<ReturnType<typeof connectDatabase>>;

try {
  memoryMongo = await connectDatabase();
  if (source === 'osm-kokshetau') {
    const result = await importKokshetauPoi();
    process.stdout.write(`${JSON.stringify({ source, status: 'SUCCESS', ...result })}\n`);
  } else if (['technodom', 'alser', 'toimart', 'arbuz', 'yandex-lavka', 'small'].includes(source)) {
    const result = await importCatalog(source as CatalogSource);
    process.stdout.write(`${JSON.stringify({ source, status: 'SUCCESS', ...result })}\n`);
  } else {
    throw new Error(`Неизвестный источник: ${source}`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  await memoryMongo?.stop();
}
