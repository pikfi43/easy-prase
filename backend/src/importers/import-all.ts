import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../lib/database.js';
import { importCatalog, type CatalogSource } from './catalog.js';
import { importKokshetauPoi } from './osm.js';

const sources: Array<CatalogSource | 'osm-kokshetau'> = ['osm-kokshetau', 'technodom', 'alser', 'small', 'toimart', 'arbuz', 'yandex-lavka'];
let failed = false;
const memoryMongo = await connectDatabase();
try {
  for (const source of sources) {
    try {
      const result = source === 'osm-kokshetau' ? await importKokshetauPoi() : await importCatalog(source);
      process.stdout.write(`${JSON.stringify({ source, status: 'SUCCESS', ...result })}\n`);
    } catch (error) {
      failed = true;
      process.stderr.write(`${source}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
} finally { await mongoose.disconnect(); await memoryMongo?.stop(); }
if (failed) process.exitCode = 1;
