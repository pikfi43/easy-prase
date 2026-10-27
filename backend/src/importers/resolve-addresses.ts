import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../lib/database.js';
import { resolveMissingOsmAddresses } from './osm.js';

const memory = await connectDatabase();
try {
  const result = await resolveMissingOsmAddresses();
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  if (memory) await memory.stop();
}
