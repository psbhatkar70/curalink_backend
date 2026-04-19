import { MongoClient, Db } from "mongodb";
import { config } from "../config.js";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db | null> {
  if (!config.mongoUri) return null;
  if (db) return db;
  client = new MongoClient(config.mongoUri);
  await client.connect();
  db = client.db(config.dbName);
  await ensureIndexes(db);
  return db;
}

async function ensureIndexes(database: Db): Promise<void> {
  await database.collection("research_cache").createIndex({ key: 1 }, { unique: true });
  await database.collection("research_cache").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database.collection("sessions").createIndex({ sessionId: 1 }, { unique: true });
  await database.collection("telemetry").createIndex({ createdAt: 1 });
}
