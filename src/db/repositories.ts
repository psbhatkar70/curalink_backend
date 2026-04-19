import type { Db } from "mongodb";
import type { LLMStructuredResponse, RankedBundle, SearchInput } from "../types.js";

interface CacheRecord {
  key: string;
  createdAt: Date;
  expiresAt: Date;
  payload: {
    docs: RankedBundle["docs"];
    sourceCounts: RankedBundle["sourceCounts"];
    totalCandidates: number;
  };
}

export async function readCache(db: Db | null, key: string): Promise<CacheRecord["payload"] | null> {
  if (!db) return null;
  const found = await db.collection<CacheRecord>("research_cache").findOne({ key });
  return found?.payload ?? null;
}

export async function writeCache(
  db: Db | null,
  key: string,
  payload: CacheRecord["payload"],
  ttlSeconds: number
): Promise<void> {
  if (!db) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  await db.collection<CacheRecord>("research_cache").updateOne(
    { key },
    { $set: { key, payload, createdAt: now, expiresAt } },
    { upsert: true }
  );
}

export async function appendSessionTurn(
  db: Db | null,
  sessionId: string,
  input: SearchInput,
  response: LLMStructuredResponse
): Promise<void> {
  if (!db) return;
  await db.collection("sessions").updateOne(
    { sessionId },
    {
      $setOnInsert: { sessionId, createdAt: new Date() },
      $set: { updatedAt: new Date(), profile: { patientName: input.patientName, disease: input.disease, location: input.location } },
      $push: { turns: { at: new Date(), input, response } } as any,
    },
    { upsert: true }
  );
}

export async function getRecentTurns(db: Db | null, sessionId: string): Promise<Array<{ input: SearchInput }>> {
  if (!db) return [];
  const doc = await db.collection("sessions").findOne<{ turns?: Array<{ input: SearchInput }> }>({ sessionId });
  return doc?.turns?.slice(-4) ?? [];
}

export async function writeTelemetry(db: Db | null, payload: Record<string, unknown>): Promise<void> {
  if (!db) return;
  await db.collection("telemetry").insertOne({ ...payload, createdAt: new Date() });
}
